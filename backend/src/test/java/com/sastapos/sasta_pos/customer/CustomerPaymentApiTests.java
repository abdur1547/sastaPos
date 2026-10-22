package com.sastapos.sasta_pos.customer;

import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.JsonPath;
import com.sastapos.sasta_pos.auth.support.TestDataFactory;
import com.sastapos.sasta_pos.customer.support.CustomerApiTestBase;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import com.sastapos.sasta_pos.ledger_entry.LedgerDirection;
import com.sastapos.sasta_pos.ledger_entry.LedgerEntry;
import com.sastapos.sasta_pos.ledger_entry.LedgerEntryType;
import com.sastapos.sasta_pos.payment.PaymentDirection;
import com.sastapos.sasta_pos.store.RowStatus;
import com.sastapos.sasta_pos.user.UserRole;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

/** Use cases 6d / 6e — take and void customer payments. */
class CustomerPaymentApiTests extends CustomerApiTestBase {

    // ---------- 6d: take payment ----------

    @Test
    void shouldRecordPaymentAndReduceBalance() {
        final StoreOwner owner = createStore();
        final UUID id = createCustomer(owner.token());
        setBalance(id, "1000.00");

        final ResponseEntity<String> response = postJson(paymentsUrl(id), """
                {"amount": 400.25, "method": "BANK", "referenceNumber": " TRX-1 ", "description": "partial"}""",
                owner.token());

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        final Map<String, Object> entry = JsonPath.read(response.getBody(), "$.ledgerEntry");
        assertThat(entry).containsEntry("direction", "CREDIT").containsEntry("type", "PAYMENT")
                .containsEntry("referenceNumber", "TRX-1").containsEntry("description", "partial")
                .containsEntry("voided", false).containsEntry("voidReason", null)
                .containsEntry("voidedAt", null).containsEntry("voidedBy", null)
                .containsEntry("saleId", null).containsEntry("customerId", id.toString());
        assertDecimal(response.getBody(), "$.ledgerEntry.amount", "400.25");
        assertCustomerShape(JsonPath.read(response.getBody(), "$.customer"));
        assertDecimal(response.getBody(), "$.customer.accountBalance", "599.75");
        assertThat(requireCustomerById(id).getAccountBalance()).isEqualByComparingTo("599.75");
        assertThat(ledgerEntryRepository.count()).isEqualTo(1);
        final UUID paymentId = UUID.fromString(JsonPath.read(response.getBody(), "$.ledgerEntry.paymentId"));
        assertThat(paymentRepository.count()).isEqualTo(1);
        final var payment = paymentRepository.findById(paymentId).orElseThrow();
        assertThat(payment.getAmount()).isEqualByComparingTo("400.25");
        assertThat(payment.getMethod().name()).isEqualTo("BANK");
        assertThat(payment.getDirection()).isEqualTo(PaymentDirection.INCOMING);
        assertThat(payment.getCustomer().getId()).isEqualTo(id);
        assertThat(payment.getStore().getId()).isEqualTo(owner.storeId());
        assertThat(payment.getUser()).isNotNull();
        assertThat(payment.getSale()).isNull();
        assertThat(ledgerEntryRepository.findById(paymentId).orElseThrow().getPayment().getId()).isEqualTo(paymentId);
    }

    @Test
    void shouldAllowOverpaymentLeavingNegativeBalance() {
        final StoreOwner owner = createStore();
        final UUID id = createCustomer(owner.token());
        setBalance(id, "100.00");

        final ResponseEntity<String> response = postJson(paymentsUrl(id), paymentJson("250.00", "CASH"),
                owner.token());

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        assertDecimal(response.getBody(), "$.customer.accountBalance", "-150.00");
    }

    @Test
    void shouldAccumulateMultiplePaymentsAndAcceptMinimalAmount() {
        final StoreOwner owner = createStore();
        final UUID id = createCustomer(owner.token());

        takePayment(owner.token(), id, "0.01");
        takePayment(owner.token(), id, "10");

        assertThat(requireCustomerById(id).getAccountBalance()).isEqualByComparingTo("-10.01");
        assertThat(ledgerEntryRepository.count()).isEqualTo(2);
    }

