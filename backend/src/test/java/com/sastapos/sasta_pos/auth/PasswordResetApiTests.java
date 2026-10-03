package com.sastapos.sasta_pos.auth;

import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.JsonPath;
import com.sastapos.sasta_pos.auth.support.AuthApiTestBase;
import com.sastapos.sasta_pos.auth.support.TestDataFactory;
import com.sastapos.sasta_pos.store.RowStatus;
import com.sastapos.sasta_pos.user.User;
import java.time.OffsetDateTime;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;


class PasswordResetApiTests extends AuthApiTestBase {

    private static final String GENERIC_MESSAGE =
            "If an account exists for this email, password reset instructions have been sent.";

    // ---------- POST /api/auth/password-reset/request ----------

    @Test
    void shouldAcceptResetRequestForExistingActiveUser() {
        final String email = TestDataFactory.uniqueEmail();
        signupAndGetToken(TestDataFactory.personName(), email, TestDataFactory.validPassword());

        final ResponseEntity<String> response = requestReset(email);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.ACCEPTED);
        assertThat((String) JsonPath.read(response.getBody(), "$.message")).isEqualTo(GENERIC_MESSAGE);
        // The raw token must never appear in the API response
        assertThat(response.getBody()).doesNotContain(passwordResetNotifier.lastTokenFor(email));

