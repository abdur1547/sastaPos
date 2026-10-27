package com.sastapos.sasta_pos.sync;

import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.JsonPath;
import com.sastapos.sasta_pos.vendor.support.VendorApiTestBase;
import java.math.BigDecimal;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;

class SyncVendorUploadApiTests extends VendorApiTestBase {

    @Autowired
    private JdbcTemplate jdbc;

    private record Fixture(StoreOwner owner, UUID vendor, UUID user, UUID payment) {
    }

    private Fixture fixture() {
        final StoreOwner owner = createStore();
        final UUID vendorId = createVendor(owner.token());
        return new Fixture(owner, vendorId,
                jdbc.queryForObject("SELECT id FROM users WHERE store_id = ?", UUID.class, owner.storeId()),
                UUID.randomUUID());
    }

    private static String operation(final String table, final String op, final UUID id, final String data) {
        return "{\"table\":\"%s\",\"op\":\"%s\",\"id\":\"%s\"%s}".formatted(
                table, op, id, data == null ? "" : ",\"data\":" + data);
    }

    private static String vendorData(final StoreOwner owner, final String name) {
        return """
                {"name":"%s","sales_tax_registration_status":"UNREGISTERED","status":"ACTIVE",
                "store_id":"%s","date_created":"2026-10-27T10:00:00Z","last_updated":"2026-10-27T10:00:00Z"}
                """.formatted(name, owner.storeId());
    }

    private static String vendorPaymentData(final Fixture f, final String amount, final String method, final String direction) {
        return """
                {"direction":"%s","amount":"%s","method":"%s","vendor_id":"%s",
                "store_id":"%s","user_id":"%s","reference_number":"V-TRX-1","description":"Settlement",
                "sale_id":null,"date_created":"2026-10-27T10:00:00Z","last_updated":"2026-10-27T10:00:00Z"}
                """.formatted(direction, amount, method, f.vendor(), f.owner().storeId(), f.user());
    }

    private ResponseEntity<String> upload(final String token, final String... operations) {
        return postJson("/api/sync/upload", "{\"operations\":[" + String.join(",", operations) + "]}", token);
    }

    @Test
    void shouldUploadNewVendorAndCreateOfflineRow() {
        final StoreOwner owner = createStore();
        final UUID newVendorId = UUID.randomUUID();

        final ResponseEntity<String> response = upload(owner.token(),
                operation("vendors", "PUT", newVendorId, vendorData(owner, "Offline Supplier")));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(vendorRepository.findById(newVendorId)).isPresent();
        assertThat(vendorRepository.findById(newVendorId).get().getName()).isEqualTo("Offline Supplier");
    }

    @Test
    void shouldUploadVendorPaymentAndPostLedgerAndUpdateBalance() {
        final Fixture f = fixture();
        setBalance(f.vendor(), "-1000.00");

        final ResponseEntity<String> response = upload(f.owner().token(),
                operation("payments", "PUT", f.payment(), vendorPaymentData(f, "600.00", "CASH", "OUTGOING")));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);

        // Verify balance updated: -1000 + 600 = -400
        final BigDecimal newBalance = jdbc.queryForObject(
                "SELECT account_balance FROM vendors WHERE id = ?", BigDecimal.class, f.vendor());
        assertThat(newBalance).isEqualByComparingTo("-400.00");

        // Verify ledger entry posted
        final String direction = jdbc.queryForObject(
                "SELECT direction FROM ledger_entries WHERE id = ?", String.class, f.payment());
        assertThat(direction).isEqualTo("DEBIT");
    }

}