    @Test
    void shouldAcceptPaymentForDeactivatedCustomerAndByCashier() {
        final StoreOwner owner = createStore();
        final String cashier = signupCashierAttachedToStore(owner.storeId());
        final UUID id = createCustomer(owner.token());
        setBalance(id, "20.00");
        patchJson(customerUrl(id), "{\"status\": \"INACTIVE\"}", owner.token());

        final ResponseEntity<String> response = postJson(paymentsUrl(id), paymentJson("20.00", "CASH"), cashier);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        assertDecimal(response.getBody(), "$.customer.accountBalance", "0");
    }

    @Test
    void shouldStoreBlankOptionalFieldsAsNull() {
        final StoreOwner owner = createStore();
        final UUID id = createCustomer(owner.token());

        final ResponseEntity<String> response = postJson(paymentsUrl(id),
                "{\"amount\": 5, \"method\": \"CASH\", \"referenceNumber\": \" \", \"description\": \"\"}",
                owner.token());

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        assertThat((Object) JsonPath.read(response.getBody(), "$.ledgerEntry.referenceNumber")).isNull();
        assertThat((Object) JsonPath.read(response.getBody(), "$.ledgerEntry.description")).isNull();
    }

    @ParameterizedTest
    @ValueSource(strings = {"{\"method\": \"CASH\"}", "{\"amount\": 10}", "{\"amount\": 0, \"method\": \"CASH\"}",
            "{\"amount\": -5, \"method\": \"CASH\"}", "{\"amount\": 0.001, \"method\": \"CASH\"}",
            "{\"amount\": 1.234, \"method\": \"CASH\"}", "{\"amount\": \"abc\", \"method\": \"CASH\"}",
            "{\"amount\": null, \"method\": \"CASH\"}", "{\"amount\": 10, \"method\": \"CREDIT\"}",
            "{\"amount\": 10, \"method\": \"cash\"}", "{\"amount\": 10, \"method\": \"CHEQUE\"}",
            "{\"amount\": 10, \"method\": null}", "{\"amount\": 10000000000000000.00, \"method\": \"CASH\"}",
            "{\"amount\": 10, \"method\": \"CASH\", \"bogus\": 1}",
            "{\"amount\": 10, \"method\": \"CASH\", \"customerId\": \"x\"}", "{}", "not json"})
    void shouldRejectInvalidPaymentRequests(final String body) {
        final StoreOwner owner = createStore();
        final UUID id = createCustomer(owner.token());

        assertErrorResponse(postJson(paymentsUrl(id), body, owner.token()), HttpStatus.BAD_REQUEST);
        assertThat(ledgerEntryRepository.count()).isZero();
        assertThat(paymentRepository.count()).isZero();
        assertThat(requireCustomerById(id).getAccountBalance()).isEqualByComparingTo("0");
    }

    @Test
    void shouldRejectOverlongReferenceAndDescription() {
        final StoreOwner owner = createStore();
        final UUID id = createCustomer(owner.token());

        assertErrorResponse(postJson(paymentsUrl(id), "{\"amount\": 1, \"method\": \"CASH\", \"referenceNumber\": \""
                + "r".repeat(256) + "\"}", owner.token()), HttpStatus.BAD_REQUEST);
        assertErrorResponse(postJson(paymentsUrl(id), "{\"amount\": 1, \"method\": \"CASH\", \"description\": \""
                + "d".repeat(1001) + "\"}", owner.token()), HttpStatus.BAD_REQUEST);
    }

    @Test
    void shouldRejectPaymentThatOverflowsBalanceRange() {
        final StoreOwner owner = createStore();
        final UUID id = createCustomer(owner.token());
        setBalance(id, "-9999999999999999.00");

        assertErrorResponse(postJson(paymentsUrl(id), paymentJson("5.00", "CASH"), owner.token()),
                HttpStatus.BAD_REQUEST);
        assertThat(ledgerEntryRepository.count()).isZero();
    }

