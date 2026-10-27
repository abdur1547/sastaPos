package com.sastapos.sasta_pos.store.support;

import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.JsonPath;
import com.sastapos.sasta_pos.auth.support.AuthApiTestBase;
import com.sastapos.sasta_pos.auth.support.TestDataFactory;
import com.sastapos.sasta_pos.sale.Sale;
import com.sastapos.sasta_pos.sale.SaleStatus;
import com.sastapos.sasta_pos.store.Store;
import com.sastapos.sasta_pos.user.User;
import com.sastapos.sasta_pos.user.UserRole;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;


/**
 * Base class for store end-to-end specs: the full app on a random port against real PostgreSQL
 * (see {@link AuthApiTestBase}), plus store-specific HTTP helpers, request builders, and flow
 * helpers. Every spec signs up its own users and creates its own stores via the API; direct
 * repository access is reserved for states the API cannot produce (a CASHIER attached to a
 * store, an existing sale).
 */
public abstract class StoreApiTestBase extends AuthApiTestBase {

    protected static final String STORE_URL = "/api/store";
    protected static final String STORE_SETTINGS_URL = "/api/store/settings";

    /** An owner that just created a store: their token and the created store's id. */
    protected record StoreOwner(String token, UUID storeId) {
    }

    // ---------- HTTP helpers ----------

    protected ResponseEntity<String> patchJson(final String url, final String jsonBody,
            final String bearerToken) {
        return restTemplate.exchange(url, HttpMethod.PATCH,
                new HttpEntity<>(jsonBody, jsonHeaders(bearerToken)), String.class);
    }

    protected ResponseEntity<String> deleteJson(final String url, final String bearerToken) {
        return restTemplate.exchange(url, HttpMethod.DELETE,
                new HttpEntity<>(jsonHeaders(bearerToken)), String.class);
    }

    private HttpHeaders jsonHeaders(final String bearerToken) {
        final HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        if (bearerToken != null) {
            headers.setBearerAuth(bearerToken);
        }
        return headers;
    }

    // ---------- Request body builders ----------

    protected static String createStoreJson(final String name, final String ntn) {
        return """
                {"name": "%s", "ntn": "%s"}""".formatted(name, ntn);
    }

    // ---------- Flow helpers ----------

    /** Signs up a fresh user and creates their store; asserts the create succeeds. */
    protected StoreOwner createStore() {
        final String token = signupAndGetToken(TestDataFactory.personName(),
                TestDataFactory.uniqueEmail(), TestDataFactory.validPassword());
        final ResponseEntity<String> response = postJson(STORE_URL,
                createStoreJson(TestDataFactory.storeName(), TestDataFactory.uniqueNtn()), token);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        final String storeId = JsonPath.read(response.getBody(), "$.store.id");
        final String freshToken = JsonPath.read(response.getBody(), "$.accessToken");
        return new StoreOwner(freshToken != null ? freshToken : token, UUID.fromString(storeId));
    }

    /**
     * Signs up a second user and attaches them to the given store as a CASHIER — a state the
     * store API cannot produce on its own (store creation always promotes to OWNER).
     */
    protected String signupCashierAttachedToStore(final UUID storeId) {
        final String email = TestDataFactory.uniqueEmail();
        final String token = signupAndGetToken(TestDataFactory.personName(), email,
                TestDataFactory.validPassword());
        final User cashier = requireUserByEmail(email);
        cashier.setStore(storeRepository.getReferenceById(storeId));
        cashier.setRole(UserRole.CASHIER);
        userRepository.save(cashier);
        return token;
    }

    /**
     * Persists a minimal sale for the store — the state that locks {@code invoiceNumberStart}
     * (use case 3c). No API creates sales yet, so the row is built directly.
     */
    protected void recordSale(final UUID storeId) {
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
        saleRepository.save(sale);
    }

    protected Store requireStoreById(final UUID storeId) {
        return storeRepository.findById(storeId)
                .orElseThrow(() -> new AssertionError("Expected store to exist: " + storeId));
    }

    // ---------- Assertion helpers ----------

    /** Structural contract of the store payload returned by every store endpoint. */
    protected static void assertStoreShape(final Map<String, Object> store) {
        assertThat(store.keySet())
                .containsExactlyInAnyOrder("id", "name", "ntn", "address", "currencyCode",
                        "timezone", "status", "storeSettings");
        assertThat((Map<String, Object>) store.get("storeSettings"))
                .containsKeys("id", "invoicePrefix", "invoiceNumberStart", "nextInvoiceNumber",
                        "receiptFooter");
    }

}
