package com.sastapos.sasta_pos.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.filter.CommonsRequestLoggingFilter;

@Configuration
public class RequestLoggingConfig {

  @Bean
  public CommonsRequestLoggingFilter logFilter() {
    CommonsRequestLoggingFilter filter = new CommonsRequestLoggingFilter();

    filter.setIncludeQueryString(true);
    filter.setIncludePayload(true); // Logs the request body
    filter.setMaxPayloadLength(10000); // Caps payload size to log (in bytes)
    filter.setIncludeHeaders(false); // Set to true if you need request headers
    filter.setIncludeClientInfo(true); // Logs client IP and session ID

    return filter;
  }
}