    @Test
    void shouldReturn404ForUnknownForeignCustomerAndNoStore() {
        final StoreOwner owner = createStore();
        final UUID foreign = createCustomer(createStore().token());
        final String noStore = signupAndGetToken(TestDataFactory.personName(), TestDataFactory.uniqueEmail(),
                TestDataFactory.validPassword());

        assertErrorMessage(postJson(paymentsUrl(UUID.randomUUID()), paymentJson("1", "CASH"), owner.token()),
                HttpStatus.NOT_FOUND, "Customer not found");
        assertErrorMessage(postJson(paymentsUrl(foreign), paymentJson("1", "CASH"), owner.token()),
                HttpStatus.NOT_FOUND, "Customer not found");
        assertErrorMessage(postJson(paymentsUrl(foreign), paymentJson("1", "CASH"), noStore),
                HttpStatus.NOT_FOUND, "You don't have a store yet");
        assertThat(ledgerEntryRepository.count()).isZero();
    }

    @Test
    void shouldReturn401WithoutTokenAnd400ForMalformedId() {
        final StoreOwner owner = createStore();

        assertThat(postJson(paymentsUrl(UUID.randomUUID()), paymentJson("1", "CASH")).getStatusCode())
                .isEqualTo(HttpStatus.UNAUTHORIZED);
        assertErrorResponse(postJson(CUSTOMERS_URL + "/nope/payments", paymentJson("1", "CASH"), owner.token()),
                HttpStatus.BAD_REQUEST);
    }

    @Test
    void shouldNotLoseUpdatesUnderConcurrentPayments() throws Exception {
        final StoreOwner owner = createStore();
        final UUID id = createCustomer(owner.token());
        setBalance(id, "100.00");
        final int calls = 8;

        final ExecutorService pool = Executors.newFixedThreadPool(calls);
        try {
            final List<Future<ResponseEntity<String>>> futures = new java.util.ArrayList<>();
            for (int i = 0; i < calls; i++) {
                final Callable<ResponseEntity<String>> call = () -> postJson(paymentsUrl(id),
                        paymentJson("10.00", "CASH"), owner.token());
                futures.add(pool.submit(call));
            }
            for (final Future<ResponseEntity<String>> future : futures) {
                assertThat(future.get().getStatusCode()).isEqualTo(HttpStatus.CREATED);
            }
        } finally {
            pool.shutdownNow();
        }

        assertThat(requireCustomerById(id).getAccountBalance()).isEqualByComparingTo("20.00");
        assertThat(ledgerEntryRepository.count()).isEqualTo(calls);
    }

    // ---------- 6e: void payment ----------

    @Test
    void shouldVoidPaymentWithReversingEntryAndRestoreBalance() {
        final StoreOwner owner = createStore();
        final UUID id = createCustomer(owner.token());
        setBalance(id, "500.00");
        final ResponseEntity<String> paid = postJson(paymentsUrl(id), """
                {"amount": 200, "method": "BANK", "referenceNumber": "REF-9"}""", owner.token());
        final UUID entryId = UUID.fromString(JsonPath.read(paid.getBody(), "$.ledgerEntry.id"));

        final ResponseEntity<String> response = postJson(voidUrl(id, entryId), voidJson("  Cheque bounced "),
                owner.token());

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        final Map<String, Object> body = JsonPath.read(response.getBody(), "$");
        assertThat(body.keySet()).containsExactlyInAnyOrder("voidedEntry", "reversalEntry", "customer");
        final Map<String, Object> voided = JsonPath.read(response.getBody(), "$.voidedEntry");
        assertThat(voided).containsEntry("id", entryId.toString()).containsEntry("voided", true)
                .containsEntry("voidReason", "Cheque bounced").containsEntry("direction", "CREDIT")
                .containsEntry("type", "PAYMENT");
        assertThat((String) voided.get("voidedAt")).isNotBlank();
        assertThat((String) voided.get("voidedBy")).isEqualTo(requireUserByEmail(ownerEmail(owner)).getId().toString());
        assertDecimal(response.getBody(), "$.voidedEntry.amount", "200.00");

        final Map<String, Object> reversal = JsonPath.read(response.getBody(), "$.reversalEntry");
        assertThat(reversal).containsEntry("direction", "DEBIT").containsEntry("type", "ADJUSTMENT")
                .containsEntry("referenceNumber", "REF-9").containsEntry("voided", false)
                .containsEntry("description", "Reversal of PAYMENT voided: Cheque bounced")
                .containsEntry("saleId", null);
        assertThat(reversal.get("id")).isNotEqualTo(entryId.toString());
        assertDecimal(response.getBody(), "$.reversalEntry.amount", "200.00");
        assertDecimal(response.getBody(), "$.customer.accountBalance", "500.00");

        assertThat(ledgerEntryRepository.count()).isEqualTo(2);
        final LedgerEntry stored = ledgerEntryRepository.findById(entryId).orElseThrow();
        assertThat(stored.getType()).isEqualTo(LedgerEntryType.PAYMENT);
        assertThat(stored.getDirection()).isEqualTo(LedgerDirection.CREDIT);
        assertThat(stored.getAmount()).isEqualByComparingTo("200.00");
    }

