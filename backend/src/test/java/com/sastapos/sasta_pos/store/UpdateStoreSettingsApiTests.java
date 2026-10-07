package com.sastapos.sasta_pos.store;

import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.JsonPath;
import com.sastapos.sasta_pos.auth.support.TestDataFactory;
import com.sastapos.sasta_pos.store.support.StoreApiTestBase;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;


/**
 * Use case 3c — update store settings: PATCH semantics, OWNER-only, {@code invoiceNumberStart}
 * locked once the store has sales, {@code nextInvoiceNumber} strictly system-managed.
 */
class UpdateStoreSettingsApiTests extends StoreApiTestBase {

    @Test
    void shouldUpdateInvoicePrefixAndReceiptFooter() {
        final StoreOwner owner = createStore();

        final ResponseEntity<String> response = patchJson(STORE_SETTINGS_URL, """
                {"invoicePrefix": "INV-", "receiptFooter": "Thank you for shopping!"}""",
                owner.token());

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        final Map<String, Object> settings = JsonPath.read(response.getBody(), "$");
        assertThat(settings.keySet()).containsExactlyInAnyOrder("id", "invoicePrefix",
                "invoiceNumberStart", "nextInvoiceNumber", "receiptFooter");
        assertThat(settings)
                .containsEntry("invoicePrefix", "INV-")
                .containsEntry("receiptFooter", "Thank you for shopping!")
                .containsEntry("invoiceNumberStart", 1)
                .containsEntry("nextInvoiceNumber", 1);
    }

    @Test
    void shouldResetNextInvoiceNumberWhenInvoiceNumberStartChanges() {
        final StoreOwner owner = createStore();

        final ResponseEntity<String> response = patchJson(STORE_SETTINGS_URL, """
                {"invoiceNumberStart": 100}""", owner.token());

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        final Map<String, Object> settings = JsonPath.read(response.getBody(), "$");
        assertThat(settings)
                .containsEntry("invoiceNumberStart", 100)
                .containsEntry("nextInvoiceNumber", 100);
        assertThat(requireStoreById(owner.storeId()).getStoreSettings().getNextInvoiceNumber())
                .isEqualTo(100);
    }

    @Test
    void shouldApplyEmptyPatchWithoutChanges() {
        final StoreOwner owner = createStore();

        final ResponseEntity<String> response = patchJson(STORE_SETTINGS_URL, "{}", owner.token());

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        final Map<String, Object> settings = JsonPath.read(response.getBody(), "$");
        assertThat(settings)
                .containsEntry("invoicePrefix", "")
                .containsEntry("invoiceNumberStart", 1)
                .containsEntry("nextInvoiceNumber", 1)
                .containsEntry("receiptFooter", "");
    }

    @Test
    void shouldNeverAcceptNextInvoiceNumberFromClient() {
        final StoreOwner owner = createStore();

        final ResponseEntity<String> response = patchJson(STORE_SETTINGS_URL, """
                {"invoicePrefix": "A-", "nextInvoiceNumber": 500}""", owner.token());

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        final Map<String, Object> settings = JsonPath.read(response.getBody(), "$");
        assertThat(settings)
                .containsEntry("invoicePrefix", "A-")
                .containsEntry("nextInvoiceNumber", 1);
        assertThat(requireStoreById(owner.storeId()).getStoreSettings().getNextInvoiceNumber())
                .isEqualTo(1);
    }

    @Test
    void shouldRejectNonPositiveInvoiceNumberStart() {
        final StoreOwner owner = createStore();

        assertErrorResponse(patchJson(STORE_SETTINGS_URL, """
                {"invoiceNumberStart": 0}""", owner.token()), HttpStatus.BAD_REQUEST);
        assertErrorResponse(patchJson(STORE_SETTINGS_URL, """
                {"invoiceNumberStart": -5}""", owner.token()), HttpStatus.BAD_REQUEST);
        assertThat(requireStoreById(owner.storeId()).getStoreSettings().getInvoiceNumberStart())
                .isEqualTo(1);
    }

    @Test
    void shouldRejectOversizedFields() {
        final StoreOwner owner = createStore();

        assertErrorResponse(patchJson(STORE_SETTINGS_URL, """
                {"invoicePrefix": "%s"}""".formatted("a".repeat(51)), owner.token()),
                HttpStatus.BAD_REQUEST);
        assertErrorResponse(patchJson(STORE_SETTINGS_URL, """
                {"receiptFooter": "%s"}""".formatted("a".repeat(1001)), owner.token()),
                HttpStatus.BAD_REQUEST);
    }

    @Test
    void shouldRejectInvoiceNumberStartChangeOnceSalesExist() {
        final StoreOwner owner = createStore();
        recordSale(owner.storeId());

        final ResponseEntity<String> response = patchJson(STORE_SETTINGS_URL, """
                {"invoiceNumberStart": 100}""", owner.token());

        assertErrorMessage(response, HttpStatus.CONFLICT,
                "invoiceNumberStart cannot be changed once the store has sales");
        assertThat(requireStoreById(owner.storeId()).getStoreSettings().getInvoiceNumberStart())
                .isEqualTo(1);
    }

    @Test
    void shouldAllowOtherSettingsChangesWhenSalesExist() {
        final StoreOwner owner = createStore();
        recordSale(owner.storeId());

        final ResponseEntity<String> response = patchJson(STORE_SETTINGS_URL, """
                {"invoicePrefix": "POS-", "receiptFooter": "No refunds"}""", owner.token());

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        final Map<String, Object> settings = JsonPath.read(response.getBody(), "$");
        assertThat(settings)
                .containsEntry("invoicePrefix", "POS-")
                .containsEntry("receiptFooter", "No refunds");
    }

    @Test
    void shouldReturn404WhenUserHasNoStore() {
        final String token = signupAndGetToken(TestDataFactory.personName(),
                TestDataFactory.uniqueEmail(), TestDataFactory.validPassword());

        final ResponseEntity<String> response = patchJson(STORE_SETTINGS_URL, """
                {"invoicePrefix": "INV-"}""", token);

        assertErrorMessage(response, HttpStatus.NOT_FOUND, "You don't have a store yet");
    }

    @Test
    void shouldReturn403ForCashier() {
        final StoreOwner owner = createStore();
        final String cashierToken = signupCashierAttachedToStore(owner.storeId());

        final ResponseEntity<String> response = patchJson(STORE_SETTINGS_URL, """
                {"invoicePrefix": "HACK-"}""", cashierToken);

        assertErrorMessage(response, HttpStatus.FORBIDDEN,
                "Only the store owner can perform this action");
        assertThat(requireStoreById(owner.storeId()).getStoreSettings().getInvoicePrefix())
                .isEmpty();
    }

    @Test
    void shouldRejectRequestWithoutToken() {
        final ResponseEntity<String> response = patchJson(STORE_SETTINGS_URL, """
                {"invoicePrefix": "INV-"}""", null);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

}
