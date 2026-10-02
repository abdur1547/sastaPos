package com.sastapos.sasta_pos.auth;

import com.sastapos.sasta_pos.user.User;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;


/**
 * Default {@link PasswordResetNotifier} for local/dev use. Replace with a real email/SMS provider
 * integration before shipping to production; this implementation only logs the token.
 */
@Component
@Slf4j
public class LoggingPasswordResetNotifier implements PasswordResetNotifier {

    @Override
    public void sendResetToken(final User user, final String rawToken) {
        log.info("Password reset requested for user {}. Reset token (dev-only log): {}", user.getEmail(), rawToken);
    }

}
