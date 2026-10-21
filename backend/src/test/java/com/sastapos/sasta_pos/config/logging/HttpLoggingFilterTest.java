package com.sastapos.sasta_pos.config.logging;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.slf4j.MDC;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;


@ExtendWith(OutputCaptureExtension.class)
class HttpLoggingFilterTest {

    private static HttpLoggingProperties properties(final boolean enabled, final boolean verbose) {
        return new HttpLoggingProperties(enabled, "X-Request-Id", true, true, verbose, verbose, verbose, 1000,
                Duration.ofSeconds(2), List.of("/actuator/**"), List.of("authorization"),
                List.of("password", "token"));
    }

    private static MockHttpServletRequest loginRequest() {
        final MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/auth/login");
        request.setQueryString("token=abc&page=1");
        request.setContentType(MediaType.APPLICATION_JSON_VALUE);
        request.addHeader("Authorization", "Bearer secret-jwt");
        request.setContent("{\"email\":\"a@b.c\",\"password\":\"hunter2\"}".getBytes(StandardCharsets.UTF_8));
        return request;
    }

    private static MockFilterChain jsonChain(final int status, final String body) {
        return new MockFilterChain(new HttpServlet() {
            @Override
            protected void service(final HttpServletRequest req, final HttpServletResponse res) throws IOException {
                req.getInputStream().readAllBytes();
                res.setStatus(status);
                res.setContentType(MediaType.APPLICATION_JSON_VALUE);
                res.getWriter().write(body);
            }
        });
    }

    @Test
    void logsSummaryWithBodiesAndMasksSecrets(final CapturedOutput output) throws Exception {
        final MockHttpServletResponse response = new MockHttpServletResponse();
        final String responseBody = "{\"accessToken\":\"x\",\"token\":\"jwt-value\"}";

        new HttpLoggingFilter(properties(true, true)).doFilter(loginRequest(), response, jsonChain(200, responseBody));

        assertThat(response.getContentAsString()).isEqualTo(responseBody);
        assertThat(response.getHeader("X-Request-Id")).isNotBlank();
        assertThat(output.getOut()).contains("POST /api/auth/login?token=****&page=1 -> 200")
                .contains("Authorization=****")
                .contains("\"email\":\"a@b.c\"")
                .contains("\"password\":\"****\"")
                .contains("\"token\":\"****\"")
                .doesNotContain("hunter2", "secret-jwt", "jwt-value");
        assertThat(MDC.get(HttpLoggingFilter.MDC_REQUEST_ID)).isNull();
    }

    @Test
    void summaryOnlyByDefaultAndPropagatesIncomingRequestId(final CapturedOutput output) throws Exception {
        final MockHttpServletRequest request = loginRequest();
        request.addHeader("X-Request-Id", "client-123");
        final MockHttpServletResponse response = new MockHttpServletResponse();

        new HttpLoggingFilter(properties(true, false)).doFilter(request, response, jsonChain(404, "{}"));

        assertThat(response.getHeader("X-Request-Id")).isEqualTo("client-123");
        assertThat(output.getOut()).contains("WARN").contains("-> 404").doesNotContain("request body", "headers:");
    }

    @Test
    void logsServerErrorWhenChainThrows(final CapturedOutput output) {
        final MockFilterChain failing = new MockFilterChain(new HttpServlet() {
            @Override
            protected void service(final HttpServletRequest req, final HttpServletResponse res) {
                throw new IllegalStateException("boom");
            }
        });

        assertThatThrownBy(() -> new HttpLoggingFilter(properties(true, false))
                .doFilter(new MockHttpServletRequest("GET", "/api/sales"), new MockHttpServletResponse(), failing))
                .isInstanceOf(IllegalStateException.class);
        assertThat(output.getOut()).contains("ERROR").contains("GET /api/sales -> 500")
                .contains("error=IllegalStateException");
    }

    @Test
    void skipsExcludedPathsAndDisabledLogging(final CapturedOutput output) throws Exception {
        new HttpLoggingFilter(properties(true, true)).doFilter(
                new MockHttpServletRequest("GET", "/actuator/health"), new MockHttpServletResponse(),
                jsonChain(200, "{}"));
        new HttpLoggingFilter(properties(false, true)).doFilter(
                new MockHttpServletRequest("GET", "/api/products"), new MockHttpServletResponse(),
                jsonChain(200, "{}"));

        assertThat(output.getOut()).doesNotContain("/actuator/health ->", "/api/products ->");
    }

}
