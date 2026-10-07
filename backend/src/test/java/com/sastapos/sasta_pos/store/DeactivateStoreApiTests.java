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
 * Use case 3d — deactivate store: soft-delete only (status = INACTIVE), OWNER-only,
 * idempotency guarded by 409.
 */
class DeactivateStoreApiTests extends StoreApiTestBase {

    @Test
    void shouldDeactivateStore() {
        final StoreOwner owner = createStore();

        final ResponseEntity<String> response = deleteJson(STORE_URL, owner.token());

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        final Map<String, Object> store = JsonPath.read(response.getBody(), "$");
        assertStoreShape(store);
        assertThat(store).containsEntry("status", "INACTIVE");
        assertThat(requireStoreById(owner.storeId()).getStatus()).isEqualTo(RowStatus.INACTIVE);
        assertNoSensitiveData(response.getBody());
    }

    @Test
    void shouldRejectWhenAlreadyDeactivated() {
        final StoreOwner owner = createStore();
        deleteJson(STORE_URL, owner.token());

        final ResponseEntity<String> response = deleteJson(STORE_URL, owner.token());

        assertErrorMessage(response, HttpStatus.CONFLICT, "Store is already deactivated");
    }

    @Test
    void shouldKeepStoreInDatabaseAfterDeactivation() {
        final StoreOwner owner = createStore();
        deleteJson(STORE_URL, owner.token());

        // soft-delete: the row and its settings must survive for historical/financial records
        final Store persisted = requireStoreById(owner.storeId());
        assertThat(persisted.getStoreSettings()).isNotNull();
    }

    @Test
    void shouldReturn404WhenUserHasNoStore() {
        final String token = signupAndGetToken(TestDataFactory.personName(),
                TestDataFactory.uniqueEmail(), TestDataFactory.validPassword());

        final ResponseEntity<String> response = deleteJson(STORE_URL, token);

        assertErrorMessage(response, HttpStatus.NOT_FOUND, "You don't have a store yet");
    }

    @Test
    void shouldReturn403ForCashier() {
        final StoreOwner owner = createStore();
        final String cashierToken = signupCashierAttachedToStore(owner.storeId());

        final ResponseEntity<String> response = deleteJson(STORE_URL, cashierToken);

        assertErrorMessage(response, HttpStatus.FORBIDDEN,
                "Only the store owner can perform this action");
        assertThat(requireStoreById(owner.storeId()).getStatus()).isEqualTo(RowStatus.ACTIVE);
    }

    @Test
    void shouldRejectRequestWithoutToken() {
        assertThat(restTemplate.exchange(STORE_URL, org.springframework.http.HttpMethod.DELETE,
                null, String.class).getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

}
