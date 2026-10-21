package com.sastapos.sasta_pos.config.logging;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.util.Collection;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.slf4j.event.Level;
import org.slf4j.spi.LoggingEventBuilder;
import org.springframework.http.MediaType;
import org.springframework.util.AntPathMatcher;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.util.ContentCachingRequestWrapper;
import org.springframework.web.util.ContentCachingResponseWrapper;


/**
 * Logs one line per HTTP exchange (method, path, status, duration, client) and, when enabled, headers and
 * request/response bodies with sensitive values masked. Also assigns a correlation id that is exposed in
 * the {@code requestId} MDC key and echoed back in the configured response header.
 */
public class HttpLoggingFilter extends OncePerRequestFilter {

    public static final String MDC_REQUEST_ID = "requestId";
    public static final String MDC_USER_ID = "userId";

    private static final Logger log = LoggerFactory.getLogger("com.sastapos.sasta_pos.http");
    private static final Pattern SAFE_REQUEST_ID = Pattern.compile("[A-Za-z0-9._-]{1,64}");
    private static final String MASK = "****";
    private static final List<MediaType> TEXTUAL_TYPES = List.of(
            MediaType.APPLICATION_JSON, MediaType.APPLICATION_PROBLEM_JSON, MediaType.APPLICATION_XML,
            MediaType.APPLICATION_FORM_URLENCODED, MediaType.TEXT_PLAIN, MediaType.TEXT_XML,
            MediaType.valueOf("application/*+json"));

    private final HttpLoggingProperties properties;
    private final AntPathMatcher pathMatcher = new AntPathMatcher();
    private final Set<String> maskedHeaders;
    private final Pattern maskedJsonFields;
    private final Pattern maskedQueryParams;

    public HttpLoggingFilter(final HttpLoggingProperties properties) {
        this.properties = properties;
        this.maskedHeaders = properties.maskedHeaders().stream()
                .map(header -> header.toLowerCase(Locale.ROOT))
                .collect(Collectors.toUnmodifiableSet());
        final String fields = properties.maskedFields().stream()
                .map(Pattern::quote)
                .collect(Collectors.joining("|"));
        this.maskedJsonFields = fields.isEmpty() ? null : Pattern.compile(
                "(\"(?:" + fields + ")\"\\s*:\\s*)(\"(?:[^\"\\\\]|\\\\.)*\"|[^,}\\]\\s]+)",
                Pattern.CASE_INSENSITIVE);
        this.maskedQueryParams = fields.isEmpty() ? null : Pattern.compile(
                "((?:^|&)(?:" + fields + ")=)[^&]*", Pattern.CASE_INSENSITIVE);
    }

    @Override
    protected void doFilterInternal(final HttpServletRequest request, final HttpServletResponse response,
            final FilterChain filterChain) throws ServletException, IOException {
        final String requestId = resolveRequestId(request);
        MDC.put(MDC_REQUEST_ID, requestId);
        response.setHeader(properties.requestIdHeader(), requestId);

        if (!properties.enabled() || isExcluded(request)) {
            try {
                filterChain.doFilter(request, response);
            } finally {
                MDC.remove(MDC_REQUEST_ID);
                MDC.remove(MDC_USER_ID);
            }
            return;
        }

        final HttpServletRequest requestToUse = properties.includeRequestBody()
                ? new ContentCachingRequestWrapper(request, properties.maxPayloadLength())
                : request;
        final HttpServletResponse responseToUse = properties.includeResponseBody()
                ? new ContentCachingResponseWrapper(response)
                : response;

        final long start = System.nanoTime();
        Throwable failure = null;
        try {
            filterChain.doFilter(requestToUse, responseToUse);
        } catch (IOException | ServletException | RuntimeException | Error ex) {
            failure = ex;
            throw ex;
        } finally {
            final long durationMs = (System.nanoTime() - start) / 1_000_000;
            try {
                logExchange(requestToUse, responseToUse, durationMs, failure);
            } catch (final RuntimeException loggingFailure) {
                log.warn("Failed to log HTTP exchange", loggingFailure);
            } finally {
                if (responseToUse instanceof ContentCachingResponseWrapper wrapper) {
                    wrapper.copyBodyToResponse();
                }
                MDC.remove(MDC_REQUEST_ID);
                MDC.remove(MDC_USER_ID);
            }
        }
    }

