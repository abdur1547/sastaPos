package com.sastapos.sasta_pos.auth;

import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.JsonPath;
import com.sastapos.sasta_pos.auth.support.AuthApiTestBase;
import com.sastapos.sasta_pos.auth.support.TestDataFactory;
import com.sastapos.sasta_pos.store.RowStatus;
import com.sastapos.sasta_pos.user.User;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import java.nio.charset.StandardCharsets;
import javax.crypto.SecretKey;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;


class LoginApiTests extends AuthApiTestBase {

    @Value("${app.jwt.secret}")
    private String jwtSecret;

    @Test
    void shouldLoginWithValidCredentialsAndReturnUsableToken() {
        final String email = TestDataFactory.uniqueEmail();
        final String password = TestDataFactory.validPassword();
        signupAndGetToken(TestDataFactory.personName(), email, password);

        final ResponseEntity<String> response = postJson(LOGIN_URL, loginJson(email, password));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        final String body = response.getBody();
        assertThat(body).isNotNull();
        assertThat((String) JsonPath.read(body, "$.accessToken")).isNotBlank();
        assertThat((String) JsonPath.read(body, "$.tokenType")).isEqualTo("Bearer");
        assertThat(((Number) JsonPath.read(body, "$.expiresIn")).longValue())
                .isEqualTo(JWT_EXPIRATION_SECONDS);
        assertThat((String) JsonPath.read(body, "$.user.email")).isEqualTo(email);
        assertNoSensitiveData(body);

        final String token = JsonPath.read(body, "$.accessToken");
        assertThat(getJson(ME_URL, token).getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    @Test
    void shouldUpdateLastLoginAtOnSuccessfulLogin() {
        final String email = TestDataFactory.uniqueEmail();
        final String password = TestDataFactory.validPassword();
        signupAndGetToken(TestDataFactory.personName(), email, password);
        assertThat(requireUserByEmail(email).getLastLoginAt()).isNull();

        postJson(LOGIN_URL, loginJson(email, password));

        assertThat(requireUserByEmail(email).getLastLoginAt()).isNotNull();
    }

    @Test
    void shouldLoginWithEmailInDifferentCase() {
        final String email = TestDataFactory.uniqueEmail();
        final String password = TestDataFactory.validPassword();
        signupAndGetToken(TestDataFactory.personName(), email, password);

        final ResponseEntity<String> response = postJson(LOGIN_URL,
                loginJson("  " + email.toUpperCase() + " ", password));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    @Test
    void shouldRejectUnknownEmailWithGenericMessage() {
        final ResponseEntity<String> response = postJson(LOGIN_URL,
                loginJson(TestDataFactory.uniqueEmail(), TestDataFactory.validPassword()));

        assertErrorMessage(response, HttpStatus.UNAUTHORIZED, "Invalid email or password");
    }

    @Test
    void shouldRejectWrongPasswordWithGenericMessage() {
        final String email = TestDataFactory.uniqueEmail();
        signupAndGetToken(TestDataFactory.personName(), email, TestDataFactory.validPassword());

        final ResponseEntity<String> response = postJson(LOGIN_URL,
                loginJson(email, TestDataFactory.validPassword()));

        assertErrorMessage(response, HttpStatus.UNAUTHORIZED, "Invalid email or password");
    }

    @Test
    void shouldRejectInactiveUserWithGenericMessage() {
        final String email = TestDataFactory.uniqueEmail();
        final String password = TestDataFactory.validPassword();
        signupAndGetToken(TestDataFactory.personName(), email, password);
        final User user = requireUserByEmail(email);
        user.setStatus(RowStatus.INACTIVE);
        userRepository.save(user);

        final ResponseEntity<String> response = postJson(LOGIN_URL, loginJson(email, password));

        assertErrorMessage(response, HttpStatus.UNAUTHORIZED, "Invalid email or password");
    }

    @Test
    void shouldNotUpdateLastLoginAtOnFailedLogin() {
        final String email = TestDataFactory.uniqueEmail();
        signupAndGetToken(TestDataFactory.personName(), email, TestDataFactory.validPassword());

        postJson(LOGIN_URL, loginJson(email, TestDataFactory.validPassword()));

        assertThat(requireUserByEmail(email).getLastLoginAt()).isNull();
    }

    @Test
    void shouldLoginWithStoreAndReturnTokenWithStoreIdClaim() {
        final String email = TestDataFactory.uniqueEmail();
        final String password = TestDataFactory.validPassword();
        final String token = signupAndGetToken(TestDataFactory.personName(), email, password);

        final ResponseEntity<String> storeResponse = postJson("/api/store", """
                {"name": "%s", "ntn": "%s"}""".formatted(TestDataFactory.storeName(), TestDataFactory.uniqueNtn()), token);
        assertThat(storeResponse.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        final String storeId = JsonPath.read(storeResponse.getBody(), "$.store.id");

        final ResponseEntity<String> response = postJson(LOGIN_URL, loginJson(email, password));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        final String loginToken = JsonPath.read(response.getBody(), "$.accessToken");
        final String returnedStoreId = JsonPath.read(response.getBody(), "$.user.storeId");
        assertThat(returnedStoreId).isEqualTo(storeId);

        final SecretKey key = Keys.hmacShaKeyFor(jwtSecret.getBytes(StandardCharsets.UTF_8));
        final String jwtStoreId = Jwts.parser().verifyWith(key).build()
                .parseSignedClaims(loginToken).getPayload().get("store_id", String.class);
        assertThat(jwtStoreId).isEqualTo(storeId);
    }

    @Test
    void shouldRejectBlankEmail() {
        final ResponseEntity<String> response = postJson(LOGIN_URL,
                loginJson(" ", TestDataFactory.validPassword()));

        assertErrorResponse(response, HttpStatus.BAD_REQUEST);
    }

    @Test
    void shouldRejectBlankPassword() {
        final ResponseEntity<String> response = postJson(LOGIN_URL,
                loginJson(TestDataFactory.uniqueEmail(), ""));

        assertErrorResponse(response, HttpStatus.BAD_REQUEST);
    }

    @Test
    void shouldRejectMissingCredentials() {
        final ResponseEntity<String> response = postJson(LOGIN_URL, "{}");

        assertErrorResponse(response, HttpStatus.BAD_REQUEST);
    }

}
