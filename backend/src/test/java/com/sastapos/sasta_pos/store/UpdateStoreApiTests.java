package com.sastapos.sasta_pos.store;

import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.JsonPath;
import com.sastapos.sasta_pos.auth.support.TestDataFactory;
import com.sastapos.sasta_pos.store.support.StoreApiTestBase;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;


/**
 * Use case 3b — update store profile: PATCH semantics (only non-null fields applied),
 * OWNER-only, NTN stays globally unique, status toggles activation.
 */
class UpdateStoreApiTests extends StoreApiTestBase {

    @Test
    void shouldUpdateProvidedFieldsOnly() {
        final StoreOwner owner = createStore();
        final String originalNtn = requireStoreById(owner.storeId()).getNtn();
        final String newName = TestDataFactory.storeName();
        final String newAddress = "45 Mall Road, Lahore";

        final ResponseEntity<String> response = patchJson(STORE_URL, """
                {"name": "%s", "address": "%s"}""".formatted(newName, newAddress), owner.token());

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        final Map<String, Object> store = JsonPath.read(response.getBody(), "$");
        assertStoreShape(store);
        assertThat(store)
                .containsEntry("name", newName)
                .containsEntry("address", newAddress)
                .containsEntry("ntn", originalNtn)
                .containsEntry("currencyCode", "PKR")
                .containsEntry("timezone", "Asia/Karachi")
                .containsEntry("status", "ACTIVE");
    }

    @Test
    void shouldPersistUpdatesToDatabase() {
        final StoreOwner owner = createStore();
        final String newName = TestDataFactory.storeName();

        final ResponseEntity<String> response = patchJson(STORE_URL,
                """
                        {"name": "%s", "currencyCode": "EUR", "timezone": "Europe/Berlin"}"""
                        .formatted(newName),
                owner.token());

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        final Store persisted = requireStoreById(owner.storeId());
        assertThat(persisted.getName()).isEqualTo(newName);
        assertThat(persisted.getCurrencyCode()).isEqualTo("EUR");
        assertThat(persisted.getTimezone()).isEqualTo("Europe/Berlin");
    }

    @Test
    void shouldApplyEmptyPatchWithoutChanges() {
        final StoreOwner owner = createStore();
        final Store before = requireStoreById(owner.storeId());

        final ResponseEntity<String> response = patchJson(STORE_URL, "{}", owner.token());

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        final Map<String, Object> store = JsonPath.read(response.getBody(), "$");
        assertThat(store)
                .containsEntry("name", before.getName())
                .containsEntry("ntn", before.getNtn())
                .containsEntry("status", "ACTIVE");
    }

    @Test
    void shouldUpdateNtnWhenUnique() {
        final StoreOwner owner = createStore();
        final String newNtn = TestDataFactory.uniqueNtn();

        final ResponseEntity<String> response = patchJson(STORE_URL,
                """
                        {"ntn": "%s"}""".formatted(newNtn), owner.token());

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        final Map<String, Object> store = JsonPath.read(response.getBody(), "$");
        assertThat(store).containsEntry("ntn", newNtn);
        assertThat(requireStoreById(owner.storeId()).getNtn()).isEqualTo(newNtn);
    }

