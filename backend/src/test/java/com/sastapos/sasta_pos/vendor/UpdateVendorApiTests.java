package com.sastapos.sasta_pos.vendor;

import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.JsonPath;
import com.sastapos.sasta_pos.vendor.support.VendorApiTestBase;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

class UpdateVendorApiTests extends VendorApiTestBase {

    @Test
    void shouldUpdateVendorIdentityFields() {
        final StoreOwner owner = createStore();
        final UUID vendorId = createVendor(owner.token());
        final String newPhone = uniquePhone();

        final String updateBody = """
                {
                    "name": "Updated Supplier",
                    "phoneNumber": "%s",
                    "ntn": "7654321-0",
                    "address": "456 Side St"
                }
                """.formatted(newPhone);

        final ResponseEntity<String> response = patchJson(vendorUrl(vendorId), updateBody, owner.token());

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        final Map<String, Object> vendor = JsonPath.read(response.getBody(), "$");
        assertThat(vendor).containsEntry("name", "Updated Supplier")
                .containsEntry("phoneNumber", newPhone)
                .containsEntry("ntn", "7654321-0")
                .containsEntry("address", "456 Side St");
    }

    @Test
    void shouldUpdateStatusToInactive() {
        final StoreOwner owner = createStore();
        final UUID vendorId = createVendor(owner.token());

        final ResponseEntity<String> response = patchJson(vendorUrl(vendorId), "{\"status\": \"INACTIVE\"}", owner.token());
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat((String) JsonPath.read(response.getBody(), "$.status")).isEqualTo("INACTIVE");
    }

    @Test
    void shouldRejectNameConflict() {
        final StoreOwner owner = createStore();
        final String name1 = uniqueName();
        final String name2 = uniqueName();

        createVendor(owner.token(), vendorJson(name1));
        final UUID vendor2 = createVendor(owner.token(), vendorJson(name2));

        final ResponseEntity<String> response = patchJson(vendorUrl(vendor2), vendorJson(name1.toLowerCase()), owner.token());
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
    }

    @Test
    void shouldRequireStrnWhenStatusUpdatedToRegistered() {
        final StoreOwner owner = createStore();
        final UUID vendorId = createVendor(owner.token(), vendorJson(uniqueName(), null, null, null, "UNREGISTERED", null));

        final ResponseEntity<String> response = patchJson(vendorUrl(vendorId),
                "{\"salesTaxRegistrationStatus\": \"REGISTERED\"}", owner.token());
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void shouldRejectUpdatingOtherStoreVendor() {
        final StoreOwner owner1 = createStore();
        final StoreOwner owner2 = createStore();
        final UUID vendor1 = createVendor(owner1.token());

        final ResponseEntity<String> response = patchJson(vendorUrl(vendor1), "{\"name\": \"Hacked\"}", owner2.token());
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    }

    @Test
    void shouldReturn404WhenVendorNotFound() {
        final StoreOwner owner = createStore();
        final ResponseEntity<String> response = patchJson(vendorUrl(UUID.randomUUID()), "{\"name\": \"Missing\"}", owner.token());
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    }

}

