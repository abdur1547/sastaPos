package com.sastapos.sasta_pos.user;

import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.JsonPath;
import com.sastapos.sasta_pos.auth.PasswordResetToken;
import com.sastapos.sasta_pos.auth.support.TestDataFactory;
import com.sastapos.sasta_pos.sale.Sale;
import com.sastapos.sasta_pos.sale.SaleStatus;
import com.sastapos.sasta_pos.store.support.StoreApiTestBase;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;


/**
 * End-to-end specs for /api/users. Authorization rule: only the OWNER of a store may call any
 * endpoint, and only users of that same store are visible/manageable (others are 404, so the
 * existence of foreign users is never leaked).
 */
class UserApiTests extends StoreApiTestBase {

    private static final String USERS_URL = "/api/users";

    private ResponseEntity<String> put(final String url, final String body, final String token) {
        final HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        if (token != null) {
            headers.setBearerAuth(token);
        }
        return restTemplate.exchange(url, HttpMethod.PUT, new HttpEntity<>(body, headers), String.class);
    }

    private static String userJson(final String name, final String email, final String password) {
        return """
                {"name": "%s", "email": "%s", "password": "%s"}""".formatted(name, email, password);
    }

    private static String updateJson(final String name, final String email) {
        return """
                {"name": "%s", "email": "%s"}""".formatted(name, email);
    }

    private UUID createCashier(final String ownerToken) {
        final ResponseEntity<String> response = postJson(USERS_URL,
                userJson(TestDataFactory.personName(), TestDataFactory.uniqueEmail(),
                        TestDataFactory.validPassword()), ownerToken);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        return UUID.fromString(JsonPath.read(response.getBody(), "$"));
    }

    private UUID idOf(final String email) {
        return requireUserByEmail(email).getId();
    }

    // The same 401/403 contract applies to every endpoint, so it is checked once per endpoint here.
    private List<ResponseEntity<String>> callAllEndpoints(final String token, final UUID targetId) {
        return List.of(
                token == null ? restTemplate.getForEntity(USERS_URL, String.class) : getJson(USERS_URL, token),
                token == null ? restTemplate.getForEntity(USERS_URL + "/" + targetId, String.class)
                        : getJson(USERS_URL + "/" + targetId, token),
                postJson(USERS_URL, userJson("N", TestDataFactory.uniqueEmail(),
                        TestDataFactory.validPassword()), token),
                put(USERS_URL + "/" + targetId, updateJson("N", TestDataFactory.uniqueEmail()), token),
                restTemplate.exchange(USERS_URL + "/" + targetId, HttpMethod.DELETE,
                        new HttpEntity<>(authHeaders(token)), String.class));
    }

    private static HttpHeaders authHeaders(final String token) {
        final HttpHeaders headers = new HttpHeaders();
        if (token != null) {
            headers.setBearerAuth(token);
        }
        return headers;
    }

    @Nested
    class Authorization {

        @Test
        void shouldRejectAnonymousCallersOnEveryEndpoint() {
            final StoreOwner owner = createStore();
            final UUID cashierId = createCashier(owner.token());

            callAllEndpoints(null, cashierId)
                    .forEach(r -> assertThat(r.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED));
        }

        @Test
        void shouldForbidCashierOnEveryEndpoint() {
            final StoreOwner owner = createStore();
            final UUID cashierId = createCashier(owner.token());
            final String cashierToken = signupCashierAttachedToStore(owner.storeId());

            callAllEndpoints(cashierToken, cashierId).forEach(r -> assertErrorMessage(r,
                    HttpStatus.FORBIDDEN, "Only the store owner can perform this action"));
        }

        @Test
        void shouldForbidUserWithoutStoreOnEveryEndpoint() {
            final StoreOwner owner = createStore();
            final UUID cashierId = createCashier(owner.token());
            final String storelessToken = signupAndGetToken(TestDataFactory.personName(),
                    TestDataFactory.uniqueEmail(), TestDataFactory.validPassword());

            callAllEndpoints(storelessToken, cashierId).forEach(r -> assertErrorMessage(r,
                    HttpStatus.FORBIDDEN, "Only the store owner can perform this action"));
        }
    }

    @Nested
    class ListUsers {