    @Test
    void shouldRestoreNegativeBalanceFromOverpaymentOnVoid() {
        final StoreOwner owner = createStore();
        final UUID id = createCustomer(owner.token());
        final UUID entryId = takePayment(owner.token(), id, "80.00");

        final ResponseEntity<String> response = postJson(voidUrl(id, entryId), voidJson("mistake"), owner.token());

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertDecimal(response.getBody(), "$.customer.accountBalance", "0");
    }

    @Test
    void shouldRejectVoidingTwiceWithoutChangingBalance() {
        final StoreOwner owner = createStore();
        final UUID id = createCustomer(owner.token());
        final UUID entryId = takePayment(owner.token(), id, "80.00");
        postJson(voidUrl(id, entryId), voidJson("first"), owner.token());

        assertErrorMessage(postJson(voidUrl(id, entryId), voidJson("second"), owner.token()),
                HttpStatus.CONFLICT, "Payment is already voided");
        assertThat(requireCustomerById(id).getAccountBalance()).isEqualByComparingTo("0");
        assertThat(ledgerEntryRepository.count()).isEqualTo(2);
    }

    @Test
    void shouldNotVoidReversalEntryOrNonPaymentEntries() {
        final StoreOwner owner = createStore();
        final UUID id = createCustomer(owner.token());
        final UUID entryId = takePayment(owner.token(), id, "30.00");
        final ResponseEntity<String> voided = postJson(voidUrl(id, entryId), voidJson("r"), owner.token());
        final UUID reversalId = UUID.fromString(JsonPath.read(voided.getBody(), "$.reversalEntry.id"));

        assertErrorMessage(postJson(voidUrl(id, reversalId), voidJson("again"), owner.token()),
                HttpStatus.BAD_REQUEST, "Only PAYMENT ledger entries can be voided");
        assertThat(requireCustomerById(id).getAccountBalance()).isEqualByComparingTo("0");
    }

    @ParameterizedTest
    @ValueSource(strings = {"{}", "{\"voidReason\": null}", "{\"voidReason\": \"\"}", "{\"voidReason\": \"  \"}",
"{\"voidReason\": \"ok\", \"extra\": 1}", "not json"})
    void shouldRequireNonBlankVoidReason(final String body) {
        final StoreOwner owner = createStore();
        final UUID id = createCustomer(owner.token());
        final UUID entryId = takePayment(owner.token(), id, "30.00");

        assertErrorResponse(postJson(voidUrl(id, entryId), body, owner.token()), HttpStatus.BAD_REQUEST);
        assertThat(ledgerEntryRepository.findById(entryId).orElseThrow().isVoided()).isFalse();
        assertThat(requireCustomerById(id).getAccountBalance()).isEqualByComparingTo("-30.00");
    }

    @Test
    void shouldRejectOverlongVoidReason() {
        final StoreOwner owner = createStore();
        final UUID id = createCustomer(owner.token());
        final UUID entryId = takePayment(owner.token(), id, "30.00");

        assertErrorResponse(postJson(voidUrl(id, entryId), voidJson("x".repeat(1001)), owner.token()),
                HttpStatus.BAD_REQUEST);
    }

    @Test
    void shouldForbidCashierFromVoidingPayments() {
        final StoreOwner owner = createStore();
        final String cashier = signupCashierAttachedToStore(owner.storeId());
        final UUID id = createCustomer(owner.token());
        final UUID entryId = takePayment(cashier, id, "30.00");

        assertErrorResponse(postJson(voidUrl(id, entryId), voidJson("nope"), cashier), HttpStatus.FORBIDDEN);
        assertThat(ledgerEntryRepository.findById(entryId).orElseThrow().isVoided()).isFalse();
        assertThat(requireCustomerById(id).getAccountBalance()).isEqualByComparingTo("-30.00");
    }

