package com.sastapos.sasta_pos.vendor;

import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.JsonPath;
import com.sastapos.sasta_pos.payment.Payment;
import com.sastapos.sasta_pos.payment.PaymentDirection;
import com.sastapos.sasta_pos.payment.PaymentMethod;
import com.sastapos.sasta_pos.vendor.support.VendorApiTestBase;
import java.math.BigDecimal;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

class DeleteVendorApiTests extends VendorApiTestBase {

    @Test
    void shouldHardDeleteVendorWithZeroBalanceAndNoHistory() {
        final StoreOwner owner = createStore();
        final UUID vendorId = createVendor(owner.token());

        final ResponseEntity<String> response = deleteJson(vendorUrl(vendorId), owner.token());

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        assertThat(vendorRepository.findById(vendorId)).isEmpty();
    }

    @Test
    void shouldSoftDeleteVendorWhenHistoryExists() {
        final StoreOwner owner = createStore();
        final UUID vendorId = createVendor(owner.token());

        // Create a dummy payment to give this vendor history
        final Vendor vendor = vendorRepository.findById(vendorId).orElseThrow();
        final Payment payment = new Payment();
        payment.setAmount(new BigDecimal("100.00"));
        payment.setMethod(PaymentMethod.CASH);
        payment.setDirection(PaymentDirection.OUTGOING);
        payment.setVendor(vendor);
        payment.setStore(vendor.getStore());
        payment.setUser(userRepository.findAll().get(0));
        paymentRepository.saveAndFlush(payment);

        final ResponseEntity<String> response = deleteJson(vendorUrl(vendorId), owner.token());

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat((String) JsonPath.read(response.getBody(), "$.vendor.status")).isEqualTo("INACTIVE");
        assertThat((String) JsonPath.read(response.getBody(), "$.message")).contains("history");
        assertThat(vendorRepository.findById(vendorId)).isPresent();
    }

    @Test
    void shouldRejectDeleteWhenBalanceIsPositive() {
        final StoreOwner owner = createStore();
        final UUID vendorId = createVendor(owner.token());
        setBalance(vendorId, "500.00");

        final ResponseEntity<String> response = deleteJson(vendorUrl(vendorId), owner.token());

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(response.getBody()).contains("outstanding balance");
    }

    @Test
    void shouldRejectDeleteWhenBalanceIsNegative() {
        final StoreOwner owner = createStore();
        final UUID vendorId = createVendor(owner.token());
        setBalance(vendorId, "-300.00");

        final ResponseEntity<String> response = deleteJson(vendorUrl(vendorId), owner.token());

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(response.getBody()).contains("outstanding balance");
    }

    @Test
    void shouldReturn404WhenVendorNotFound() {
        final StoreOwner owner = createStore();
        final ResponseEntity<String> response = deleteJson(vendorUrl(UUID.randomUUID()), owner.token());
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    }

}