        @Test
        void shouldListOnlyUsersOfOwnersStore() {
            final StoreOwner owner = createStore();
            final UUID cashierId = createCashier(owner.token());
            final StoreOwner otherOwner = createStore();
            final UUID foreignCashierId = createCashier(otherOwner.token());

            final ResponseEntity<String> response = getJson(USERS_URL, owner.token());

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            final List<String> ids = JsonPath.read(response.getBody(), "$[*].id");
            assertThat(ids).hasSize(2).contains(cashierId.toString())
                    .doesNotContain(foreignCashierId.toString());
            final List<String> stores = JsonPath.read(response.getBody(), "$[*].store");
            assertThat(stores).containsOnly(owner.storeId().toString());
        }

        @Test
        void shouldNeverExposeCredentials() {
            final StoreOwner owner = createStore();
            createCashier(owner.token());

            final String body = getJson(USERS_URL, owner.token()).getBody();

            assertThat(body.toLowerCase()).doesNotContain("password");
        }
    }

    @Nested
    class GetUser {

        @Test
        void shouldReturnUserOfSameStore() {
            final StoreOwner owner = createStore();
            final UUID cashierId = createCashier(owner.token());

            final ResponseEntity<String> response = getJson(USERS_URL + "/" + cashierId, owner.token());

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            final Map<String, Object> user = JsonPath.read(response.getBody(), "$");
            assertThat(user.keySet()).containsExactlyInAnyOrder(
                    "id", "name", "email", "role", "status", "lastLoginAt", "store");
            assertThat(user).containsEntry("id", cashierId.toString())
                    .containsEntry("role", "CASHIER")
                    .containsEntry("status", "ACTIVE")
                    .containsEntry("store", owner.storeId().toString());
            assertNoSensitiveData(response.getBody());
        }

        @Test
        void shouldReturn404ForUserOfAnotherStore() {
            final StoreOwner owner = createStore();
            final StoreOwner otherOwner = createStore();
            final UUID foreignCashierId = createCashier(otherOwner.token());

            final ResponseEntity<String> response =
                    getJson(USERS_URL + "/" + foreignCashierId, owner.token());

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        }

        @Test
        void shouldReturn404ForUnknownId() {
            final StoreOwner owner = createStore();

            assertThat(getJson(USERS_URL + "/" + UUID.randomUUID(), owner.token()).getStatusCode())
                    .isEqualTo(HttpStatus.NOT_FOUND);
        }

        @Test
        void shouldReturn400ForMalformedId() {
            final StoreOwner owner = createStore();

            assertErrorResponse(getJson(USERS_URL + "/not-a-uuid", owner.token()), HttpStatus.BAD_REQUEST);
        }
    }

    @Nested
    class CreateUser {

        @Test
        void shouldCreateCashierInOwnersStore() {
            final StoreOwner owner = createStore();
            final String email = TestDataFactory.uniqueEmail();
            final String password = TestDataFactory.validPassword();

            final ResponseEntity<String> response = postJson(USERS_URL,
                    userJson("New Cashier", "  " + email.toUpperCase() + " ", password), owner.token());

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
            final User saved = userRepository.findById(UUID.fromString(JsonPath.read(response.getBody(), "$")))
                    .orElseThrow();
            assertThat(saved.getName()).isEqualTo("New Cashier");
            assertThat(saved.getEmail()).isEqualTo(email.toLowerCase());
            assertThat(saved.getRole()).isEqualTo(UserRole.CASHIER);
            assertThat(saved.getStatus()).isEqualTo(com.sastapos.sasta_pos.store.RowStatus.ACTIVE);
            assertThat(saved.getStore().getId()).isEqualTo(owner.storeId());
        }

        @Test
        void shouldStoreHashedPasswordAndAllowLogin() {
            final StoreOwner owner = createStore();
            final String email = TestDataFactory.uniqueEmail();
            final String password = TestDataFactory.validPassword();
            postJson(USERS_URL, userJson("Cashier", email, password), owner.token());

            assertThat(requireUserByEmail(email).getPasswordHash()).isNotEqualTo(password).startsWith("$2");
            assertThat(postJson(LOGIN_URL, loginJson(email, password)).getStatusCode())
                    .isEqualTo(HttpStatus.OK);
        }

        @Test
        void shouldIgnoreClientSuppliedRoleAndStore() {
            final StoreOwner owner = createStore();
            final StoreOwner other = createStore();
            final String email = TestDataFactory.uniqueEmail();
            final String body = """
                    {"name": "X", "email": "%s", "password": "%s", "role": "OWNER", "store": "%s"}"""
                    .formatted(email, TestDataFactory.validPassword(), other.storeId());

            final ResponseEntity<String> response = postJson(USERS_URL, body, owner.token());

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
            final User saved = requireUserByEmail(email);
            assertThat(saved.getRole()).isEqualTo(UserRole.CASHIER);
            assertThat(saved.getStore().getId()).isEqualTo(owner.storeId());
        }

