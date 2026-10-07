package com.sastapos.sasta_pos.store;

import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.JsonPath;
import com.sastapos.sasta_pos.auth.support.TestDataFactory;
import com.sastapos.sasta_pos.store.support.StoreApiTestBase;
import com.sastapos.sasta_pos.user.UserRole;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;


/**
 * Use case 3 — create store: one store per user, default settings row, OWNER promotion,
 * globally unique NTN.
 */
class CreateStoreApiTests extends StoreApiTestBase {

    @Test
    void shouldCreateStoreWithDefaultsWhenOptionalFieldsOmitted() {
        final String name = TestDataFactory.storeName();
        final String ntn = TestDataFactory.uniqueNtn();
        final String email = TestDataFactory.uniqueEmail();
        final String token = signupAndGetToken(TestDataFactory.personName(), email,
                TestDataFactory.validPassword());

        final ResponseEntity<String> response = postJson(STORE_URL, createStoreJson(name, ntn), token);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        final Map<String, Object> store = JsonPath.read(response.getBody(), "$.store");
        assertStoreShape(store);
        assertThat(store)
                .containsEntry("name", name)
                .containsEntry("ntn", ntn)
                .containsEntry("address", null)
                .containsEntry("currencyCode", "PKR")
                .containsEntry("timezone", "Asia/Karachi")
                .containsEntry("status", "ACTIVE");
        assertThat((String) store.get("id")).isNotBlank();
        assertThat((Map<String, Object>) store.get("storeSettings"))
                .containsEntry("invoicePrefix", "")
                .containsEntry("invoiceNumberStart", 1)
                .containsEntry("nextInvoiceNumber", 1)
                .containsEntry("receiptFooter", "");

        final Map<String, Object> user = JsonPath.read(response.getBody(), "$.user");
        assertThat(user)
                .containsEntry("email", email)
                .containsEntry("role", "OWNER")
                .containsEntry("storeId", store.get("id"));
        assertNoSensitiveData(response.getBody());
    }

    @Test
    void shouldCreateStoreWithProvidedValues() {
        final String token = signupAndGetToken(TestDataFactory.personName(),
                TestDataFactory.uniqueEmail(), TestDataFactory.validPassword());
        final String name = TestDataFactory.storeName();
        final String ntn = TestDataFactory.uniqueNtn();
        final String address = "123 Main Street, Islamabad";

        final ResponseEntity<String> response = postJson(STORE_URL, """
                {"name": "%s", "ntn": "%s", "address": "%s", "currencyCode": "USD",
                 "timezone": "UTC"}""".formatted(name, ntn, address), token);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        final Map<String, Object> store = JsonPath.read(response.getBody(), "$.store");
        assertThat(store)
                .containsEntry("name", name)
                .containsEntry("ntn", ntn)
                .containsEntry("address", address)
                .containsEntry("currencyCode", "USD")
                .containsEntry("timezone", "UTC")
                .containsEntry("status", "ACTIVE");
    }

    @Test
    void shouldPersistStoreAndPromoteUserToOwner() {
        final String email = TestDataFactory.uniqueEmail();
        final String token = signupAndGetToken(TestDataFactory.personName(), email,
                TestDataFactory.validPassword());
        final String ntn = TestDataFactory.uniqueNtn();

        final ResponseEntity<String> response = postJson(STORE_URL,
                createStoreJson(TestDataFactory.storeName(), ntn), token);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        final UUID storeId = UUID.fromString(JsonPath.read(response.getBody(), "$.store.id"));
        final Store persisted = requireStoreById(storeId);
        assertThat(persisted.getNtn()).isEqualTo(ntn);
        assertThat(persisted.getStatus()).isEqualTo(RowStatus.ACTIVE);
        assertThat(persisted.getStoreSettings().getNextInvoiceNumber()).isEqualTo(1);
        final var owner = requireUserByEmail(email);
        assertThat(owner.getRole()).isEqualTo(UserRole.OWNER);
    }

    @Test
    void shouldIgnoreStatusFieldOnCreate() {
        final String token = signupAndGetToken(TestDataFactory.personName(),
                TestDataFactory.uniqueEmail(), TestDataFactory.validPassword());

        final ResponseEntity<String> response = postJson(STORE_URL, """
                {"name": "%s", "ntn": "%s", "status": "INACTIVE"}"""
                .formatted(TestDataFactory.storeName(), TestDataFactory.uniqueNtn()), token);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        final Map<String, Object> store = JsonPath.read(response.getBody(), "$.store");
        assertThat(store).containsEntry("status", "ACTIVE");
    }

