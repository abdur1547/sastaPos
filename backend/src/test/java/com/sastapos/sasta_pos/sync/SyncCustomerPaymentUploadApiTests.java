package com.sastapos.sasta_pos.sync;

import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.JsonPath;
import com.sastapos.sasta_pos.customer.support.CustomerApiTestBase;
import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;


class SyncCustomerPaymentUploadApiTests extends CustomerApiTestBase {

    @Autowired
    private JdbcTemplate jdbc;

    private record Fixture(StoreOwner owner, UUID customer, UUID user, UUID payment) {
    }

    private Fixture fixture() {
        final StoreOwner owner = createStore();
        return new Fixture(owner, createCustomer(owner.token()),
                jdbc.queryForObject("SELECT id FROM users WHERE store_id = ?", UUID.class, owner.storeId()),
                UUID.randomUUID());
    }

    private static String operation(final String table, final String op, final UUID id, final String data) {
        return "{\"table\":\"%s\",\"op\":\"%s\",\"id\":\"%s\"%s}".formatted(
                table, op, id, data == null ? "" : ",\"data\":" + data);
    }

    private static String paymentData(final Fixture f, final String amount, final String method) {
        return """
                {"direction":"INCOMING","amount":"%s","method":"%s","customer_id":"%s",
                "store_id":"%s","user_id":"%s","reference_number":" TRX-1 ","description":" Settlement ",
                "sale_id":null,"date_created":"2026-10-22T10:00:00Z","last_updated":"2026-10-22T10:00:00Z"}
                """.formatted(amount, method, f.customer(), f.owner().storeId(), f.user());
    }

    private static String ledgerData(final Fixture f, final String amount) {
        return """
                {"direction":"CREDIT","type":"PAYMENT","amount":"%s","customer_id":"%s",
                "payment_id":"%s","sale_id":null,"voided":0,"reference_number":"TRX-1",
                "store_id":"%s","user_id":"%s"}
                """.formatted(amount, f.customer(), f.payment(), f.owner().storeId(), f.user());
    }

    private ResponseEntity<String> upload(final String token, final String... operations) {
        return postJson("/api/sync/upload", "{\"operations\":[" + String.join(",", operations) + "]}", token);
    }

    private static void assertAccepted(final ResponseEntity<String> response, final int count) {
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat((List<?>) JsonPath.read(response.getBody(), "$.rejected")).isEmpty();
        assertThat((int) JsonPath.read(response.getBody(), "$.applied")).isEqualTo(count);
    }

    @Test
    void shouldUploadOfflinePaymentGraphInDependencyOrderAndRetryWithoutDoublePosting() {
        final Fixture f = fixture();
        setBalance(f.customer(), "1000.00");
        final String[] graph = {
            operation("ledger_entries", "PUT", f.payment(), ledgerData(f, "400.25")),
            operation("customers", "PATCH", f.customer(), "{\"account_balance\":\"599.75\"}"),
            operation("payments", "PUT", f.payment(), paymentData(f, "400.25", "BANK"))
        };
        assertAccepted(upload(f.owner().token(), graph), 2);
        assertAccepted(upload(f.owner().token(), graph), 2);
        assertThat(requireCustomerById(f.customer()).getAccountBalance()).isEqualByComparingTo("599.75");
        assertThat(paymentRepository.count()).isEqualTo(1);
        assertThat(ledgerEntryRepository.count()).isEqualTo(1);
        final var payment = paymentRepository.findById(f.payment()).orElseThrow();
        assertThat(payment.getReferenceNumber()).isEqualTo("TRX-1");
        assertThat(payment.getDescription()).isEqualTo("Settlement");
        assertThat(payment.getSale()).isNull();
        final var entry = ledgerEntryRepository.findById(f.payment()).orElseThrow();
        assertThat(entry.getPayment().getId()).isEqualTo(f.payment());
        assertThat(entry.getCustomer().getId()).isEqualTo(f.customer());
        assertThat(entry.getStore().getId()).isEqualTo(f.owner().storeId());
        assertThat(entry.getUser().getId()).isEqualTo(f.user());
        assertThat(entry.getAmount()).isEqualByComparingTo("400.25");
    }

    @Test
    void shouldAtomicallyPostEvenWhenLedgerCopyArrivesInALaterBatch() {
        final Fixture f = fixture();
        assertAccepted(upload(f.owner().token(),
                operation("payments", "PUT", f.payment(), paymentData(f, "150.25", "CASH"))), 1);
        assertThat(ledgerEntryRepository.count()).isEqualTo(1);
        assertThat(requireCustomerById(f.customer()).getAccountBalance()).isEqualByComparingTo("-150.25");
        assertAccepted(upload(f.owner().token(),
                operation("ledger_entries", "PUT", f.payment(), ledgerData(f, "150.25"))), 1);
        assertThat(requireCustomerById(f.customer()).getAccountBalance()).isEqualByComparingTo("-150.25");
    }

