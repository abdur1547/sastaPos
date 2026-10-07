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
 * Use case 3a — get current store: resolve from the authenticated user, 404 until the user
 * has created one.
 */
class GetStoreApiTests extends StoreApiTestBase {

    @Test
    void shouldReturnStoreForAuthenticatedUser() {
        final StoreOwner owner = createStore();

        final ResponseEntity<String> response = getJson(STORE_URL, owner.token());

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        final Map<String, Object> store = JsonPath.read(response.getBody(), "$");
        assertStoreShape(store);
        assertThat(store)
                .containsEntry("id", owner.storeId().toString())
                .containsEntry("status", "ACTIVE");
        assertNoSensitiveData(response.getBody());
    }

    @Test
    void shouldReturn404WhenUserHasNoStore() {
        final String token = signupAndGetToken(TestDataFactory.personName(),
                TestDataFactory.uniqueEmail(), TestDataFactory.validPassword());

        final ResponseEntity<String> response = getJson(STORE_URL, token);

        assertErrorMessage(response, HttpStatus.NOT_FOUND, "You don't have a store yet");
    }

    @Test
    void shouldReturnDeactivatedStore() {
        final StoreOwner owner = createStore();
        final ResponseEntity<String> deleteResponse = deleteJson(STORE_URL, owner.token());
        assertThat(deleteResponse.getStatusCode()).isEqualTo(HttpStatus.OK);

        final ResponseEntity<String> response = getJson(STORE_URL, owner.token());

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        final Map<String, Object> store = JsonPath.read(response.getBody(), "$");
        assertThat(store).containsEntry("status", "INACTIVE");
    }

    @Test
    void shouldRejectRequestWithoutToken() {
        assertThat(restTemplate.getForEntity(STORE_URL, String.class).getStatusCode())
                .isEqualTo(HttpStatus.UNAUTHORIZED);
    }

}