    @Test
    void shouldRejectSecondStoreForSameUser() {
        final StoreOwner owner = createStore();

        final ResponseEntity<String> response = postJson(STORE_URL,
                createStoreJson(TestDataFactory.storeName(), TestDataFactory.uniqueNtn()),
                owner.token());

        assertErrorMessage(response, HttpStatus.CONFLICT, "You already have a store");
    }

    @Test
    void shouldRejectDuplicateNtn() {
        final StoreOwner owner = createStore();
        final String existingNtn = requireStoreById(owner.storeId()).getNtn();
        final String otherToken = signupAndGetToken(TestDataFactory.personName(),
                TestDataFactory.uniqueEmail(), TestDataFactory.validPassword());

        final ResponseEntity<String> response = postJson(STORE_URL,
                createStoreJson(TestDataFactory.storeName(), existingNtn), otherToken);

        assertErrorMessage(response, HttpStatus.CONFLICT, "A store with this NTN already exists");
    }

    @Test
    void shouldRejectDuplicateNtnInDifferentCase() {
        final StoreOwner owner = createStore();
        final String existingNtnUpper = requireStoreById(owner.storeId()).getNtn().toUpperCase();
        final String otherToken = signupAndGetToken(TestDataFactory.personName(),
                TestDataFactory.uniqueEmail(), TestDataFactory.validPassword());

        final ResponseEntity<String> response = postJson(STORE_URL,
                createStoreJson(TestDataFactory.storeName(), existingNtnUpper), otherToken);

        assertErrorMessage(response, HttpStatus.CONFLICT, "A store with this NTN already exists");
    }

    @Test
    void shouldRejectBlankAndMissingName() {
        final String ntn = TestDataFactory.uniqueNtn();

        final String blankNameToken = signupAndGetToken(TestDataFactory.personName(),
                TestDataFactory.uniqueEmail(), TestDataFactory.validPassword());
        assertErrorResponse(postJson(STORE_URL, """
                {"name": "  ", "ntn": "%s"}""".formatted(ntn), blankNameToken),
                HttpStatus.BAD_REQUEST);

        final String missingNameToken = signupAndGetToken(TestDataFactory.personName(),
                TestDataFactory.uniqueEmail(), TestDataFactory.validPassword());
        assertErrorResponse(postJson(STORE_URL, """
                {"ntn": "%s"}""".formatted(ntn), missingNameToken), HttpStatus.BAD_REQUEST);
    }

    @Test
    void shouldRejectBlankAndMissingNtn() {
        final String blankNtnToken = signupAndGetToken(TestDataFactory.personName(),
                TestDataFactory.uniqueEmail(), TestDataFactory.validPassword());
        assertErrorResponse(postJson(STORE_URL, """
                {"name": "%s", "ntn": ""}""".formatted(TestDataFactory.storeName()), blankNtnToken),
                HttpStatus.BAD_REQUEST);

        final String missingNtnToken = signupAndGetToken(TestDataFactory.personName(),
                TestDataFactory.uniqueEmail(), TestDataFactory.validPassword());
        assertErrorResponse(postJson(STORE_URL, """
                {"name": "%s"}""".formatted(TestDataFactory.storeName()), missingNtnToken),
                HttpStatus.BAD_REQUEST);
    }

    @Test
    void shouldRejectOversizedFields() {
        final String[] oversizedBodies = {
                """
                {"name": "%s", "ntn": "%s"}""".formatted("a".repeat(256), TestDataFactory.uniqueNtn()),
                """
                {"name": "%s", "ntn": "%s"}""".formatted(TestDataFactory.storeName(), "1".repeat(256)),
                """
                {"name": "%s", "ntn": "%s", "address": "%s"}"""
                        .formatted(TestDataFactory.storeName(), TestDataFactory.uniqueNtn(), "a".repeat(1001)),
                """
                {"name": "%s", "ntn": "%s", "currencyCode": "%s"}"""
                        .formatted(TestDataFactory.storeName(), TestDataFactory.uniqueNtn(), "a".repeat(11)),
                """
                {"name": "%s", "ntn": "%s", "timezone": "%s"}"""
                        .formatted(TestDataFactory.storeName(), TestDataFactory.uniqueNtn(), "a".repeat(101)),
        };

        for (final String body : oversizedBodies) {
            final String token = signupAndGetToken(TestDataFactory.personName(),
                    TestDataFactory.uniqueEmail(), TestDataFactory.validPassword());
            assertErrorResponse(postJson(STORE_URL, body, token), HttpStatus.BAD_REQUEST);
        }
    }

    @Test
    void shouldRejectRequestWithoutToken() {
        final ResponseEntity<String> response = postJson(STORE_URL,
                createStoreJson(TestDataFactory.storeName(), TestDataFactory.uniqueNtn()));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

}
