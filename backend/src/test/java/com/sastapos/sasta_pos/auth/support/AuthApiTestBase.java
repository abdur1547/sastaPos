package com.sastapos.sasta_pos.auth.support;

import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.JsonPath;
import com.sastapos.sasta_pos.auth.PasswordResetTokenRepository;
import com.sastapos.sasta_pos.user.User;
import com.sastapos.sasta_pos.user.UserRepository;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.resttestclient.TestRestTemplate;
import org.springframework.boot.resttestclient.autoconfigure.AutoConfigureTestRestTemplate;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;


/**
 * Base class for auth end-to-end specs. Boots the full application on a random port against a
 * real PostgreSQL instance (Testcontainers, same engine as production) with the schema created by
 * the same Flyway migrations that production runs. Database state is wiped before each test so
 * specs stay independent.
 *
 * <p>The JWT lifetime is shortened to 60 s via {@code properties} so specs can assert expiry
 * semantics without waiting an hour; tests reference {@link #JWT_EXPIRATION_SECONDS} instead of a
 * magic number.
 *
 * <p>The container is started once in a static block and its JDBC URL pinned via
 * {@link DynamicPropertySource} (rather than {@code @ServiceConnection}) so the datasource is
 * bound to the container's real mapped port before the connection pool initializes — required
 * under rootless Docker, where the mapped port is not reachable until the container is up.
 */
@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "app.jwt.expiration-seconds=" + AuthApiTestBase.JWT_EXPIRATION_SECONDS)
@ActiveProfiles("test")
@Import(AuthTestConfig.class)
@AutoConfigureTestRestTemplate
@Testcontainers
public abstract class AuthApiTestBase {

    protected static final String SIGNUP_URL = "/api/auth/signup";
    protected static final String LOGIN_URL = "/api/auth/login";
    protected static final String ME_URL = "/api/auth/me";
    protected static final String LOGOUT_URL = "/api/auth/logout";
    protected static final String CHANGE_PASSWORD_URL = "/api/auth/change-password";
    protected static final String PASSWORD_RESET_REQUEST_URL = "/api/auth/password-reset/request";
    protected static final String PASSWORD_RESET_COMPLETE_URL = "/api/auth/password-reset/complete";

    protected static final long JWT_EXPIRATION_SECONDS = 60L;

    /** Fields every error payload from the error-handling starter must expose. */
    private static final String[] ERROR_PAYLOAD_FIELDS = {"code", "message"};

    @SuppressWarnings("resource") // closed by the JVM shutdown hook Testcontainers registers
    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:16-alpine")
            .withReuse(true);

    static {
        POSTGRES.start();
    }

    @DynamicPropertySource
    static void postgresProperties(final DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
    }

    @Autowired
    protected TestRestTemplate restTemplate;

    @Autowired
    protected UserRepository userRepository;

    @Autowired
    protected PasswordResetTokenRepository passwordResetTokenRepository;

    @Autowired
    protected RecordingPasswordResetNotifier passwordResetNotifier;

    @BeforeEach
    void resetDatabaseState() {
        passwordResetTokenRepository.deleteAll();
        userRepository.deleteAll();
        passwordResetNotifier.reset();
    }

    // ---------- HTTP helpers ----------

    protected ResponseEntity<String> postJson(final String url, final String jsonBody) {
        return postJson(url, jsonBody, null);
    }

    protected ResponseEntity<String> postJson(final String url, final String jsonBody,
            final String bearerToken) {
        return restTemplate.exchange(url, HttpMethod.POST,
                new HttpEntity<>(jsonBody, jsonHeaders(bearerToken)), String.class);
    }

    protected ResponseEntity<String> getJson(final String url, final String bearerToken) {
        final HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(bearerToken);
        return restTemplate.exchange(url, HttpMethod.GET, new HttpEntity<>(headers), String.class);
    }

    private HttpHeaders jsonHeaders(final String bearerToken) {
        final HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        if (bearerToken != null) {
            headers.setBearerAuth(bearerToken);
        }
        return headers;
    }

    // ---------- Request body builders ----------

    protected static String signupJson(final String name, final String email, final String password) {
        return """
                {"name": "%s", "email": "%s", "password": "%s"}""".formatted(name, email, password);
    }

    protected static String loginJson(final String email, final String password) {
        return """
                {"email": "%s", "password": "%s"}""".formatted(email, password);
    }

    // ---------- Flow helpers ----------

    protected String signupAndGetToken(final String name, final String email, final String password) {
        final ResponseEntity<String> response = postJson(SIGNUP_URL, signupJson(name, email, password));
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        return JsonPath.read(response.getBody(), "$.accessToken");
    }

    protected User requireUserByEmail(final String email) {
        return userRepository.findByEmailIgnoreCase(email)
                .orElseThrow(() -> new AssertionError("Expected user to exist: " + email));
    }

    // ---------- Assertion helpers ----------

    /**
     * Business errors carry the exact message thrown by the service layer, in a structured
     * {@code {code, message, status}} error payload that leaks no stack trace or internal detail.
     */
    protected void assertErrorMessage(final ResponseEntity<String> response, final HttpStatus status,
            final String expectedMessage) {
        assertThat(response.getStatusCode()).isEqualTo(status);
        assertThat(response.getBody()).isNotNull();
        final Map<String, Object> error = JsonPath.read(response.getBody(), "$");
        assertThat(error).containsKeys(ERROR_PAYLOAD_FIELDS);
        assertThat(error.get("message")).isEqualTo(expectedMessage);
        assertThat(error.keySet()).noneMatch(k -> k.toLowerCase().contains("stacktrace")
                || k.toLowerCase().contains("trace") || k.toLowerCase().contains("exception"));
    }

    /**
     * Validation/contract errors: assert status and that the payload is a structured error object
     * containing a code and a message (field-level detail may also be present).
     */
    protected void assertErrorResponse(final ResponseEntity<String> response, final HttpStatus status) {
        assertThat(response.getStatusCode()).isEqualTo(status);
        assertThat(response.getBody()).isNotNull();
        final Map<String, Object> error = JsonPath.read(response.getBody(), "$");
        assertThat(error).containsKeys(ERROR_PAYLOAD_FIELDS);
        assertThat((String) error.get("code")).isNotBlank();
    }

    /**
     * Structural guard: no response payload may ever expose credential material, regardless of how
     * the DTO evolves. Scans every JSON key, so a future {@code passwordHash} field can't slip out.
     */
    protected static void assertNoSensitiveData(final String responseBody) {
        assertThat(responseBody).isNotNull();
        final Map<String, Object> payload = JsonPath.read(responseBody, "$");
        assertNoSensitiveKeys(payload);
    }

    private static void assertNoSensitiveKeys(final Map<String, Object> node) {
        for (final Map.Entry<String, Object> entry : node.entrySet()) {
            assertThat(entry.getKey().toLowerCase())
                    .as("response must not expose credential field '%s'", entry.getKey())
                    .doesNotContain("password");
            if (entry.getValue() instanceof Map<?, ?> nested) {
                @SuppressWarnings("unchecked")
                final Map<String, Object> nestedMap = (Map<String, Object>) nested;
                assertNoSensitiveKeys(nestedMap);
            }
        }
    }

}