    @Test
    void shouldAcceptUnchangedNtn() {
        final StoreOwner owner = createStore();
        final String currentNtn = requireStoreById(owner.storeId()).getNtn();

        final ResponseEntity<String> response = patchJson(STORE_URL,
                """
                        {"ntn": "%s"}""".formatted(currentNtn), owner.token());

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    @Test
    void shouldRejectNtnTakenByAnotherStore() {
        final StoreOwner first = createStore();
        final StoreOwner second = createStore();
        final String takenNtn = requireStoreById(first.storeId()).getNtn();

        final ResponseEntity<String> response = patchJson(STORE_URL,
                """
                        {"ntn": "%s"}""".formatted(takenNtn), second.token());

        assertErrorMessage(response, HttpStatus.CONFLICT, "A store with this NTN already exists");
        assertThat(requireStoreById(second.storeId()).getNtn()).isNotEqualTo(takenNtn);
    }

    @Test
    void shouldRejectBlankName() {
        final StoreOwner owner = createStore();

        assertErrorMessage(patchJson(STORE_URL, """
                {"name": ""}""", owner.token()), HttpStatus.BAD_REQUEST, "name must not be blank");
        assertErrorMessage(patchJson(STORE_URL, """
                {"name": "   "}""", owner.token()), HttpStatus.BAD_REQUEST, "name must not be blank");
    }

    @Test
    void shouldRejectBlankNtn() {
        final StoreOwner owner = createStore();

        assertErrorMessage(patchJson(STORE_URL, """
                {"ntn": "  "}""", owner.token()), HttpStatus.BAD_REQUEST, "ntn must not be blank");
    }

    @Test
    void shouldRejectOversizedFields() {
        final StoreOwner owner = createStore();

        assertErrorResponse(patchJson(STORE_URL, """
                {"name": "%s"}""".formatted("a".repeat(256)), owner.token()), HttpStatus.BAD_REQUEST);
        assertErrorResponse(patchJson(STORE_URL, """
                {"ntn": "%s"}""".formatted("1".repeat(256)), owner.token()), HttpStatus.BAD_REQUEST);
        assertErrorResponse(patchJson(STORE_URL, """
                {"address": "%s"}""".formatted("a".repeat(1001)), owner.token()), HttpStatus.BAD_REQUEST);
        assertErrorResponse(patchJson(STORE_URL, """
                {"currencyCode": "%s"}""".formatted("a".repeat(11)), owner.token()), HttpStatus.BAD_REQUEST);
        assertErrorResponse(patchJson(STORE_URL, """
                {"timezone": "%s"}""".formatted("a".repeat(101)), owner.token()), HttpStatus.BAD_REQUEST);
    }

    @Test
    void shouldRejectUnknownStatusValue() {
        final StoreOwner owner = createStore();

        final ResponseEntity<String> response = patchJson(STORE_URL, """
                {"status": "IN_ACTIVE"}""", owner.token());

        assertErrorResponse(response, HttpStatus.BAD_REQUEST);
    }

    @Test
    void shouldDeactivateAndReactivateViaStatusPatch() {
        final StoreOwner owner = createStore();

        final ResponseEntity<String> deactivated = patchJson(STORE_URL, """
                {"status": "INACTIVE"}""", owner.token());
        assertThat(deactivated.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat((Map<String, Object>) JsonPath.read(deactivated.getBody(), "$"))
                .containsEntry("status", "INACTIVE");
        assertThat(requireStoreById(owner.storeId()).getStatus()).isEqualTo(RowStatus.INACTIVE);

        final ResponseEntity<String> reactivated = patchJson(STORE_URL, """
                {"status": "ACTIVE"}""", owner.token());
        assertThat(reactivated.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat((Map<String, Object>) JsonPath.read(reactivated.getBody(), "$"))
                .containsEntry("status", "ACTIVE");
        assertThat(requireStoreById(owner.storeId()).getStatus()).isEqualTo(RowStatus.ACTIVE);
    }

    @Test
    void shouldReturn404WhenUserHasNoStore() {
        final String token = signupAndGetToken(TestDataFactory.personName(),
                TestDataFactory.uniqueEmail(), TestDataFactory.validPassword());

        final ResponseEntity<String> response = patchJson(STORE_URL, """
                {"name": "%s"}""".formatted(TestDataFactory.storeName()), token);

        assertErrorMessage(response, HttpStatus.NOT_FOUND, "You don't have a store yet");
    }

    @Test
    void shouldReturn403ForCashier() {
        final StoreOwner owner = createStore();
        final String cashierToken = signupCashierAttachedToStore(owner.storeId());
        final String originalName = requireStoreById(owner.storeId()).getName();

        final ResponseEntity<String> response = patchJson(STORE_URL, """
                {"name": "%s"}""".formatted(TestDataFactory.storeName()), cashierToken);

        assertErrorMessage(response, HttpStatus.FORBIDDEN,
                "Only the store owner can perform this action");
        assertThat(requireStoreById(owner.storeId()).getName()).isEqualTo(originalName);
    }

    @Test
    void shouldRejectRequestWithoutToken() {
        final ResponseEntity<String> response = patchJson(STORE_URL, """
                {"name": "%s"}""".formatted(TestDataFactory.storeName()), null);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

}
