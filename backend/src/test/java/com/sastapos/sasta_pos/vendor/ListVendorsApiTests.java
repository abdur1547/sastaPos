package com.sastapos.sasta_pos.vendor;

import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.JsonPath;
import com.sastapos.sasta_pos.vendor.support.VendorApiTestBase;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

class ListVendorsApiTests extends VendorApiTestBase {

    @Test
    void shouldListVendorsWithPaginationAndDefaults() {
        final StoreOwner owner = createStore();
        createVendor(owner.token(), vendorJson("Alpha Supplies"));
        createVendor(owner.token(), vendorJson("Beta Supplies"));

        final ResponseEntity<String> response = restTemplate.exchange(
                VENDORS_URL, org.springframework.http.HttpMethod.GET,
                new org.springframework.http.HttpEntity<>(null, authHeaders(owner.token())), String.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        final List<Map<String, Object>> content = JsonPath.read(response.getBody(), "$.content");
        assertThat(content).hasSize(2);
        assertThat((int) JsonPath.read(response.getBody(), "$.totalElements")).isEqualTo(2);
    }

    @Test
    void shouldFilterBySearch() {
        final StoreOwner owner = createStore();
        final String phone = uniquePhone();
        createVendor(owner.token(), vendorJson("Alpha Ltd", phone, "1122334-5", "STRN-999", "REGISTERED", null));
        createVendor(owner.token(), vendorJson("Beta Traders"));

        final ResponseEntity<String> response = restTemplate.exchange(
                VENDORS_URL + "?search=STRN-999", org.springframework.http.HttpMethod.GET,
                new org.springframework.http.HttpEntity<>(null, authHeaders(owner.token())), String.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        final List<Map<String, Object>> content = JsonPath.read(response.getBody(), "$.content");
        assertThat(content).hasSize(1);
        assertThat(content.get(0)).containsEntry("name", "Alpha Ltd");
    }

    @Test
    void shouldFilterByBalanceState() {
        final StoreOwner owner = createStore();
        final UUID v1 = createVendor(owner.token(), vendorJson("Owes Us"));
        final UUID v2 = createVendor(owner.token(), vendorJson("We Owe"));
        final UUID v3 = createVendor(owner.token(), vendorJson("Settled Vendor"));

        setBalance(v1, "500.00");
        setBalance(v2, "-200.00");
        setBalance(v3, "0.00");

        final ResponseEntity<String> r1 = restTemplate.exchange(
                VENDORS_URL + "?balanceState=PARTY_OWES_STORE", org.springframework.http.HttpMethod.GET,
                new org.springframework.http.HttpEntity<>(null, authHeaders(owner.token())), String.class);
        final List<Map<String, Object>> c1 = JsonPath.read(r1.getBody(), "$.content");
        assertThat(c1).hasSize(1);
        assertThat(c1.get(0)).containsEntry("name", "Owes Us");

        final ResponseEntity<String> r2 = restTemplate.exchange(
                VENDORS_URL + "?balanceState=STORE_OWES_PARTY", org.springframework.http.HttpMethod.GET,
                new org.springframework.http.HttpEntity<>(null, authHeaders(owner.token())), String.class);
        final List<Map<String, Object>> c2 = JsonPath.read(r2.getBody(), "$.content");
        assertThat(c2).hasSize(1);
        assertThat(c2.get(0)).containsEntry("name", "We Owe");
    }

    @Test
    void shouldRejectMinBalanceGreaterThanMaxBalance() {
        final StoreOwner owner = createStore();
        final ResponseEntity<String> response = restTemplate.exchange(
                VENDORS_URL + "?minBalance=100&maxBalance=50", org.springframework.http.HttpMethod.GET,
                new org.springframework.http.HttpEntity<>(null, authHeaders(owner.token())), String.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    private org.springframework.http.HttpHeaders authHeaders(final String token) {
        final org.springframework.http.HttpHeaders h = new org.springframework.http.HttpHeaders();
        h.setBearerAuth(token);
        return h;
    }

}