    @ParameterizedTest
    @ValueSource(strings = {"0", "-1", "0.001", "10000000000000000.00"})
    void shouldRejectInvalidAmountWithoutAnyFinancialWrites(final String amount) {
        final Fixture f = fixture();
        final var response = upload(f.owner().token(),
                operation("payments", "PUT", f.payment(), paymentData(f, amount, "CASH")));
        assertThat((List<?>) JsonPath.read(response.getBody(), "$.rejected")).hasSize(1);
        assertThat(paymentRepository.count()).isZero();
        assertThat(ledgerEntryRepository.count()).isZero();
        assertThat(requireCustomerById(f.customer()).getAccountBalance()).isEqualByComparingTo("0");
    }

    @Test
    void shouldRejectCreditMethodAndMissingCustomerContext() {
        final Fixture f = fixture();
        for (final String data : List.of(paymentData(f, "1", "CREDIT"),
                "{\"amount\":\"1\",\"method\":\"CASH\"}")) {
            final var response = upload(f.owner().token(), operation("payments", "PUT", f.payment(), data));
            assertThat((List<?>) JsonPath.read(response.getBody(), "$.rejected")).hasSize(1);
        }
        assertThat(paymentRepository.count()).isZero();
        assertThat(ledgerEntryRepository.count()).isZero();
    }

    @Test
    void shouldRejectForeignCustomerUserAndPaymentIds() {
        final Fixture local = fixture();
        final Fixture foreign = fixture();
        for (final String data : List.of(
                paymentData(local, "1", "CASH").replace(local.customer().toString(), foreign.customer().toString()),
                paymentData(local, "1", "CASH").replace(local.user().toString(), foreign.user().toString()))) {
            final var response = upload(local.owner().token(), operation("payments", "PUT", local.payment(), data));
            assertThat((List<?>) JsonPath.read(response.getBody(), "$.rejected")).hasSize(1);
        }
        assertAccepted(upload(foreign.owner().token(),
                operation("payments", "PUT", foreign.payment(), paymentData(foreign, "1", "CASH"))), 1);
        final var collision = upload(local.owner().token(),
                operation("payments", "PUT", foreign.payment(), paymentData(local, "2", "CASH")));
        assertThat((List<?>) JsonPath.read(collision.getBody(), "$.rejected")).hasSize(1);
        assertThat(requireCustomerById(local.customer()).getAccountBalance()).isEqualByComparingTo("0");
        assertThat(requireCustomerById(foreign.customer()).getAccountBalance()).isEqualByComparingTo("-1");
    }

    @Test
    void shouldRollBackPaymentAndPostingOnBalanceOverflow() {
        final Fixture f = fixture();
        setBalance(f.customer(), "-9999999999999999.99");
        final var response = upload(f.owner().token(),
                operation("payments", "PUT", f.payment(), paymentData(f, "0.01", "CASH")));
        assertThat((List<?>) JsonPath.read(response.getBody(), "$.rejected")).hasSize(1);
        assertThat(paymentRepository.count()).isZero();
        assertThat(ledgerEntryRepository.count()).isZero();
        assertThat(requireCustomerById(f.customer()).getAccountBalance()).isEqualByComparingTo("-9999999999999999.99");
    }

    @Test
    void shouldNotAcknowledgeAnUnbackedOrMismatchedLedgerPosting() {
        final Fixture f = fixture();
        final var missing = upload(f.owner().token(),
                operation("ledger_entries", "PUT", f.payment(), ledgerData(f, "1")));
        assertThat((List<?>) JsonPath.read(missing.getBody(), "$.rejected")).hasSize(1);
        assertAccepted(upload(f.owner().token(),
                operation("payments", "PUT", f.payment(), paymentData(f, "1", "CASH"))), 1);
        final var mismatched = upload(f.owner().token(),
                operation("ledger_entries", "PUT", f.payment(), ledgerData(f, "2")));
        assertThat((List<?>) JsonPath.read(mismatched.getBody(), "$.rejected")).hasSize(1);
        assertThat(ledgerEntryRepository.count()).isEqualTo(1);
        assertThat(requireCustomerById(f.customer()).getAccountBalance()).isEqualByComparingTo("-1");
    }

    @Test
    void shouldKeepPaymentAmountsImmutableAndRejectDeletion() {
        final Fixture f = fixture();
        assertAccepted(upload(f.owner().token(),
                operation("payments", "PUT", f.payment(), paymentData(f, "25", "CASH"))), 1);
        assertAccepted(upload(f.owner().token(),
                operation("payments", "PUT", f.payment(), paymentData(f, "50", "BANK"))), 1);
        assertThat(paymentRepository.findById(f.payment()).orElseThrow().getAmount()).isEqualByComparingTo("25");
        assertThat(requireCustomerById(f.customer()).getAccountBalance()).isEqualByComparingTo("-25");
        final var response = upload(f.owner().token(), operation("payments", "DELETE", f.payment(), null));
        assertThat((List<?>) JsonPath.read(response.getBody(), "$.rejected")).hasSize(1);
        assertThat(paymentRepository.count()).isEqualTo(1);
    }

