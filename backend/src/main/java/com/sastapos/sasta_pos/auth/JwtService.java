package com.sastapos.sasta_pos.auth;

import com.sastapos.sasta_pos.user.User;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import java.util.UUID;
import javax.crypto.SecretKey;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;


/**
 * Issues and verifies stateless access JWTs signed with a server-side HMAC secret.
 * The same token is accepted by PowerSync (HS256 key configured in powersync/service.yaml).
 */
@Component
public class JwtService {

    static final String POWERSYNC_KEY_ID = "powersync";
    static final String POWERSYNC_AUDIENCE = "powersync";

    private final SecretKey key;
    private final long expirationSeconds;

    public JwtService(@Value("${app.jwt.secret}") final String secret,
            @Value("${app.jwt.expiration-seconds}") final long expirationSeconds) {
        this.key = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
        this.expirationSeconds = expirationSeconds;
    }

    public long getExpirationSeconds() {
        return expirationSeconds;
    }

    public String generateToken(final User user) {
        final Instant now = Instant.now();
        final var builder = Jwts.builder()
                .header().keyId(POWERSYNC_KEY_ID).and()
                .subject(user.getId().toString())
                .audience().add(POWERSYNC_AUDIENCE).and()
                .claim("role", user.getRole().name());
        // PowerSync sync streams scope data by this claim (see powersync/sync-config.yaml).
        if (user.getStore() != null) {
            builder.claim("store_id", user.getStore().getId().toString());
        }
        return builder
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plusSeconds(expirationSeconds)))
                .signWith(key, Jwts.SIG.HS256)
                .compact();
    }

    /**
     * @throws JwtException if the token is malformed, expired, or has an invalid signature.
     */
    public UUID parseUserId(final String token) {
        final Claims claims = Jwts.parser()
                .verifyWith(key)
                .build()
                .parseSignedClaims(token)
                .getPayload();
        return UUID.fromString(claims.getSubject());
    }

}
