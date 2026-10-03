package com.sastapos.sasta_pos.auth;

import static org.assertj.core.api.Assertions.assertThat;

import com.sastapos.sasta_pos.auth.support.AuthApiTestBase;
import com.sastapos.sasta_pos.auth.support.TestDataFactory;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;


class LogoutApiTests extends AuthApiTestBase {

    @Test
    void shouldLogoutAuthenticatedUser() {
        final String token = signupAndGetToken(TestDataFactory.personName(),
                TestDataFactory.uniqueEmail(), TestDataFactory.validPassword());

        final ResponseEntity<String> response = logout(token);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        assertThat(response.getBody()).isNullOrEmpty();
    }

    @Test
    void shouldRejectLogoutWithoutToken() {
        final ResponseEntity<String> response = restTemplate.postForEntity(LOGOUT_URL, null, String.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void shouldRejectLogoutWithInvalidToken() {
        assertThat(logout("not.a.token").getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void logoutIsStatelessTokenRemainsUsableUntilExpiry() {
        // Auth is stateless JWT: logout is a client-side token discard. The server does not
        // revoke the token, so this spec documents that the token keeps working until expiry.
        final String token = signupAndGetToken(TestDataFactory.personName(),
                TestDataFactory.uniqueEmail(), TestDataFactory.validPassword());

        assertThat(logout(token).getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        assertThat(getJson(ME_URL, token).getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    private ResponseEntity<String> logout(final String token) {
        final HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(token);
        return restTemplate.exchange(LOGOUT_URL, HttpMethod.POST, new HttpEntity<>(headers), String.class);
    }

}