        // Exactly one valid token was issued and delivered out of band
        assertThat(passwordResetNotifier.tokenCountFor(email)).isEqualTo(1);
        assertThat(passwordResetTokenRepository.count()).isEqualTo(1);
    }

    @Test
    void shouldStoreOnlyTokenHashNeverRawToken() {
        final String email = TestDataFactory.uniqueEmail();
        signupAndGetToken(TestDataFactory.personName(), email, TestDataFactory.validPassword());

        requestReset(email);

        final PasswordResetToken token = passwordResetTokenRepository.findAll().getFirst();
        assertThat(token.getTokenHash()).isNotBlank()
                .doesNotContain(passwordResetNotifier.lastTokenFor(email));
        assertThat(token.getExpiresAt()).isAfter(OffsetDateTime.now());
        assertThat(token.isUsed()).isFalse();
        assertThat(token.isRevoked()).isFalse();
    }

    @Test
    void shouldReturnSameResponseForUnknownEmailToPreventEnumeration() {
        final String email = TestDataFactory.uniqueEmail();

        final ResponseEntity<String> response = requestReset(email);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.ACCEPTED);
        assertThat((String) JsonPath.read(response.getBody(), "$.message")).isEqualTo(GENERIC_MESSAGE);
        assertThat(passwordResetTokenRepository.count()).isZero();
        assertThat(passwordResetNotifier.tokenCountFor(email)).isZero();
    }

    @Test
    void shouldReturnSameResponseForInactiveUserWithoutIssuingToken() {
        final String email = TestDataFactory.uniqueEmail();
        signupAndGetToken(TestDataFactory.personName(), email, TestDataFactory.validPassword());
        final User user = requireUserByEmail(email);
        user.setStatus(RowStatus.INACTIVE);
        userRepository.save(user);

        final ResponseEntity<String> response = requestReset(email);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.ACCEPTED);
        assertThat((String) JsonPath.read(response.getBody(), "$.message")).isEqualTo(GENERIC_MESSAGE);
        assertThat(passwordResetTokenRepository.count()).isZero();
    }

    @Test
    void shouldNormalizeEmailWhenRequestingReset() {
        final String email = TestDataFactory.uniqueEmail();
        signupAndGetToken(TestDataFactory.personName(), email, TestDataFactory.validPassword());

        assertThat(requestReset("  " + email.toUpperCase() + " ").getStatusCode())
                .isEqualTo(HttpStatus.ACCEPTED);

        assertThat(passwordResetTokenRepository.count()).isEqualTo(1);
    }

    @Test
    void shouldRevokeOutstandingTokensWhenRequestingResetAgain() {
        final String email = TestDataFactory.uniqueEmail();
        signupAndGetToken(TestDataFactory.personName(), email, TestDataFactory.validPassword());
        requestReset(email);
        final String firstToken = passwordResetNotifier.lastTokenFor(email);

        requestReset(email);

        // Two tokens persisted, but only the newest is still valid
        assertThat(passwordResetNotifier.tokenCountFor(email)).isEqualTo(2);
        assertThat(passwordResetTokenRepository.count()).isEqualTo(2);
        assertThat(passwordResetTokenRepository
                .findAllByUserIdAndUsedFalseAndRevokedFalse(requireUserByEmail(email).getId()))
                .hasSize(1);

        // The superseded token must no longer be accepted
        assertThat(completeReset(firstToken, TestDataFactory.validPassword()).getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void shouldRejectResetRequestWithMalformedEmail() {
        assertErrorResponse(requestReset("not-an-email"), HttpStatus.BAD_REQUEST);
    }

    @Test
    void shouldRejectResetRequestWithBlankEmail() {
        assertErrorResponse(requestReset(" "), HttpStatus.BAD_REQUEST);
    }

    // ---------- POST /api/auth/password-reset/complete ----------

    @Test
    void shouldCompleteResetWithValidToken() {
        final String email = TestDataFactory.uniqueEmail();
        final String oldPassword = TestDataFactory.validPassword();
        final String newPassword = TestDataFactory.validPassword();
        signupAndGetToken(TestDataFactory.personName(), email, oldPassword);
        requestReset(email);
        final String rawToken = passwordResetNotifier.lastTokenFor(email);

        final ResponseEntity<String> response = completeReset(rawToken, newPassword);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);

        // New password works, old password is gone
        assertThat(postJson(LOGIN_URL, loginJson(email, newPassword)).getStatusCode())
                .isEqualTo(HttpStatus.OK);
        assertThat(postJson(LOGIN_URL, loginJson(email, oldPassword)).getStatusCode())
                .isEqualTo(HttpStatus.UNAUTHORIZED);

        // Token is marked used
        assertThat(passwordResetTokenRepository.findAll().getFirst().isUsed()).isTrue();
    }

    @Test
    void shouldRejectTokenReplayAfterSuccessfulReset() {
        final String email = TestDataFactory.uniqueEmail();
        signupAndGetToken(TestDataFactory.personName(), email, TestDataFactory.validPassword());
        requestReset(email);
        final String rawToken = passwordResetNotifier.lastTokenFor(email);
        completeReset(rawToken, TestDataFactory.validPassword());

        final ResponseEntity<String> response = completeReset(rawToken, TestDataFactory.validPassword());

        assertErrorMessage(response, HttpStatus.BAD_REQUEST, "Invalid or expired token");
    }

    @Test
    void shouldRejectUnknownToken() {
        final ResponseEntity<String> response = completeReset("totally-made-up-token",
                TestDataFactory.validPassword());

        assertErrorMessage(response, HttpStatus.BAD_REQUEST, "Invalid or expired token");
    }

    @Test
    void shouldRejectExpiredToken() {
        final String email = TestDataFactory.uniqueEmail();
        final String password = TestDataFactory.validPassword();
        signupAndGetToken(TestDataFactory.personName(), email, password);
        requestReset(email);
        final String rawToken = passwordResetNotifier.lastTokenFor(email);
        final PasswordResetToken token = passwordResetTokenRepository.findAll().getFirst();
        token.setExpiresAt(OffsetDateTime.now().minusMinutes(1));
        passwordResetTokenRepository.save(token);

        final ResponseEntity<String> response = completeReset(rawToken, TestDataFactory.validPassword());

        assertErrorMessage(response, HttpStatus.BAD_REQUEST, "Invalid or expired token");
        // Password must be unchanged
        assertThat(postJson(LOGIN_URL, loginJson(email, password)).getStatusCode())
                .isEqualTo(HttpStatus.OK);
    }

    @Test
    void shouldRejectWeakNewPasswordButKeepTokenUsable() {
        final String email = TestDataFactory.uniqueEmail();
        signupAndGetToken(TestDataFactory.personName(), email, TestDataFactory.validPassword());
        requestReset(email);
        final String rawToken = passwordResetNotifier.lastTokenFor(email);

        assertErrorResponse(completeReset(rawToken, "weak"), HttpStatus.BAD_REQUEST);

        // Token is not consumed by a failed policy check: retrying with a valid password works
        assertThat(completeReset(rawToken, TestDataFactory.validPassword()).getStatusCode())
                .isEqualTo(HttpStatus.NO_CONTENT);
    }

    @Test
    void shouldNotAffectOtherUsersPasswords() {
        final String aliceEmail = TestDataFactory.uniqueEmail();
        final String bobEmail = TestDataFactory.uniqueEmail();
        final String bobPassword = TestDataFactory.validPassword();
        signupAndGetToken(TestDataFactory.personName(), aliceEmail, TestDataFactory.validPassword());
        signupAndGetToken(TestDataFactory.personName(), bobEmail, bobPassword);
        requestReset(aliceEmail);

        completeReset(passwordResetNotifier.lastTokenFor(aliceEmail), TestDataFactory.validPassword());

        assertThat(postJson(LOGIN_URL, loginJson(bobEmail, bobPassword)).getStatusCode())
                .isEqualTo(HttpStatus.OK);
    }

    @Test
    void shouldRejectBlankToken() {
        assertErrorResponse(completeReset(" ", TestDataFactory.validPassword()),
                HttpStatus.BAD_REQUEST);
    }

    @Test
    void shouldRejectBlankNewPassword() {
        assertErrorResponse(completeReset("some-token", ""), HttpStatus.BAD_REQUEST);
    }

    // ---------- helpers ----------

    private ResponseEntity<String> requestReset(final String email) {
        return postJson(PASSWORD_RESET_REQUEST_URL, """
                {"email": "%s"}""".formatted(email));
    }

    private ResponseEntity<String> completeReset(final String token, final String newPassword) {
        return postJson(PASSWORD_RESET_COMPLETE_URL, """
                {"token": "%s", "newPassword": "%s"}""".formatted(token, newPassword));
    }

}
