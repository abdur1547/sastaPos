package com.sastapos.sasta_pos.vendor.support;

import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.JsonPath;
import com.sastapos.sasta_pos.store.support.StoreApiTestBase;
import com.sastapos.sasta_pos.vendor.Vendor;
import java.math.BigDecimal;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

public abstract class VendorApiTestBase extends StoreApiTestBase {

    protected static final String VENDORS_URL = "/api/vendors";
    protected static final String PAYMENTS_URL = "/api/payments";

    protected static String uniqueName() {
        return "Vendor " + UUID.randomUUID();
    }

    protected static String uniquePhone() {
        return "+92" + (long) (Math.random() * 9_000_000_000L + 1_000_000_000L);
    }

    protected static String vendorJson(final String name) {
        return """
                {"name": "%s"}""".formatted(name);
    }

    protected static String vendorJson(final String name, final String phone, final String ntn,
            final String strn, final String regStatus, final String address) {
        final StringBuilder json = new StringBuilder("{\"name\": \"").append(name).append("\"");
        if (phone != null) {
            json.append(", \"phoneNumber\": \"").append(phone).append("\"");
        }
        if (ntn != null) {
            json.append(", \"ntn\": \"").append(ntn).append("\"");
        }
        if (strn != null) {
            json.append(", \"strn\": \"").append(strn).append("\"");
        }
        if (regStatus != null) {
            json.append(", \"salesTaxRegistrationStatus\": \"").append(regStatus).append("\"");
        }
        if (address != null) {
            json.append(", \"address\": \"").append(address).append("\"");
        }
        return json.append("}").toString();
    }

    protected static String settlementJson(final String amount, final String method, final String direction) {
        final StringBuilder json = new StringBuilder("{\"amount\": ").append(amount)
                .append(", \"method\": \"").append(method).append("\"");
        if (direction != null) {
            json.append(", \"direction\": \"").append(direction).append("\"");
        }
        return json.append("}").toString();
    }

    protected static String voidJson(final String reason) {
        return """
                {"voidReason": "%s"}""".formatted(reason);
    }

    protected static String vendorUrl(final UUID id) {
        return VENDORS_URL + "/" + id;
    }

    protected static String vendorPaymentsUrl(final UUID id) {
        return vendorUrl(id) + "/payments";
    }

    protected static String vendorLedgerUrl(final UUID id) {
        return vendorUrl(id) + "/ledger";
    }

    protected static String vendorLedgerSummaryUrl(final UUID id) {
        return vendorUrl(id) + "/ledger/summary";
    }

    protected UUID createVendor(final String token) {
        return createVendor(token, vendorJson(uniqueName()));
    }

    protected UUID createVendor(final String token, final String body) {
        final ResponseEntity<String> response = postJson(VENDORS_URL, body, token);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        return UUID.fromString(JsonPath.read(response.getBody(), "$.id"));
    }

    protected void setBalance(final UUID vendorId, final String balance) {
        final Vendor vendor = vendorRepository.findById(vendorId).orElseThrow();
        vendor.setAccountBalance(new BigDecimal(balance));
        vendorRepository.save(vendor);
    }

    protected static void assertVendorShape(final Map<String, Object> vendor) {
        assertThat(vendor.keySet()).contains(
                "id", "name", "phoneNumber", "ntn", "strn",
                "salesTaxRegistrationStatus", "address", "accountBalance",
                "balanceAmount", "balanceState", "status", "storeId",
                "createdAt", "lastUpdated"
        );
    }

    protected static BigDecimal decimal(final String json, final String path) {
        return new BigDecimal(String.valueOf((Object) JsonPath.read(json, path)));
    }

    protected static void assertDecimal(final String json, final String path, final String expected) {
        assertThat(decimal(json, path)).isEqualByComparingTo(expected);
    }

}

