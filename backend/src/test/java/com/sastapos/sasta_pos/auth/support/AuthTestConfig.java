package com.sastapos.sasta_pos.auth.support;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;


/**
 * Replaces the dev {@code LoggingPasswordResetNotifier} with a recording double for all auth
 * end-to-end specs. Raw reset tokens must never be exposed by the API, so the only way to drive
 * the complete-reset flow in tests is to capture what the notifier would have sent out of band.
 */
@TestConfiguration
public class AuthTestConfig {

    @Bean
    @Primary
    public RecordingPasswordResetNotifier recordingPasswordResetNotifier() {
        return new RecordingPasswordResetNotifier();
    }

}
