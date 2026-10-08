package com.sastapos.sasta_pos.customer.support;

import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.JsonPath;
import com.sastapos.sasta_pos.customer.Customer;
import com.sastapos.sasta_pos.sale.Sale;
import com.sastapos.sasta_pos.sale.SaleStatus;
import com.sastapos.sasta_pos.store.support.StoreApiTestBase;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;


/** Base class for customer end-to-end specs (use cases 6–6e). Sales have no API yet and are seeded. */
public abstract class CustomerApiTestBase extends StoreApiTestBase {

    protected static final String CUSTOMERS_URL = "/api/customers";

    // ---------- Request builders ----------

    protected static String uniqueName() {
        return "Customer " + UUID.randomUUID();
    }

    protected static String uniquePhone() {
        return "+92" + (long) (Math.random() * 9_000_000_000L + 1_000_000_000L);
    }

    protected static String customerJson(final String name) {
        return """
                {"name": "%s"}""".formatted(name);
    }

    protected static String customerJson(final String name, final String phone, final String ntn) {
        final StringBuilder json = new StringBuilder("{\"name\": \"").append(name).append("\"");
        if (phone != null) {
            json.append(", \"phoneNumber\": \"").append(phone).append("\"");
        }
        if (ntn != null) {
            json.append(", \"ntn\": \"").append(ntn).append("\"");
        }
        return json.append("}").toString();
    }

    protected static String paymentJson(final String amount, final String method) {
        return """
                {"amount": %s, "method": "%s"}""".formatted(amount, method);
    }

    protected static String voidJson(final String reason) {
        return """
                {"voidReason": "%s"}""".formatted(reason);
    }

    // ---------- URLs ----------

    protected static String customerUrl(final UUID id) {
        return CUSTOMERS_URL + "/" + id;
    }

    protected static String paymentsUrl(final UUID id) {
        return customerUrl(id) + "/payments";
    }

    protected static String voidUrl(final UUID customerId, final UUID entryId) {
        return paymentsUrl(customerId) + "/" + entryId + "/void";
    }

    // ---------- Flow helpers ----------

    protected UUID createCustomer(final String token) {
        return createCustomer(token, customerJson(uniqueName()));
    }

    protected UUID createCustomer(final String token, final String body) {
        final ResponseEntity<String> response = postJson(CUSTOMERS_URL, body, token);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        return UUID.fromString(JsonPath.read(response.getBody(), "$.id"));
    }

    /** Takes a payment (which sets balance = -amount for a fresh customer) and returns the ledger entry id. */
    protected UUID takePayment(final String token, final UUID customerId, final String amount) {
        final ResponseEntity<String> response = postJson(paymentsUrl(customerId), paymentJson(amount, "CASH"),
                token);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        return UUID.fromString(JsonPath.read(response.getBody(), "$.ledgerEntry.id"));
    }

    /** Directly sets the balance — the only way to model "owes money" since credit sales have no API yet. */
    protected void setBalance(final UUID customerId, final String balance) {
        final Customer customer = customerRepository.findById(customerId).orElseThrow();
        customer.setAccountBalance(new BigDecimal(balance));
        customerRepository.save(customer);
    }

    protected Customer requireCustomerById(final UUID id) {
        return customerRepository.findById(id).orElseThrow(() -> new AssertionError("customer missing: " + id));
    }

    protected void recordSaleFor(final UUID storeId, final UUID customerId) {
        final Sale sale = new Sale();
        sale.setInvoiceNumber("TEST-" + UUID.randomUUID());
        sale.setSubtotal(new java.math.BigDecimal("100.00"));
        sale.setDiscountAmount(new java.math.BigDecimal("0.00"));
        sale.setTaxableAmount(new java.math.BigDecimal("100.00"));
        sale.setTaxAmount(new java.math.BigDecimal("0.00"));
        sale.setTotalAmount(new java.math.BigDecimal("100.00"));
        sale.setCurrencyCode("PKR");
        sale.setStatus(SaleStatus.COMPLETED);
        sale.setSoldAt(LocalDateTime.now());
        sale.setStore(storeRepository.getReferenceById(storeId));
        sale.setCustomer(customerRepository.getReferenceById(customerId));
        saleRepository.save(sale);
    }

    // ---------- Assertion helpers ----------

    protected static void assertCustomerShape(final Map<String, Object> customer) {
        assertThat(customer.keySet()).containsExactlyInAnyOrder("id", "name", "phoneNumber", "ntn",
                "accountBalance", "status", "storeId", "createdAt", "lastUpdated");
    }

    protected static BigDecimal decimal(final String json, final String path) {
        return new BigDecimal(String.valueOf((Object) JsonPath.read(json, path)));
    }

    protected static void assertDecimal(final String json, final String path, final String expected) {
        assertThat(decimal(json, path)).isEqualByComparingTo(expected);
    }

}