    @Test
    void shouldNotUnvoidAPostingWhenItsOriginalOfflineBatchIsRetried() {
        final Fixture f = fixture();
        final String payment = operation("payments", "PUT", f.payment(), paymentData(f, "25", "CASH"));
        final String ledger = operation("ledger_entries", "PUT", f.payment(), ledgerData(f, "25"));
        assertAccepted(upload(f.owner().token(), payment, ledger), 2);
        assertThat(postJson(voidUrl(f.customer(), f.payment()), voidJson("Mistake"), f.owner().token()).getStatusCode())
                .isEqualTo(HttpStatus.OK);
        assertAccepted(upload(f.owner().token(), payment, ledger), 2);
        assertThat(ledgerEntryRepository.findById(f.payment()).orElseThrow().isVoided()).isTrue();
        assertThat(ledgerEntryRepository.findById(f.payment()).orElseThrow().getVoidReason()).isEqualTo("Mistake");
        assertThat(requireCustomerById(f.customer()).getAccountBalance()).isEqualByComparingTo(BigDecimal.ZERO);
    }

    @Test
    void shouldApplyConcurrentRetriesOnlyOnce() throws Exception {
        final Fixture f = fixture();
        final String payment = operation("payments", "PUT", f.payment(), paymentData(f, "25", "CASH"));
        final Callable<ResponseEntity<String>> submit = () -> upload(f.owner().token(), payment);
        try (final var executor = Executors.newFixedThreadPool(2)) {
            for (final var result : executor.invokeAll(List.of(submit, submit))) {
                assertAccepted(result.get(), 1);
            }
        }
        assertThat(requireCustomerById(f.customer()).getAccountBalance()).isEqualByComparingTo("-25");
        assertThat(paymentRepository.count()).isEqualTo(1);
        assertThat(ledgerEntryRepository.count()).isEqualTo(1);
    }

    @Test
    void shouldAllowSettlementForAnInactiveCustomer() {
        final Fixture f = fixture();
        patchJson(customerUrl(f.customer()), "{\"status\":\"INACTIVE\"}", f.owner().token());
        assertAccepted(upload(f.owner().token(),
                operation("payments", "PUT", f.payment(), paymentData(f, "1", "CASH"))), 1);
        assertThat(requireCustomerById(f.customer()).getAccountBalance()).isEqualByComparingTo("-1");
    }

    @Test
    void shouldRollBackAPaymentWhoseIdCollidesWithAnUnrelatedLedgerEntry() {
        final Fixture f = fixture();
        jdbc.update("""
                INSERT INTO ledger_entries
                    (id, direction, amount, type, voided, customer_id, date_created, last_updated)
                VALUES (?, 'DEBIT', 1, 'ADJUSTMENT', false, ?, now(), now())
                """, f.payment(), f.customer());
        setBalance(f.customer(), "1.00");
        final var response = upload(f.owner().token(),
                operation("payments", "PUT", f.payment(), paymentData(f, "1", "CASH")));
        assertThat((List<?>) JsonPath.read(response.getBody(), "$.rejected")).hasSize(1);
        assertThat(paymentRepository.count()).isZero();
        assertThat(ledgerEntryRepository.count()).isEqualTo(1);
        assertThat(requireCustomerById(f.customer()).getAccountBalance()).isEqualByComparingTo("1");
    }

    @Test
    void shouldIsolateAnOverflowingPaymentWithoutLosingValidPaymentsInTheSameBatch() {
        final Fixture f = fixture();
        final UUID otherCustomer = createCustomer(f.owner().token());
        setBalance(f.customer(), "-9999999999999999.99");
        final UUID validPayment = UUID.randomUUID();
        final var response = upload(f.owner().token(),
                operation("payments", "PUT", f.payment(), paymentData(f, "1", "CASH")),
                operation("payments", "PUT", validPayment, paymentData(f, "2", "CASH")
                        .replace(f.customer().toString(), otherCustomer.toString())));
        assertThat((List<?>) JsonPath.read(response.getBody(), "$.rejected")).hasSize(1);
        assertThat((int) JsonPath.read(response.getBody(), "$.applied")).isEqualTo(1);
        assertThat(paymentRepository.count()).isEqualTo(1);
        assertThat(ledgerEntryRepository.count()).isEqualTo(1);
        assertThat(requireCustomerById(otherCustomer).getAccountBalance()).isEqualByComparingTo("-2");
        assertThat(requireCustomerById(f.customer()).getAccountBalance()).isEqualByComparingTo("-9999999999999999.99");
    }
}