    private void logExchange(final HttpServletRequest request, final HttpServletResponse response,
            final long durationMs, final Throwable failure) {
        final int status = failure != null && response.getStatus() < 400
                ? HttpServletResponse.SC_INTERNAL_SERVER_ERROR
                : response.getStatus();
        final boolean slow = durationMs >= properties.slowRequestThreshold().toMillis();
        final Level level = status >= 500 ? Level.ERROR : status >= 400 || slow ? Level.WARN : Level.INFO;
        if (!log.isEnabledForLevel(level)) {
            return;
        }

        final String path = path(request);
        final StringBuilder message = new StringBuilder()
                .append(request.getMethod()).append(' ').append(path)
                .append(" -> ").append(status)
                .append(" (").append(durationMs).append(" ms)");
        if (slow) {
            message.append(" [SLOW]");
        }

        final LoggingEventBuilder event = log.atLevel(level)
                .addKeyValue("http.method", request.getMethod())
                .addKeyValue("http.path", path)
                .addKeyValue("http.status", status)
                .addKeyValue("http.duration_ms", durationMs);

        final String userId = MDC.get(MDC_USER_ID);
        if (userId != null) {
            message.append(" user=").append(userId);
        }
        if (properties.includeClientInfo()) {
            final String userAgent = request.getHeader("User-Agent");
            message.append(" client=").append(request.getRemoteAddr());
            event.addKeyValue("client.ip", request.getRemoteAddr());
            if (userAgent != null) {
                event.addKeyValue("user_agent", userAgent);
            }
        }
        if (failure != null) {
            message.append(" error=").append(failure.getClass().getSimpleName());
        }

        if (properties.includeHeaders()) {
            message.append("\n  request headers: ")
                    .append(formatHeaders(Collections.list(request.getHeaderNames()),
                            name -> Collections.list(request.getHeaders(name))));
            message.append("\n  response headers: ")
                    .append(formatHeaders(response.getHeaderNames(), response::getHeaders));
        }
        if (request instanceof ContentCachingRequestWrapper wrapper) {
            appendBody(message, "request body", wrapper.getContentAsByteArray(), wrapper.getContentType(),
                    wrapper.getCharacterEncoding());
        }
        if (response instanceof ContentCachingResponseWrapper wrapper) {
            appendBody(message, "response body", wrapper.getContentAsByteArray(), wrapper.getContentType(),
                    wrapper.getCharacterEncoding());
        }

        event.log(message.toString());
    }

    private String path(final HttpServletRequest request) {
        final String query = request.getQueryString();
        if (!properties.includeQueryString() || query == null) {
            return request.getRequestURI();
        }
        return request.getRequestURI() + '?'
                + (maskedQueryParams == null ? query : maskedQueryParams.matcher(query).replaceAll("$1" + MASK));
    }

    private String formatHeaders(final Collection<String> names,
            final Function<String, Collection<String>> values) {
        return names.stream()
                .distinct()
                .map(name -> name + "=" + (maskedHeaders.contains(name.toLowerCase(Locale.ROOT))
                        ? MASK
                        : String.join(",", values.apply(name))))
                .collect(Collectors.joining(", ", "{", "}"));
    }

    private void appendBody(final StringBuilder message, final String label, final byte[] content,
            final String contentType, final String encoding) {
        if (content.length == 0) {
            return;
        }
        message.append("\n  ").append(label).append(": ");
        if (!isTextual(contentType)) {
            message.append('[').append(content.length).append(" bytes of ").append(contentType).append(']');
            return;
        }
        final int length = Math.min(content.length, properties.maxPayloadLength());
        String body = new String(content, 0, length, charset(encoding));
        if (maskedJsonFields != null) {
            body = maskedJsonFields.matcher(body).replaceAll("$1\"" + MASK + "\"");
        }
        message.append(body);
        if (content.length > length) {
            message.append("... [truncated, ").append(content.length).append(" bytes total]");
        }
    }

    private boolean isTextual(final String contentType) {
        if (contentType == null) {
            return false;
        }
        try {
            final MediaType mediaType = MediaType.parseMediaType(contentType);
            return mediaType.getType().equals("text")
                    || TEXTUAL_TYPES.stream().anyMatch(type -> type.includes(mediaType));
        } catch (final IllegalArgumentException ex) {
            return false;
        }
    }

    private static Charset charset(final String encoding) {
        try {
            return encoding == null ? StandardCharsets.UTF_8 : Charset.forName(encoding);
        } catch (final IllegalArgumentException ex) {
            return StandardCharsets.UTF_8;
        }
    }

    private boolean isExcluded(final HttpServletRequest request) {
        final String path = request.getRequestURI().substring(request.getContextPath().length());
        return properties.excludedPaths().stream().anyMatch(pattern -> pathMatcher.match(pattern, path));
    }

    private String resolveRequestId(final HttpServletRequest request) {
        final String incoming = request.getHeader(properties.requestIdHeader());
        if (incoming != null && SAFE_REQUEST_ID.matcher(incoming).matches()) {
            return incoming;
        }
        return UUID.randomUUID().toString();
    }

}
