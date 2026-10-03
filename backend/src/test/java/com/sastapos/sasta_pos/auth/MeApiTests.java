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
import java.time.Instant;
import java.util.Date;
import java.util.Map;
import java.util.UUID;
import javax.crypto.SecretKey;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;


class MeApiTests extends AuthApiTestBase {

    @Value("${app.jwt.secret}")
    private String jwtSecret;

    @Test
    void shouldReturnProfileForAuthenticatedUser() {
        final String name = TestDataFactory.personName();
        final String email = TestDataFactory.uniqueEmail();
        final String token = signupAndGetToken(name, email, TestDataFactory.validPassword());

        final ResponseEntity<String> response = getJson(ME_URL, token);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        final Map<String, Object> profile = JsonPath.read(response.getBody(), "$");
        assertThat(profile.keySet())
                .containsExactlyInAnyOrder("id", "name", "email", "role", "status", "storeId");
        assertThat(profile)
                .containsEntry("name", name)
                .containsEntry("email", email)
                .containsEntry("role", "CASHIER")
                .containsEntry("status", "ACTIVE")
                .containsEntry("storeId", null);
        assertThat((String) profile.get("id")).isNotBlank();
        assertNoSensitiveData(response.getBody());
    }

    @Test
    void shouldRejectRequestWithoutToken() {
        final ResponseEntity<String> response = restTemplate.getForEntity(ME_URL, String.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void shouldRejectMalformedToken() {
        assertThat(getJson(ME_URL, "not.a.token").getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void shouldRejectTokenSignedWithWrongSecret() {
        final String email = TestDataFactory.uniqueEmail();
        signupAndGetToken(TestDataFactory.personName(), email, TestDataFactory.validPassword());
        final UUID userId = requireUserByEmail(email).getId();
        final SecretKey foreignKey = Keys.hmacShaKeyFor(
                "a-completely-different-signing-key-for-forgery".getBytes(StandardCharsets.UTF_8));
        final String forgedToken = Jwts.builder()
                .subject(userId.toString())
                .expiration(Date.from(Instant.now().plusSeconds(JWT_EXPIRATION_SECONDS)))
                .signWith(foreignKey)
                .compact();

        assertThat(getJson(ME_URL, forgedToken).getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void shouldRejectExpiredToken() {
        final String email = TestDataFactory.uniqueEmail();
        signupAndGetToken(TestDataFactory.personName(), email, TestDataFactory.validPassword());
        final UUID userId = requireUserByEmail(email).getId();
        final Instant now = Instant.now();
        final String expiredToken = Jwts.builder()
                .subject(userId.toString())
                .issuedAt(Date.from(now.minusSeconds(2 * JWT_EXPIRATION_SECONDS)))
                .expiration(Date.from(now.minusSeconds(JWT_EXPIRATION_SECONDS)))
                .signWith(Keys.hmacShaKeyFor(jwtSecret.getBytes(StandardCharsets.UTF_8)))
                .compact();

        assertThat(getJson(ME_URL, expiredToken).getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void shouldRejectTokenWithNonUuidSubject() {
        final String invalidSubjectToken = Jwts.builder()
                .subject("not-a-uuid")
                .expiration(Date.from(Instant.now().plusSeconds(JWT_EXPIRATION_SECONDS)))
                .signWith(Keys.hmacShaKeyFor(jwtSecret.getBytes(StandardCharsets.UTF_8)))
                .compact();

        assertThat(getJson(ME_URL, invalidSubjectToken).getStatusCode())
                .isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void shouldRejectTokenForDeletedUser() {
        final String email = TestDataFactory.uniqueEmail();
        final String token = signupAndGetToken(TestDataFactory.personName(), email,
                TestDataFactory.validPassword());
        userRepository.deleteById(requireUserByEmail(email).getId());

        assertThat(getJson(ME_URL, token).getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void shouldRejectTokenForInactiveUser() {
        final String email = TestDataFactory.uniqueEmail();
        final String token = signupAndGetToken(TestDataFactory.personName(), email,
                TestDataFactory.validPassword());
        final User user = requireUserByEmail(email);
        user.setStatus(RowStatus.INACTIVE);
        userRepository.save(user);

        assertThat(getJson(ME_URL, token).getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

}
