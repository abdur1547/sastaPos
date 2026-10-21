package com.sastapos.sasta_pos.config.logging;

import java.time.Duration;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;


/**
 * HTTP request/response logging settings bound from {@code app.logging.http.*}.
 * Defaults are production-safe: one summary line per request, no headers or bodies.
 */
@ConfigurationProperties(prefix = "app.logging.http")
public record HttpLoggingProperties(
        @DefaultValue("true") boolean enabled,
        @DefaultValue("X-Request-Id") String requestIdHeader,
        @DefaultValue("true") boolean includeQueryString,
        @DefaultValue("true") boolean includeClientInfo,
        @DefaultValue("false") boolean includeHeaders,
        @DefaultValue("false") boolean includeRequestBody,
        @DefaultValue("false") boolean includeResponseBody,
        @DefaultValue("2048") int maxPayloadLength,
        @DefaultValue("2s") Duration slowRequestThreshold,
        @DefaultValue({"/actuator/**", "/swagger-ui/**", "/swagger-ui.html", "/v3/api-docs/**", "/favicon.ico"})
        List<String> excludedPaths,
        @DefaultValue({"authorization", "cookie", "set-cookie", "proxy-authorization", "x-api-key"})
        List<String> maskedHeaders,
        @DefaultValue({"password", "currentPassword", "newPassword", "confirmPassword", "token", "accessToken",
                "refreshToken", "resetToken", "secret", "apiKey"})
        List<String> maskedFields) {

    public boolean includeBodies() {
        return includeRequestBody || includeResponseBody;
    }

}
