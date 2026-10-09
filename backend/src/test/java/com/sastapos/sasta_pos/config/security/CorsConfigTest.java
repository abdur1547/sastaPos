package com.sastapos.sasta_pos.config.security;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;


class CorsConfigTest {

    private final CorsConfig corsConfig = new CorsConfig();

    @Test
    void shouldAllowOnlyConfiguredOrigins() {
        final CorsConfigurationSource source =
                corsConfig.corsConfigurationSource("https://pos.example.com, https://admin.example.com");
        final CorsConfiguration configuration = source.getCorsConfiguration(request());

        assertThat(configuration).isNotNull();
        assertThat(configuration.checkOrigin("https://pos.example.com")).isEqualTo("https://pos.example.com");
        assertThat(configuration.checkOrigin("https://admin.example.com")).isEqualTo("https://admin.example.com");
        assertThat(configuration.checkOrigin("https://unlisted.example.com")).isNull();
    }

    @Test
    void shouldDenyEveryOriginWhenAllowlistIsEmpty() {
        final CorsConfigurationSource source = corsConfig.corsConfigurationSource("");

        assertThat(source.getCorsConfiguration(request()).checkOrigin("https://pos.example.com")).isNull();
    }

    @Test
    void shouldAllowAllOriginsWhenWildcardIsConfigured() {
        final CorsConfigurationSource source = corsConfig.corsConfigurationSource("*");

        assertThat(source.getCorsConfiguration(request()).checkOrigin("https://pos.example.com")).isNotNull();
    }

    private static MockHttpServletRequest request() {
        final MockHttpServletRequest request = new MockHttpServletRequest();
        request.setRequestURI("/api/products");
        return request;
    }

}
