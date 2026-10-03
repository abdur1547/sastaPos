package com.sastapos.sasta_pos.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.sastapos.sasta_pos.user.User;
import com.sastapos.sasta_pos.user.UserRole;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import java.util.UUID;
import javax.crypto.SecretKey;
import org.junit.jupiter.api.Test;


/**
 * Pure unit tests for token issuance/verification — no Spring context, no database.
 */
class JwtServiceTest {

    private static final String SECRET = "unit-test-secret-key-please-do-not-use-in-prod";
    private static final long EXPIRATION_SECONDS = 120L;

    private final JwtService jwtService = new JwtService(SECRET, EXPIRATION_SECONDS);

    @Test
    void shouldRoundTripGeneratedToken() {
        final User user = userWithId(UUID.randomUUID());

        final String token = jwtService.generateToken(user);

        assertThat(jwtService.parseUserId(token)).isEqualTo(user.getId());
    }

    @Test
    void shouldExposeConfiguredExpiration() {
        assertThat(jwtService.getExpirationSeconds()).isEqualTo(EXPIRATION_SECONDS);
    }

    @Test
    void shouldEmbedUserRoleClaim() {
        final User user = userWithId(UUID.randomUUID());

        final String token = jwtService.generateToken(user);

        final SecretKey key = Keys.hmacShaKeyFor(SECRET.getBytes(StandardCharsets.UTF_8));
        final String role = Jwts.parser().verifyWith(key).build()
                .parseSignedClaims(token).getPayload().get("role", String.class);
        assertThat(role).isEqualTo("CASHIER");
    }

    @Test
    void shouldRejectTokenSignedWithDifferentSecret() {
        final User user = userWithId(UUID.randomUUID());
        final SecretKey foreignKey = Keys.hmacShaKeyFor(
                "a-totally-different-signing-key-0123456789".getBytes(StandardCharsets.UTF_8));
        final String forgedToken = Jwts.builder()
                .subject(user.getId().toString())
                .expiration(Date.from(Instant.now().plusSeconds(EXPIRATION_SECONDS)))
                .signWith(foreignKey)
                .compact();

        assertThatThrownBy(() -> jwtService.parseUserId(forgedToken))
                .isInstanceOf(io.jsonwebtoken.JwtException.class);
    }

    @Test
    void shouldRejectMalformedToken() {
        assertThatThrownBy(() -> jwtService.parseUserId("not.a.jwt"))
                .isInstanceOf(io.jsonwebtoken.JwtException.class);
    }

    @Test
    void shouldRejectTokenWithNonUuidSubject() {
        final SecretKey key = Keys.hmacShaKeyFor(SECRET.getBytes(StandardCharsets.UTF_8));
        final String token = Jwts.builder()
                .subject("not-a-uuid")
                .expiration(Date.from(Instant.now().plusSeconds(EXPIRATION_SECONDS)))
                .signWith(key)
                .compact();

        assertThatThrownBy(() -> jwtService.parseUserId(token))
                .isInstanceOf(IllegalArgumentException.class);
    }

    private static User userWithId(final UUID id) {
        final User user = new User();
        user.setId(id);
        user.setRole(UserRole.CASHIER);
        return user;
    }

}
