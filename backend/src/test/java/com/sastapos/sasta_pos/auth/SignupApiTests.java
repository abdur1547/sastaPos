package com.sastapos.sasta_pos.auth;

import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.JsonPath;
import com.sastapos.sasta_pos.auth.support.AuthApiTestBase;
import com.sastapos.sasta_pos.auth.support.TestDataFactory;
import com.sastapos.sasta_pos.user.User;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;


class SignupApiTests extends AuthApiTestBase {

    @Test
    void shouldCreateAccountAndReturnUsableTokenOnValidSignup() {
        final String name = TestDataFactory.personName();
        final String email = TestDataFactory.uniqueEmail();
        final String password = TestDataFactory.validPassword();

        final ResponseEntity<String> response = postJson(SIGNUP_URL, signupJson(name, email, password));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        final String body = response.getBody();
        assertThat(body).isNotNull();

        // Token payload: a bearer token with the configured lifetime
        assertThat((String) JsonPath.read(body, "$.accessToken")).isNotBlank();
        assertThat((String) JsonPath.read(body, "$.tokenType")).isEqualTo("Bearer");
        assertThat(((Number) JsonPath.read(body, "$.expiresIn")).longValue())
                .isEqualTo(JWT_EXPIRATION_SECONDS);

        // Embedded user profile, verified structurally
        final Map<String, Object> user = JsonPath.read(body, "$.user");
        assertThat(user.keySet())
                .containsExactlyInAnyOrder("id", "name", "email", "role", "status", "storeId");
        assertThat(user)
                .containsEntry("name", name)
                .containsEntry("email", email)
                .containsEntry("role", "CASHIER")
                .containsEntry("status", "ACTIVE")
                .containsEntry("storeId", null);
        assertThat((String) user.get("id")).isNotBlank();

        // No credential material may leak, however the DTO evolves
        assertNoSensitiveData(body);

        // The persisted user must hold a hash, not the raw password
        final User persisted = requireUserByEmail(email);
        assertThat(persisted.getPasswordHash()).isNotBlank().doesNotContain(password);

        // The issued token must be usable against an authenticated endpoint
        final String token = JsonPath.read(body, "$.accessToken");
        assertThat(getJson(ME_URL, token).getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    @Test
    void shouldNormalizeEmailOnSignup() {
        final String email = TestDataFactory.uniqueEmail();
        final String paddedMixedCase = "  " + email.toUpperCase() + "  ";

        final ResponseEntity<String> response = postJson(SIGNUP_URL,
                signupJson(TestDataFactory.personName(), paddedMixedCase, TestDataFactory.validPassword()));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        assertThat((String) JsonPath.read(response.getBody(), "$.user.email")).isEqualTo(email);
    }

    @Test
    void shouldRejectDuplicateEmail() {
        final String email = TestDataFactory.uniqueEmail();
        postJson(SIGNUP_URL, signupJson(TestDataFactory.personName(), email, TestDataFactory.validPassword()));

        final ResponseEntity<String> response = postJson(SIGNUP_URL,
                signupJson(TestDataFactory.personName(), email, TestDataFactory.validPassword()));

        assertErrorMessage(response, HttpStatus.CONFLICT, "An account with this email already exists");
        assertThat(userRepository.count()).isEqualTo(1);
    }

    @Test
    void shouldRejectDuplicateEmailIgnoringCase() {
        final String email = TestDataFactory.uniqueEmail();
        postJson(SIGNUP_URL, signupJson(TestDataFactory.personName(), email, TestDataFactory.validPassword()));

        final ResponseEntity<String> response = postJson(SIGNUP_URL,
                signupJson(TestDataFactory.personName(), email.toUpperCase(),
                        TestDataFactory.validPassword()));

        assertErrorMessage(response, HttpStatus.CONFLICT, "An account with this email already exists");
    }

    @Test
    void shouldRejectPasswordShorterThanEightCharacters() {
        final ResponseEntity<String> response = postJson(SIGNUP_URL, signupJson(
                TestDataFactory.personName(), TestDataFactory.uniqueEmail(), "abc123"));

        assertErrorResponse(response, HttpStatus.BAD_REQUEST);
        assertThat(userRepository.count()).isZero();
    }

    @Test
    void shouldRejectPasswordWithoutLetter() {
        final ResponseEntity<String> response = postJson(SIGNUP_URL, signupJson(
                TestDataFactory.personName(), TestDataFactory.uniqueEmail(), "12345678"));

        assertErrorResponse(response, HttpStatus.BAD_REQUEST);
    }

    @Test
    void shouldRejectPasswordWithoutDigit() {
        final ResponseEntity<String> response = postJson(SIGNUP_URL, signupJson(
                TestDataFactory.personName(), TestDataFactory.uniqueEmail(), "onlyletters"));

        assertErrorResponse(response, HttpStatus.BAD_REQUEST);
    }

    @Test
    void shouldAcceptPasswordExactlyEightCharactersWithLetterAndDigit() {
        final ResponseEntity<String> response = postJson(SIGNUP_URL, signupJson(
                TestDataFactory.personName(), TestDataFactory.uniqueEmail(), "abcd1234"));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
    }

    @Test
    void shouldRejectBlankName() {
        final ResponseEntity<String> response = postJson(SIGNUP_URL,
                signupJson(" ", TestDataFactory.uniqueEmail(), TestDataFactory.validPassword()));

        assertErrorResponse(response, HttpStatus.BAD_REQUEST);
    }

    @Test
    void shouldRejectMissingName() {
        final ResponseEntity<String> response = postJson(SIGNUP_URL,
                "{\"email\": \"%s\", \"password\": \"%s\"}"
                        .formatted(TestDataFactory.uniqueEmail(), TestDataFactory.validPassword()));

        assertErrorResponse(response, HttpStatus.BAD_REQUEST);
    }

    @Test
    void shouldRejectMalformedEmail() {
        final ResponseEntity<String> response = postJson(SIGNUP_URL,
                signupJson(TestDataFactory.personName(), "not-an-email", TestDataFactory.validPassword()));

        assertErrorResponse(response, HttpStatus.BAD_REQUEST);
    }

    @Test
    void shouldRejectBlankPassword() {
        final ResponseEntity<String> response = postJson(SIGNUP_URL,
                signupJson(TestDataFactory.personName(), TestDataFactory.uniqueEmail(), ""));

        assertErrorResponse(response, HttpStatus.BAD_REQUEST);
    }

    @Test
    void shouldRejectNameLongerThan255Characters() {
        final ResponseEntity<String> response = postJson(SIGNUP_URL, signupJson(
                "x".repeat(256), TestDataFactory.uniqueEmail(), TestDataFactory.validPassword()));

        assertErrorResponse(response, HttpStatus.BAD_REQUEST);
    }

    @Test
    void shouldRejectEmptyRequestBody() {
        final ResponseEntity<String> response = postJson(SIGNUP_URL, "");

        assertErrorResponse(response, HttpStatus.BAD_REQUEST);
    }

    @Test
    void shouldRejectMalformedJson() {
        final ResponseEntity<String> response = postJson(SIGNUP_URL, "{not valid json");

        assertErrorResponse(response, HttpStatus.BAD_REQUEST);
    }

}
