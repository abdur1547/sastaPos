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

class VendorLedgerApiTests extends VendorApiTestBase {

    @Test
    void shouldGetVendorLedgerWithPaginationAndFilters() {
        final StoreOwner owner = createStore();
        final UUID vendorId = createVendor(owner.token());

        // 1. Pay vendor Rs 400 (OUTGOING, DEBIT)
        postJson(vendorPaymentsUrl(vendorId), settlementJson("400.00", "CASH", "OUTGOING"), owner.token());
        // 2. Advance refund Rs 100 (INCOMING, CREDIT)
        postJson(vendorPaymentsUrl(vendorId), settlementJson("100.00", "BANK", "INCOMING"), owner.token());

        final ResponseEntity<String> response = restTemplate.exchange(
                vendorLedgerUrl(vendorId), org.springframework.http.HttpMethod.GET,
                new org.springframework.http.HttpEntity<>(null, authHeaders(owner.token())), String.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        final List<Map<String, Object>> content = JsonPath.read(response.getBody(), "$.content");
        assertThat(content).hasSize(2);
        assertThat((int) JsonPath.read(response.getBody(), "$.totalElements")).isEqualTo(2);

        // Filter by direction DEBIT
        final ResponseEntity<String> debitResponse = restTemplate.exchange(
                vendorLedgerUrl(vendorId) + "?direction=DEBIT", org.springframework.http.HttpMethod.GET,
                new org.springframework.http.HttpEntity<>(null, authHeaders(owner.token())), String.class);
        final List<Map<String, Object>> debitContent = JsonPath.read(debitResponse.getBody(), "$.content");
        assertThat(debitContent).hasSize(1);
        assertThat(debitContent.get(0)).containsEntry("amount", 400.0);
    }

    @Test
    void shouldGetVendorLedgerSummary() {
        final StoreOwner owner = createStore();
        final UUID vendorId = createVendor(owner.token());

        // Pay vendor Rs 700 (OUTGOING, DEBIT)
        postJson(vendorPaymentsUrl(vendorId), settlementJson("700.00", "CASH", "OUTGOING"), owner.token());
        // Vendor refund Rs 200 (INCOMING, CREDIT)
        postJson(vendorPaymentsUrl(vendorId), settlementJson("200.00", "BANK", "INCOMING"), owner.token());

        final ResponseEntity<String> response = restTemplate.exchange(
                vendorLedgerSummaryUrl(vendorId), org.springframework.http.HttpMethod.GET,
                new org.springframework.http.HttpEntity<>(null, authHeaders(owner.token())), String.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertDecimal(response.getBody(), "$.debitTotal", "700.00");
        assertDecimal(response.getBody(), "$.creditTotal", "200.00");
        assertDecimal(response.getBody(), "$.netChange", "500.00");
        assertDecimal(response.getBody(), "$.currentBalance", "500.00");
    }

    private org.springframework.http.HttpHeaders authHeaders(final String token) {
        final org.springframework.http.HttpHeaders h = new org.springframework.http.HttpHeaders();
        h.setBearerAuth(token);
        return h;
    }

}

