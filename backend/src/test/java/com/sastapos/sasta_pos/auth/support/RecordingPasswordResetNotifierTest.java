package com.sastapos.sasta_pos.auth.support;

import static org.assertj.core.api.Assertions.assertThat;

import com.sastapos.sasta_pos.user.User;
import org.junit.jupiter.api.Test;


/**
 * Pure unit tests for the recording notifier test double — no Spring context, no database.
 */
class RecordingPasswordResetNotifierTest {

    private final RecordingPasswordResetNotifier notifier = new RecordingPasswordResetNotifier();

    @Test
    void shouldRecordTokensPerEmail() {
        notifier.sendResetToken(user("alice@example.com"), "token-a1");
        notifier.sendResetToken(user("alice@example.com"), "token-a2");
        notifier.sendResetToken(user("bob@example.com"), "token-b1");

        assertThat(notifier.tokenCountFor("alice@example.com")).isEqualTo(2);
        assertThat(notifier.tokenCountFor("bob@example.com")).isEqualTo(1);
        assertThat(notifier.lastTokenFor("alice@example.com")).isEqualTo("token-a2");
        assertThat(notifier.lastTokenFor("bob@example.com")).isEqualTo("token-b1");
    }

    @Test
    void shouldNormalizeEmailCaseAndWhitespace() {
        notifier.sendResetToken(user("Alice@Example.com"), "token-1");

        assertThat(notifier.lastTokenFor("  ALICE@example.COM ")).isEqualTo("token-1");
    }

    @Test
    void shouldReturnNullAndZeroForUnknownEmail() {
        assertThat(notifier.lastTokenFor("ghost@example.com")).isNull();
        assertThat(notifier.tokenCountFor("ghost@example.com")).isZero();
    }

    @Test
    void shouldClearStateOnReset() {
        notifier.sendResetToken(user("alice@example.com"), "token-1");

        notifier.reset();

        assertThat(notifier.tokenCountFor("alice@example.com")).isZero();
    }

    private static User user(final String email) {
        final User user = new User();
        user.setEmail(email);
        return user;
    }

}
