package com.sastapos.sasta_pos.vendor;

import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.JsonPath;
import com.sastapos.sasta_pos.user.User;
import com.sastapos.sasta_pos.user.UserRole;
import com.sastapos.sasta_pos.vendor.support.VendorApiTestBase;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

class VendorPaymentApiTests extends VendorApiTestBase {

    @Test
    void shouldRecordOutgoingPaymentToVendorAndIncreaseBalance() {
        final StoreOwner owner = createStore();
        final UUID vendorId = createVendor(owner.token());
        setBalance(vendorId, "-1000.00"); // Store owes vendor Rs 1,000

        // Pay vendor Rs 600 (OUTGOING payment)
        final String body = settlementJson("600.00", "BANK", "OUTGOING");
        final ResponseEntity<String> response = postJson(vendorPaymentsUrl(vendorId), body, owner.token());
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        final Map<String, Object> payment = JsonPath.read(response.getBody(), "$.payment");
        assertThat(payment).containsEntry("amount", 600.0)
                .containsEntry("method", "BANK")
                .containsEntry("direction", "OUTGOING")
                .containsEntry("vendorId", vendorId.toString());

        final Map<String, Object> entry = JsonPath.read(response.getBody(), "$.ledgerEntry");
        assertThat(entry).containsEntry("direction", "DEBIT")
                .containsEntry("type", "PAYMENT")
                .containsEntry("vendorId", vendorId.toString());

        assertDecimal(response.getBody(), "$.vendor.accountBalance", "-400.00");
        assertThat((String) JsonPath.read(response.getBody(), "$.vendor.balanceState")).isEqualTo("STORE_OWES_PARTY");
    }

    @Test
    void shouldRecordIncomingPaymentFromVendorAndDecreaseBalance() {
        final StoreOwner owner = createStore();
        final UUID vendorId = createVendor(owner.token());
        setBalance(vendorId, "500.00"); // Vendor owes store Rs 500 (advance)

        // Vendor refunds Rs 500 (INCOMING payment)
        final String body = settlementJson("500.00", "CASH", "INCOMING");
        final ResponseEntity<String> response = postJson(vendorPaymentsUrl(vendorId), body, owner.token());
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        final Map<String, Object> entry = JsonPath.read(response.getBody(), "$.ledgerEntry");
        assertThat(entry).containsEntry("direction", "CREDIT")
                .containsEntry("type", "PAYMENT");

        assertDecimal(response.getBody(), "$.vendor.accountBalance", "0.00");
        assertThat((String) JsonPath.read(response.getBody(), "$.vendor.balanceState")).isEqualTo("SETTLED");
    }

    @Test
    void shouldListPaymentsWithFilters() {
        final StoreOwner owner = createStore();
        final UUID vendorId = createVendor(owner.token());
        postJson(vendorPaymentsUrl(vendorId), settlementJson("250.00", "CASH", "OUTGOING"), owner.token());

        final ResponseEntity<String> response = restTemplate.exchange(
                PAYMENTS_URL + "?vendorId=" + vendorId, org.springframework.http.HttpMethod.GET,
                new org.springframework.http.HttpEntity<>(null, authHeaders(owner.token())), String.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        final List<Map<String, Object>> content = JsonPath.read(response.getBody(), "$.content");
        assertThat(content).hasSize(1);
        assertThat(content.get(0)).containsEntry("amount", 250.0);
    }

    @Test
    void shouldRejectBothCustomerAndVendorFiltersOnPaymentsList() {
        final StoreOwner owner = createStore();
        final ResponseEntity<String> response = restTemplate.exchange(
                PAYMENTS_URL + "?vendorId=" + UUID.randomUUID() + "&customerId=" + UUID.randomUUID(),
                org.springframework.http.HttpMethod.GET,
                new org.springframework.http.HttpEntity<>(null, authHeaders(owner.token())), String.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void shouldVoidStandalonePaymentByOwner() {
        final StoreOwner owner = createStore();
        final UUID vendorId = createVendor(owner.token());
        setBalance(vendorId, "-1000.00");

        // Pay Rs 600 -> balance becomes -400.00
        final ResponseEntity<String> payResponse = postJson(vendorPaymentsUrl(vendorId),
                settlementJson("600.00", "CASH", "OUTGOING"), owner.token());
        final UUID paymentId = UUID.fromString(JsonPath.read(payResponse.getBody(), "$.payment.id"));

        // Void the payment
        final ResponseEntity<String> voidResponse = postJson(
                PAYMENTS_URL + "/" + paymentId + "/void", voidJson("Recording error duplicate entry"), owner.token());

        assertThat(voidResponse.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat((boolean) JsonPath.read(voidResponse.getBody(), "$.voidedPayment.voided")).isTrue();
        assertThat((boolean) JsonPath.read(voidResponse.getBody(), "$.voidedEntry.voided")).isTrue();

        final Map<String, Object> reversal = JsonPath.read(voidResponse.getBody(), "$.reversalEntry");
        assertThat(reversal).containsEntry("direction", "CREDIT") // Opposite of original DEBIT
                .containsEntry("type", "ADJUSTMENT")
                .containsEntry("isReversal", true);

        // Balance restored back to -1000.00
        assertDecimal(voidResponse.getBody(), "$.vendor.accountBalance", "-1000.00");
    }

    @Test
    void shouldRejectVoidingAlreadyVoidedPayment() {
        final StoreOwner owner = createStore();
        final UUID vendorId = createVendor(owner.token());

        final ResponseEntity<String> payResponse = postJson(vendorPaymentsUrl(vendorId),
                settlementJson("300.00", "CASH", "OUTGOING"), owner.token());
        final UUID paymentId = UUID.fromString(JsonPath.read(payResponse.getBody(), "$.payment.id"));

        postJson(PAYMENTS_URL + "/" + paymentId + "/void", voidJson("First void"), owner.token());
        final ResponseEntity<String> secondVoid = postJson(
                PAYMENTS_URL + "/" + paymentId + "/void", voidJson("Second void"), owner.token());

        assertThat(secondVoid.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
    }

    private org.springframework.http.HttpHeaders authHeaders(final String token) {
        final org.springframework.http.HttpHeaders h = new org.springframework.http.HttpHeaders();
        h.setBearerAuth(token);
        return h;
    }

}
