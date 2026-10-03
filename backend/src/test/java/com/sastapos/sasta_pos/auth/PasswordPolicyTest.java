package com.sastapos.sasta_pos.auth;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.sastapos.sasta_pos.util.BadRequestException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;


/**
 * Pure unit tests for the password policy — no Spring context, no database.
 */
class PasswordPolicyTest {

    @Test
    void shouldAcceptValidPasswordAtMinimumBoundary() {
        assertThatCode(() -> PasswordPolicy.validate("abcd1234")).doesNotThrowAnyException();
    }

    @Test
    void shouldAcceptLongPasswordWithMixedCharacters() {
        assertThatCode(() -> PasswordPolicy.validate("a$uper-Strong_passw0rd!!"))
                .doesNotThrowAnyException();
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "short1",        // below the 8-character minimum
            "abcdefgh",      // no digit
            "12345678",      // no letter
            "1234567",       // too short AND no letter
    })
    void shouldRejectInvalidPasswords(final String password) {
        assertThatThrownBy(() -> PasswordPolicy.validate(password))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("Password must be at least");
    }

    @Test
    void shouldRejectNullPassword() {
        assertThatThrownBy(() -> PasswordPolicy.validate(null))
                .isInstanceOf(BadRequestException.class);
    }

}