        @Test
        void shouldRejectDuplicateEmailCaseInsensitively() {
            final StoreOwner owner = createStore();
            final String email = TestDataFactory.uniqueEmail();
            postJson(USERS_URL, userJson("A", email, TestDataFactory.validPassword()), owner.token());

            final ResponseEntity<String> response = postJson(USERS_URL,
                    userJson("B", email.toUpperCase(), TestDataFactory.validPassword()), owner.token());

            assertErrorMessage(response, HttpStatus.CONFLICT, "An account with this email already exists");
        }

        @Test
        void shouldRejectWeakPassword() {
            final StoreOwner owner = createStore();
            final String email = TestDataFactory.uniqueEmail();

            final ResponseEntity<String> response =
                    postJson(USERS_URL, userJson("A", email, "short1"), owner.token());

            assertErrorResponse(response, HttpStatus.BAD_REQUEST);
            assertThat(userRepository.existsByEmailIgnoreCase(email)).isFalse();
        }

        @Test
        void shouldRejectInvalidPayloads() {
            final StoreOwner owner = createStore();
            final String pw = TestDataFactory.validPassword();
            final String email = TestDataFactory.uniqueEmail();

            for (final String body : List.of(
                    userJson("", email, pw),
                    userJson("A", "not-an-email", pw),
                    userJson("A", email, ""),
                    userJson("x".repeat(256), email, pw),
                    "{}")) {
                assertErrorResponse(postJson(USERS_URL, body, owner.token()), HttpStatus.BAD_REQUEST);
            }
            assertThat(userRepository.existsByEmailIgnoreCase(email)).isFalse();
        }

        @Test
        void shouldRejectMalformedJson() {
            final StoreOwner owner = createStore();

            assertErrorResponse(postJson(USERS_URL, "{not json", owner.token()), HttpStatus.BAD_REQUEST);
        }
    }

    @Nested
    class UpdateUser {

        @Test
        void shouldUpdateNameAndEmailOfStoreUser() {
            final StoreOwner owner = createStore();
            final UUID id = createCashier(owner.token());
            final String email = TestDataFactory.uniqueEmail();

            final ResponseEntity<String> response =
                    put(USERS_URL + "/" + id, updateJson("Renamed", email.toUpperCase()), owner.token());

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat((String) JsonPath.read(response.getBody(), "$")).isEqualTo(id.toString());
            final User updated = userRepository.findById(id).orElseThrow();
            assertThat(updated.getName()).isEqualTo("Renamed");
            assertThat(updated.getEmail()).isEqualTo(email.toLowerCase());
            assertThat(updated.getRole()).isEqualTo(UserRole.CASHIER);
            assertThat(updated.getStore().getId()).isEqualTo(owner.storeId());
        }

        @Test
        void shouldAllowKeepingOwnEmail() {
            final StoreOwner owner = createStore();
            final String email = TestDataFactory.uniqueEmail();
            final UUID id = UUID.fromString(JsonPath.read(postJson(USERS_URL,
                    userJson("A", email, TestDataFactory.validPassword()), owner.token()).getBody(), "$"));

            assertThat(put(USERS_URL + "/" + id, updateJson("B", email), owner.token()).getStatusCode())
                    .isEqualTo(HttpStatus.OK);
        }

        @Test
        void shouldReturn404ForUserOfAnotherStoreAndLeaveItUntouched() {
            final StoreOwner owner = createStore();
            final StoreOwner other = createStore();
            final UUID foreignId = createCashier(other.token());
            final User before = userRepository.findById(foreignId).orElseThrow();

            final ResponseEntity<String> response = put(USERS_URL + "/" + foreignId,
                    updateJson("Hacked", TestDataFactory.uniqueEmail()), owner.token());

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
            final User after = userRepository.findById(foreignId).orElseThrow();
            assertThat(after.getName()).isEqualTo(before.getName());
            assertThat(after.getEmail()).isEqualTo(before.getEmail());
        }

        @Test
        void shouldReturn404ForUnknownId() {
            final StoreOwner owner = createStore();

            assertThat(put(USERS_URL + "/" + UUID.randomUUID(),
                    updateJson("A", TestDataFactory.uniqueEmail()), owner.token()).getStatusCode())
                    .isEqualTo(HttpStatus.NOT_FOUND);
        }

