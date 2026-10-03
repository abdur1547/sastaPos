package com.sastapos.sasta_pos.auth;

import static org.assertj.core.api.Assertions.assertThat;

import com.sastapos.sasta_pos.auth.support.AuthApiTestBase;
import com.sastapos.sasta_pos.auth.support.TestDataFactory;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;


class ChangePasswordApiTests extends AuthApiTestBase {

    @Test
    void shouldChangePasswordAndAllowLoginWithNewPassword() {
        final String email = TestDataFactory.uniqueEmail();
        final String currentPassword = TestDataFactory.validPassword();
        final String newPassword = TestDataFactory.validPassword();
        final String token = signupAndGetToken(TestDataFactory.personName(), email, currentPassword);

        final ResponseEntity<String> response = changePassword(token, currentPassword, newPassword);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);

        // Old password must no longer work, new password must work
        assertThat(postJson(LOGIN_URL, loginJson(email, currentPassword)).getStatusCode())
                .isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(postJson(LOGIN_URL, loginJson(email, newPassword)).getStatusCode())
                .isEqualTo(HttpStatus.OK);
    }

    @Test
    void shouldKeepExistingTokenValidAfterPasswordChange() {
        // Stateless JWT: changing the password does not revoke previously issued tokens.
        final String currentPassword = TestDataFactory.validPassword();
        final String token = signupAndGetToken(TestDataFactory.personName(),
                TestDataFactory.uniqueEmail(), currentPassword);

        changePassword(token, currentPassword, TestDataFactory.validPassword());

        assertThat(getJson(ME_URL, token).getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    @Test
    void shouldRejectWrongCurrentPassword() {
        final String email = TestDataFactory.uniqueEmail();
        final String currentPassword = TestDataFactory.validPassword();
        final String token = signupAndGetToken(TestDataFactory.personName(), email, currentPassword);

        final ResponseEntity<String> response = changePassword(token,
                TestDataFactory.validPassword(), TestDataFactory.validPassword());

        assertErrorMessage(response, HttpStatus.UNAUTHORIZED, "Current password is incorrect");
        // Password must be unchanged
        assertThat(postJson(LOGIN_URL, loginJson(email, currentPassword)).getStatusCode())
                .isEqualTo(HttpStatus.OK);
    }

    @Test
    void shouldRejectNewPasswordEqualToCurrentPassword() {
        final String currentPassword = TestDataFactory.validPassword();
        final String token = signupAndGetToken(TestDataFactory.personName(),
                TestDataFactory.uniqueEmail(), currentPassword);

        final ResponseEntity<String> response = changePassword(token, currentPassword, currentPassword);

        assertErrorMessage(response, HttpStatus.BAD_REQUEST,
                "New password must be different from the current password");
    }

    @Test
    void shouldRejectWeakNewPassword() {
        final String email = TestDataFactory.uniqueEmail();
        final String currentPassword = TestDataFactory.validPassword();
        final String token = signupAndGetToken(TestDataFactory.personName(), email, currentPassword);

        final ResponseEntity<String> response = changePassword(token, currentPassword, "weak");

        assertErrorResponse(response, HttpStatus.BAD_REQUEST);
        assertThat(postJson(LOGIN_URL, loginJson(email, currentPassword)).getStatusCode())
                .isEqualTo(HttpStatus.OK);
    }

    @Test
    void shouldRejectUnauthenticatedRequest() {
        final ResponseEntity<String> response = postJson(CHANGE_PASSWORD_URL,
                changePasswordJson(TestDataFactory.validPassword(), TestDataFactory.validPassword()));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void shouldRejectBlankFields() {
        final String token = signupAndGetToken(TestDataFactory.personName(),
                TestDataFactory.uniqueEmail(), TestDataFactory.validPassword());

        final ResponseEntity<String> response = changePassword(token, "", " ");

        assertErrorResponse(response, HttpStatus.BAD_REQUEST);
    }

    private ResponseEntity<String> changePassword(final String token, final String currentPassword,
            final String newPassword) {
        return postJson(CHANGE_PASSWORD_URL, changePasswordJson(currentPassword, newPassword), token);
    }

    private static String changePasswordJson(final String currentPassword, final String newPassword) {
        return """
                {"currentPassword": "%s", "newPassword": "%s"}""".formatted(currentPassword, newPassword);
    }

}