    @Test
    void shouldReturn404ForUnknownEntryEntryOfAnotherCustomerAndForeignStore() {
        final StoreOwner owner = createStore();
        final StoreOwner other = createStore();
        final UUID id = createCustomer(owner.token());
        final UUID otherCustomerInStore = createCustomer(owner.token());
        final UUID foreignCustomer = createCustomer(other.token());
        final UUID entryId = takePayment(owner.token(), id, "30.00");
        final UUID foreignEntry = takePayment(other.token(), foreignCustomer, "30.00");

        assertErrorMessage(postJson(voidUrl(id, UUID.randomUUID()), voidJson("x"), owner.token()),
                HttpStatus.NOT_FOUND, "Payment not found");
        assertErrorMessage(postJson(voidUrl(otherCustomerInStore, entryId), voidJson("x"), owner.token()),
                HttpStatus.NOT_FOUND, "Payment not found");
        assertErrorMessage(postJson(voidUrl(UUID.randomUUID(), entryId), voidJson("x"), owner.token()),
                HttpStatus.NOT_FOUND, "Customer not found");
        assertErrorMessage(postJson(voidUrl(foreignCustomer, foreignEntry), voidJson("x"), owner.token()),
                HttpStatus.NOT_FOUND, "Customer not found");
        assertThat(ledgerEntryRepository.findById(foreignEntry).orElseThrow().isVoided()).isFalse();
    }

    @Test
    void shouldReturn401WithoutTokenAnd400ForMalformedIds() {
        final StoreOwner owner = createStore();

        assertThat(postJson(voidUrl(UUID.randomUUID(), UUID.randomUUID()), voidJson("x")).getStatusCode())
                .isEqualTo(HttpStatus.UNAUTHORIZED);
        assertErrorResponse(postJson(paymentsUrl(UUID.randomUUID()) + "/bad/void", voidJson("x"), owner.token()),
                HttpStatus.BAD_REQUEST);
    }

    @Test
    void shouldAllowVoidForDeactivatedCustomerAndKeepStatus() {
        final StoreOwner owner = createStore();
        final UUID id = createCustomer(owner.token());
        final UUID entryId = takePayment(owner.token(), id, "30.00");
        patchJson(customerUrl(id), "{\"status\": \"INACTIVE\"}", owner.token());

        final ResponseEntity<String> response = postJson(voidUrl(id, entryId), voidJson("r"), owner.token());

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(requireCustomerById(id).getStatus()).isEqualTo(RowStatus.INACTIVE);
    }

    @Test
    void shouldVoidOnlyOnceUnderConcurrentRequests() throws Exception {
        final StoreOwner owner = createStore();
        final UUID id = createCustomer(owner.token());
        final UUID entryId = takePayment(owner.token(), id, "50.00");
        final int calls = 5;

        final ExecutorService pool = Executors.newFixedThreadPool(calls);
        int ok = 0;
        try {
            final List<Future<ResponseEntity<String>>> futures = new java.util.ArrayList<>();
            for (int i = 0; i < calls; i++) {
                futures.add(pool.submit(() -> postJson(voidUrl(id, entryId), voidJson("race"), owner.token())));
            }
            for (final Future<ResponseEntity<String>> future : futures) {
                final HttpStatus status = HttpStatus.valueOf(future.get().getStatusCode().value());
                assertThat(status).isIn(HttpStatus.OK, HttpStatus.CONFLICT);
                if (status == HttpStatus.OK) {
                    ok++;
                }
            }
        } finally {
            pool.shutdownNow();
        }

        assertThat(ok).isEqualTo(1);
        assertThat(requireCustomerById(id).getAccountBalance()).isEqualByComparingTo("0");
        assertThat(ledgerEntryRepository.count()).isEqualTo(2);
    }

    private String ownerEmail(final StoreOwner owner) {
        return userRepository.findAll().stream().filter(u -> u.getStore() != null
                && u.getStore().getId().equals(owner.storeId()) && u.getRole() == UserRole.OWNER)
                .findFirst().orElseThrow().getEmail();
    }

}