        @Test
        void shouldRejectEmailOwnedByAnotherAccount() {
            final StoreOwner owner = createStore();
            final UUID id = createCashier(owner.token());
            final String takenEmail = TestDataFactory.uniqueEmail();
            signupAndGetToken("Someone", takenEmail, TestDataFactory.validPassword());

            final ResponseEntity<String> response =
                    put(USERS_URL + "/" + id, updateJson("A", takenEmail), owner.token());

            assertErrorMessage(response, HttpStatus.CONFLICT, "An account with this email already exists");
        }

        @Test
        void shouldRejectInvalidPayloads() {
            final StoreOwner owner = createStore();
            final UUID id = createCashier(owner.token());

            for (final String body : List.of(
                    updateJson("", TestDataFactory.uniqueEmail()),
                    updateJson("A", "bad"),
                    "{}")) {
                assertErrorResponse(put(USERS_URL + "/" + id, body, owner.token()), HttpStatus.BAD_REQUEST);
            }
        }
    }

    @Nested
    class DeleteUser {

        private ResponseEntity<String> delete(final UUID id, final String token) {
            return restTemplate.exchange(USERS_URL + "/" + id, HttpMethod.DELETE,
                    new HttpEntity<>(authHeaders(token)), String.class);
        }

        @Test
        void shouldDeleteUserOfSameStore() {
            final StoreOwner owner = createStore();
            final UUID id = createCashier(owner.token());

            final ResponseEntity<String> response = delete(id, owner.token());

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
            assertThat(userRepository.existsById(id)).isFalse();
            assertThat(getJson(USERS_URL + "/" + id, owner.token()).getStatusCode())
                    .isEqualTo(HttpStatus.NOT_FOUND);
        }

        @Test
        void shouldDeleteUserWhoHasPasswordResetTokens() {
            final StoreOwner owner = createStore();
            final String email = TestDataFactory.uniqueEmail();
            final UUID id = UUID.fromString(JsonPath.read(postJson(USERS_URL,
                    userJson("A", email, TestDataFactory.validPassword()), owner.token()).getBody(), "$"));
            postJson(PASSWORD_RESET_REQUEST_URL, "{\"email\": \"" + email + "\"}");
            assertThat(passwordResetTokenRepository.findAllByUserId(id)).isNotEmpty();

            assertThat(delete(id, owner.token()).getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
            assertThat(passwordResetTokenRepository.findAllByUserId(id)).isEmpty();
        }

        @Test
        void shouldReturn404ForUserOfAnotherStoreAndKeepIt() {
            final StoreOwner owner = createStore();
            final StoreOwner other = createStore();
            final UUID foreignId = createCashier(other.token());

            assertThat(delete(foreignId, owner.token()).getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
            assertThat(userRepository.existsById(foreignId)).isTrue();
        }

        @Test
        void shouldReturn404ForUnknownId() {
            final StoreOwner owner = createStore();

            assertThat(delete(UUID.randomUUID(), owner.token()).getStatusCode())
                    .isEqualTo(HttpStatus.NOT_FOUND);
        }

        @Test
        void shouldNotAllowOwnerToDeleteThemselves() {
            final StoreOwner owner = createStore();
            final UUID ownerId = userRepository.findAll().stream()
                    .filter(u -> u.getRole() == UserRole.OWNER).findFirst().orElseThrow().getId();

            assertErrorMessage(delete(ownerId, owner.token()), HttpStatus.CONFLICT,
                    "You cannot delete your own account");
            assertThat(userRepository.existsById(ownerId)).isTrue();
        }

        @Test
        void shouldReturn409WhenUserHasSales() {
            final StoreOwner owner = createStore();
            final UUID id = createCashier(owner.token());
            final Sale sale = new Sale();
            sale.setInvoiceNumber("TEST-" + UUID.randomUUID());
            sale.setSubtotal(1.0);
            sale.setDiscountAmount(0.0);
            sale.setTaxableAmount(1.0);
            sale.setTaxAmount(0.0);
            sale.setTotalAmount(1.0);
            sale.setCurrencyCode("PKR");
            sale.setStatus(SaleStatus.COMPLETED);
            sale.setSoldAt(LocalDateTime.now());
            sale.setStore(storeRepository.getReferenceById(owner.storeId()));
            sale.setUser(userRepository.getReferenceById(id));
            saleRepository.save(sale);

            assertThat(delete(id, owner.token()).getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
            assertThat(userRepository.existsById(id)).isTrue();
        }
    }

}
