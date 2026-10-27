package com.sastapos.sasta_pos.vendor;

import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.JsonPath;
import com.sastapos.sasta_pos.vendor.support.VendorApiTestBase;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

class CreateVendorApiTests extends VendorApiTestBase {

    @Test
    void shouldCreateVendorWithOnlyNameAndApplyDefaults() {
        final StoreOwner owner = createStore();
        final String name = uniqueName();

        final ResponseEntity<String> response = postJson(VENDORS_URL, vendorJson(name), owner.token());

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        final Map<String, Object> vendor = JsonPath.read(response.getBody(), "$");
        assertVendorShape(vendor);
        assertThat(vendor).containsEntry("name", name)
                .containsEntry("phoneNumber", null)
                .containsEntry("ntn", null)
                .containsEntry("strn", null)
                .containsEntry("salesTaxRegistrationStatus", "UNREGISTERED")
                .containsEntry("status", "ACTIVE")
                .containsEntry("balanceState", "SETTLED")
                .containsEntry("storeId", owner.storeId().toString());
        assertDecimal(response.getBody(), "$.accountBalance", "0");
        assertDecimal(response.getBody(), "$.balanceAmount", "0");
        assertThat((String) vendor.get("createdAt")).isNotBlank();
        assertThat(vendorRepository.count()).isEqualTo(1);
    }

    @Test
    void shouldCreateVendorWithAllFieldsAndTrimValues() {
        final StoreOwner owner = createStore();
        final String phone = uniquePhone();

        final String body = vendorJson("  Super Supplier  ", "  " + phone + "  ", " 1234567-8 ",
                " 9876543-2 ", "REGISTERED", " 123 Main St ");
        final ResponseEntity<String> response = postJson(VENDORS_URL, body, owner.token());

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        final Map<String, Object> vendor = JsonPath.read(response.getBody(), "$");
        assertThat(vendor).containsEntry("name", "Super Supplier")
                .containsEntry("phoneNumber", phone)
                .containsEntry("ntn", "1234567-8")
                .containsEntry("strn", "9876543-2")
                .containsEntry("salesTaxRegistrationStatus", "REGISTERED")
                .containsEntry("address", "123 Main St");
    }

    @Test
    void shouldRejectBlankName() {
        final StoreOwner owner = createStore();
        final ResponseEntity<String> response = postJson(VENDORS_URL, vendorJson("   "), owner.token());
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void shouldRejectDuplicateNameInSameStore() {
        final StoreOwner owner = createStore();
        final String name = uniqueName();
        createVendor(owner.token(), vendorJson(name));

        final ResponseEntity<String> response = postJson(VENDORS_URL, vendorJson(name.toLowerCase()), owner.token());
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
    }

    @Test
    void shouldAllowSameNameInDifferentStore() {
        final StoreOwner owner1 = createStore();
        final StoreOwner owner2 = createStore();
        final String name = uniqueName();

        createVendor(owner1.token(), vendorJson(name));
        final ResponseEntity<String> response = postJson(VENDORS_URL, vendorJson(name), owner2.token());
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
    }

    @Test
    void shouldRejectDuplicatePhoneAcrossVendors() {
        final StoreOwner owner1 = createStore();
        final StoreOwner owner2 = createStore();
        final String phone = uniquePhone();

        createVendor(owner1.token(), vendorJson(uniqueName(), phone, null, null, "UNREGISTERED", null));
        final ResponseEntity<String> response = postJson(VENDORS_URL,
                vendorJson(uniqueName(), phone, null, null, "UNREGISTERED", null), owner2.token());
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
    }

    @Test
    void shouldRequireStrnWhenSalesTaxRegistrationStatusIsRegistered() {
        final StoreOwner owner = createStore();
        final String bodyWithoutStrn = vendorJson(uniqueName(), null, null, "", "REGISTERED", null);
        final ResponseEntity<String> response = postJson(VENDORS_URL, bodyWithoutStrn, owner.token());
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void shouldAllowUnregisteredWithoutStrn() {
        final StoreOwner owner = createStore();
        final String body = vendorJson(uniqueName(), null, null, null, "UNREGISTERED", null);
        final ResponseEntity<String> response = postJson(VENDORS_URL, body, owner.token());
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
    }

    @Test
    void shouldRejectUnauthorized() {
        final ResponseEntity<String> response = postJson(VENDORS_URL, vendorJson(uniqueName()), null);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

}

