package com.sastapos.sasta_pos.config.logging;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;


@Configuration
@EnableConfigurationProperties(HttpLoggingProperties.class)
public class HttpLoggingConfig {

    @Bean
    public FilterRegistrationBean<HttpLoggingFilter> httpLoggingFilter(final HttpLoggingProperties properties) {
        final FilterRegistrationBean<HttpLoggingFilter> registration =
                new FilterRegistrationBean<>(new HttpLoggingFilter(properties));
        registration.addUrlPatterns("/*");
        // Run before Spring Security so rejected (401/403) requests are logged and carry a request id too.
        registration.setOrder(Ordered.HIGHEST_PRECEDENCE + 10);
        return registration;
    }

}
