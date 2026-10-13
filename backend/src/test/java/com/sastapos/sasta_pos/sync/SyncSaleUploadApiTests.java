package com.sastapos.sasta_pos.sync;

import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.JsonPath;
import com.sastapos.sasta_pos.product.support.ProductApiTestBase;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;


@TestPropertySource(properties = "spring.datasource.hikari.connection-init-sql=SET TIME ZONE 'Asia/Karachi'")
class SyncSaleUploadApiTests extends ProductApiTestBase {

    @Autowired
    private JdbcTemplate jdbc;

    private record SaleFixture(StoreOwner owner, UUID settings, UUID user, UUID customer, UUID product,
            UUID sale, UUID item, UUID payment, UUID debit, UUID credit, UUID movement) {
    }

    private static String op(final String table, final String operation, final UUID id, final String data) {
        return "{\"table\":\"%s\",\"op\":\"%s\",\"id\":\"%s\"%s}".formatted(table, operation, id,
                data == null ? "" : ",\"data\":" + data);
    }

    private ResponseEntity<String> upload(final String token, final List<String> operations) {
        return postJson("/api/sync/upload", "{\"operations\":[" + String.join(",", operations) + "]}", token);
    }

    private SaleFixture fixture() {
        final StoreOwner owner = createStore();
        final UUID user = jdbc.queryForObject("SELECT id FROM users WHERE store_id = ?", UUID.class, owner.storeId());
        final UUID settings = requireStoreById(owner.storeId()).getStoreSettings().getId();
        final UUID product = UUID.randomUUID();
        final UUID customer = UUID.randomUUID();
        final UUID unit = seedUnit(true).getId();
        assertAccepted(upload(owner.token(), List.of(
                op("customers", "PUT", customer, "{\"name\":\"Buyer\"}"),
                op("products", "PUT", product, """
                        {"name":"Widget","pct_code":"%s","unit_price":"100.00","stock_quantity":"3.00",
                        "units_of_measure_id":"%s"}""".formatted(uniquePct(), unit)))), 2);
        return new SaleFixture(owner, settings, user, customer, product, UUID.randomUUID(), UUID.randomUUID(),
                UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID());
    }

    private static String saleData(final SaleFixture f, final String status) {
        return """
                {"invoice_number":"INV-100","sale_type":"CREDIT","subtotal":"100.00","discount_amount":"0.00",
                "taxable_amount":"100.00","tax_amount":"0.00","total_amount":"100.00","currency_code":"PKR",
                "sold_at":"2026-10-10T10:00:00Z","status":"%s","total_paid":"40.00","remaining":"60.00",
                "customer_id":"%s","user_id":"%s","store_id":"%s"}"""
                .formatted(status, f.customer(), f.user(), f.owner().storeId());
    }

    private static String itemData(final SaleFixture f) {
        return """
                {"product_name":"Widget","sku":null,"quantity":"1.00","unit_price":"100.00","tax_rate":"0.0000",
                "taxable_amount":"100.00","line_total":"100.00","sale_id":"%s","product_id":"%s"}"""
                .formatted(f.sale(), f.product());
    }

    private static String paymentData(final SaleFixture f) {
        return """
                {"amount":"40.00","method":"CASH","reference_number":null,"description":null,"sale_id":"%s"}"""
                .formatted(f.sale());
    }

    private static String ledgerData(final SaleFixture f, final boolean debit) {
        return """
                {"direction":"%s","amount":"%s","type":"%s","reference_number":"INV-100","description":null,
                "voided":0,"customer_id":"%s","sale_id":%s}"""
                .formatted(debit ? "DEBIT" : "CREDIT", debit ? "100.00" : "40.00", debit ? "SALE" : "PAYMENT",
                        f.customer(), "\"" + f.sale() + "\"");
    }

    private static String movementData(final SaleFixture f) {
        return """
                {"type":"SALE","quantity":"1.00","quantity_before":"3.00","quantity_after":"2.00",
                "description":"Sale INV-100","product_id":"%s","sale_id":"%s","sale_item_id":"%s"}"""
                .formatted(f.product(), f.sale(), f.item());
    }

    private static List<String> graph(final SaleFixture f) {
        // Deliberately reverse parent dependencies, as an offline queue may interleave transactions.
        return List.of(
                op("stock_movements", "PUT", f.movement(), movementData(f)),
                op("ledger_entries", "PUT", f.credit(), ledgerData(f, false)),
                op("ledger_entries", "PUT", f.debit(), ledgerData(f, true)),
                op("payments", "PUT", f.payment(), paymentData(f)),
                op("sale_items", "PUT", f.item(), itemData(f)),
                op("sales", "PUT", f.sale(), saleData(f, "COMPLETED")),
                op("business_settings", "PATCH", f.settings(),
                        "{\"next_invoice_number\":101,\"last_updated\":\"2026-10-10T10:00:00Z\"}"),
                op("products", "PATCH", f.product(), "{\"stock_quantity\":\"2.00\"}"),
                op("customers", "PATCH", f.customer(), "{\"account_balance\":\"999.00\"}"));
    }

    private static void assertAccepted(final ResponseEntity<String> response, final int count) {
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat((List<?>) JsonPath.read(response.getBody(), "$.rejected")).isEmpty();
        assertThat((int) JsonPath.read(response.getBody(), "$.applied")).isEqualTo(count);
    }

    @Test
    void shouldUploadTheWholeOfflineSaleAndRetryWithoutDuplicatingSideEffects() {
        final SaleFixture f = fixture();
        final List<String> operations = graph(f);
        // The account balance patch is intentionally server-owned and therefore a no-op.
        assertAccepted(upload(f.owner().token(), operations), 8);
        assertAccepted(upload(f.owner().token(), operations), 8);

        assertThat(saleRepository.findById(f.sale()).orElseThrow().getRemaining()).isEqualByComparingTo("60.00");
        assertThat(saleItemRepository.count()).isEqualTo(1);
        assertThat(paymentRepository.count()).isEqualTo(1);
        assertThat(ledgerEntryRepository.count()).isEqualTo(2);
        assertThat(jdbc.queryForObject("SELECT sale_id FROM ledger_entries WHERE id = ?", UUID.class, f.debit()))
                .isEqualTo(f.sale());
        assertThat(jdbc.queryForObject("SELECT sale_id FROM ledger_entries WHERE id = ?", UUID.class, f.credit()))
                .isEqualTo(f.sale());
        assertThat(stockMovementRepository.count()).isEqualTo(1);
        assertThat(customerRepository.findById(f.customer()).orElseThrow().getAccountBalance())
                .isEqualByComparingTo("60.00");
        assertThat(productRepository.findById(f.product()).orElseThrow().getStockQuantity())
                .isEqualByComparingTo("2.00");
        assertThat(jdbc.queryForObject("SELECT sale_id FROM stock_movements WHERE id = ?", UUID.class, f.movement()))
                .isEqualTo(f.sale());
        assertThat(jdbc.queryForObject("SELECT sale_item_id FROM stock_movements WHERE id = ?", UUID.class, f.movement()))
                .isEqualTo(f.item());
        assertThat(jdbc.queryForObject("SELECT next_invoice_number FROM business_settings WHERE id = ?",
                Integer.class, f.settings())).isEqualTo(101);
    }

    private static void assertRejected(final ResponseEntity<String> response, final UUID id) {
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat((List<String>) JsonPath.read(response.getBody(), "$.rejected[*].id")).contains(id.toString());
    }

    @Test
    void shouldKeepLateEveningSaleInUtcWithANonUtcDatabaseSession() {
        final SaleFixture f = fixture();
        final String data = saleData(f, "COMPLETED")
                .replace("2026-10-10T10:00:00Z", "2026-10-13T23:30:00+05:00");
        assertAccepted(upload(f.owner().token(), List.of(op("sales", "PUT", f.sale(), data))), 1);
        assertThat(saleRepository.findById(f.sale()).orElseThrow().getSoldAt())
                .isEqualTo(LocalDateTime.parse("2026-10-13T18:30:00"));
    }

    @Test
    void shouldKeepPostedSalesImmutableExceptForTheirOneWayVoid() {
        final SaleFixture f = fixture();
        assertAccepted(upload(f.owner().token(), graph(f)), 8);
        final String token = f.owner().token();

        assertRejected(upload(token, List.of(op("sales", "PATCH", f.sale(),
                "{\"total_amount\":\"1.00\",\"subtotal\":\"1.00\",\"taxable_amount\":\"1.00\"}"))), f.sale());
        assertRejected(upload(token, List.of(op("sales", "PATCH", f.sale(), "{\"status\":\"IN_PROGRESS\"}"))),
                f.sale());
        assertRejected(upload(token, List.of(op("sales", "PATCH", f.sale(), "{\"void_reason\":\"sneaky\"}"))),
                f.sale());
        assertAccepted(upload(token, List.of(op("sales", "PATCH", f.sale(), "{\"description\":\"gift wrap\"}"))), 1);
        assertThat(saleRepository.findById(f.sale()).orElseThrow().getTotalAmount()).isEqualByComparingTo("100.00");

        assertAccepted(upload(token, List.of(op("sales", "PATCH", f.sale(), """
                {"status":"VOIDED","void_reason":"Wrong item","voided_at":"2026-10-10T11:00:00Z",
                "voided_by":"%s"}""".formatted(f.user())))), 1);
        assertThat(saleRepository.findById(f.sale()).orElseThrow().getStatus()).isEqualTo(
                com.sastapos.sasta_pos.sale.SaleStatus.VOIDED);

        assertRejected(upload(token, List.of(op("sales", "PATCH", f.sale(), "{\"status\":\"COMPLETED\"}"))),
                f.sale());
        assertRejected(upload(token, List.of(op("sales", "PATCH", f.sale(), "{\"void_reason\":\"changed\"}"))),
                f.sale());
        // Retrying the identical void (offline queue replay) is not a change.
        assertAccepted(upload(token, List.of(op("sales", "PATCH", f.sale(), """
                {"status":"VOIDED","void_reason":"Wrong item","voided_at":"2026-10-10T11:00:00Z",
                "voided_by":"%s"}""".formatted(f.user())))), 1);
    }

    @Test
    void shouldAcceptDebitSalesWithoutACustomerOrVoidReferences() {
        final SaleFixture f = fixture();
        final String debitSale = saleData(f, "COMPLETED").replace("\"sale_type\":\"CREDIT\"", "\"sale_type\":\"DEBIT\"")
                .replace("\"customer_id\":\"" + f.customer() + "\"", "\"customer_id\":null")
                .replace("\"total_paid\":\"40.00\"", "\"total_paid\":\"100.00\"")
                .replace("\"remaining\":\"60.00\"", "\"remaining\":\"0.00\"");
        assertAccepted(upload(f.owner().token(), List.of(op("sales", "PUT", f.sale(), debitSale))), 1);
        assertThat(saleRepository.findById(f.sale()).orElseThrow().getCustomer()).isNull();
    }

    @Test
    void shouldAcceptLinkedReversalsAndStandalonePayments() {
        final SaleFixture f = fixture();
        assertAccepted(upload(f.owner().token(), graph(f)), 8);
        final UUID saleReversal = UUID.randomUUID();
        final UUID paymentReversal = UUID.randomUUID();
        final UUID standalonePayment = UUID.randomUUID();
        assertAccepted(upload(f.owner().token(), List.of(
                op("ledger_entries", "PUT", saleReversal, """
                        {"direction":"CREDIT","amount":"100.00","type":"ADJUSTMENT",
                        "customer_id":"%s","sale_id":"%s"}""".formatted(f.customer(), f.sale())),
                op("ledger_entries", "PUT", paymentReversal, """
                        {"direction":"DEBIT","amount":"40.00","type":"ADJUSTMENT",
                        "customer_id":"%s","sale_id":"%s"}""".formatted(f.customer(), f.sale())),
                op("ledger_entries", "PUT", standalonePayment, """
                        {"direction":"CREDIT","amount":"5.00","type":"PAYMENT",
                        "customer_id":"%s","sale_id":null}""".formatted(f.customer())))), 3);
        for (final UUID id : List.of(saleReversal, paymentReversal)) {
            assertThat(jdbc.queryForObject("SELECT sale_id FROM ledger_entries WHERE id = ?", UUID.class, id))
                    .isEqualTo(f.sale());
        }
        assertThat(jdbc.queryForObject("SELECT sale_id FROM ledger_entries WHERE id = ?",
                UUID.class, standalonePayment)).isNull();
        assertThat(customerRepository.findById(f.customer()).orElseThrow().getAccountBalance())
                .isEqualByComparingTo("-5.00");
    }

    @Test
    void shouldRejectUnlinkedSalesAndWrongCustomerOrStorePaymentLinks() {
        final SaleFixture f = fixture();
        final SaleFixture other = fixture();
        assertAccepted(upload(f.owner().token(), graph(f)), 8);
        assertAccepted(upload(other.owner().token(), graph(other)), 8);
        final UUID anotherCustomer = UUID.randomUUID();
        assertAccepted(upload(f.owner().token(), List.of(
                op("customers", "PUT", anotherCustomer, "{\"name\":\"Another buyer\"}"))), 1);

        final ResponseEntity<String> response = upload(f.owner().token(), List.of(
                op("ledger_entries", "PUT", UUID.randomUUID(),
                        ledgerData(f, true).replace("\"sale_id\":\"" + f.sale() + "\"", "\"sale_id\":null")),
                op("ledger_entries", "PUT", UUID.randomUUID(),
                        ledgerData(f, false).replace(f.customer().toString(), anotherCustomer.toString())),
                op("ledger_entries", "PUT", UUID.randomUUID(),
                        ledgerData(f, false).replace(f.sale().toString(), other.sale().toString()))));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat((int) JsonPath.read(response.getBody(), "$.applied")).isZero();
        assertThat((int) JsonPath.read(response.getBody(), "$.rejected.length()")).isEqualTo(3);
        assertThat((String) JsonPath.read(response.getBody(), "$.rejected[0].reason"))
                .isEqualTo("sale_id is required for a SALE ledger entry");
        assertThat(ledgerEntryRepository.count()).isEqualTo(4);
        assertThat(customerRepository.findById(f.customer()).orElseThrow().getAccountBalance())
                .isEqualByComparingTo("60.00");
    }

    @Test
    void shouldRejectInvalidSaleAmountsAndUnsupportedPaymentMethods() {
        final SaleFixture f = fixture();
        assertAccepted(upload(f.owner().token(), graph(f)), 8);
        final ResponseEntity<String> response = upload(f.owner().token(), List.of(
                op("sales", "PUT", UUID.randomUUID(), saleData(f, "COMPLETED")
                        .replace("\"total_amount\":\"100.00\"", "\"total_amount\":\"200.00\"")),
                op("payments", "PUT", UUID.randomUUID(), paymentData(f).replace("\"CASH\"", "\"CREDIT\"")),
                op("sale_items", "PUT", UUID.randomUUID(), itemData(f).replace("\"quantity\":\"1.00\"",
                        "\"quantity\":\"0.00\""))));
        assertThat((int) JsonPath.read(response.getBody(), "$.applied")).isZero();
        assertThat((int) JsonPath.read(response.getBody(), "$.rejected.length()")).isEqualTo(3);
        assertThat(saleRepository.count()).isEqualTo(1);
        assertThat(paymentRepository.count()).isEqualTo(1);
        assertThat(saleItemRepository.count()).isEqualTo(1);
    }

    @Test
    void shouldKeepInvoiceCountersMonotonicAndConfigurationServerOwned() {
        final SaleFixture f = fixture();
        final String prefix = jdbc.queryForObject("SELECT invoice_prefix FROM business_settings WHERE id = ?",
                String.class, f.settings());
        assertAccepted(upload(f.owner().token(), List.of(op("business_settings", "PATCH", f.settings(),
                "{\"next_invoice_number\":\"200\",\"invoice_prefix\":\"Hijacked\",\"invoice_number_start\":999}"))), 1);
        assertAccepted(upload(f.owner().token(), List.of(op("business_settings", "PUT", f.settings(),
                "{\"next_invoice_number\":100}"))), 1);
        assertThat(jdbc.queryForObject("SELECT next_invoice_number FROM business_settings WHERE id = ?",
                Integer.class, f.settings())).isEqualTo(200);
        assertThat(jdbc.queryForObject("SELECT invoice_prefix FROM business_settings WHERE id = ?",
                String.class, f.settings())).isEqualTo(prefix);
        for (final String invalid : List.of("null", "0", "-1", "1.5", "2147483648")) {
            final ResponseEntity<String> response = upload(f.owner().token(), List.of(
                    op("business_settings", "PATCH", f.settings(), "{\"next_invoice_number\":" + invalid + "}")));
            assertThat((int) JsonPath.read(response.getBody(), "$.rejected.length()")).isEqualTo(1);
        }
    }

    @Test
    void shouldRejectForeignReferencesAndExistingChildIdsOwnedByAnotherStore() {
        final SaleFixture owner = fixture();
        final SaleFixture other = fixture();
        assertAccepted(upload(owner.owner().token(), graph(owner)), 8);
        assertAccepted(upload(other.owner().token(), graph(other)), 8);

        final ResponseEntity<String> response = upload(other.owner().token(), List.of(
                op("business_settings", "PATCH", owner.settings(), "{\"next_invoice_number\":999}"),
                op("sales", "PUT", owner.sale(), saleData(other, "COMPLETED")),
                op("sale_items", "PUT", owner.item(), itemData(other)),
                op("payments", "PUT", owner.payment(), paymentData(other)),
                op("ledger_entries", "PUT", owner.debit(), ledgerData(other, true)),
                op("sale_items", "PUT", UUID.randomUUID(), itemData(owner)),
                op("sales", "PUT", UUID.randomUUID(), saleData(owner, "COMPLETED"))));
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat((int) JsonPath.read(response.getBody(), "$.applied")).isZero();
        assertThat((int) JsonPath.read(response.getBody(), "$.rejected.length()")).isEqualTo(7);
        assertThat(jdbc.queryForObject("SELECT sale_id FROM sale_items WHERE id = ?", UUID.class, owner.item()))
                .isEqualTo(owner.sale());
        assertThat(jdbc.queryForObject("SELECT sale_id FROM payments WHERE id = ?", UUID.class, owner.payment()))
                .isEqualTo(owner.sale());
        assertThat(customerRepository.findById(owner.customer()).orElseThrow().getAccountBalance())
                .isEqualByComparingTo("60.00");
    }

    @Test
    void shouldRepairPreviouslyUploadedStockMovementLinksWhenOriginalIdsAreRetried() {
        final SaleFixture f = fixture();
        jdbc.update("""
                INSERT INTO stock_movements (id, type, quantity, quantity_before, quantity_after, description,
                product_id, store_id, date_created, last_updated) VALUES (?, 'SALE', 1, 3, 2, 'Sale INV-100', ?, ?, now(), now())
                """, f.movement(), f.product(), f.owner().storeId());

        assertAccepted(upload(f.owner().token(), graph(f)), 8);
        assertThat(stockMovementRepository.count()).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT sale_item_id FROM stock_movements WHERE id = ?", UUID.class, f.movement()))
                .isEqualTo(f.item());
        assertThat(productRepository.findById(f.product()).orElseThrow().getStockQuantity()).isEqualByComparingTo("2.00");
    }

    @Test
    void shouldReplaceDraftChildrenAndCompleteUsingTheOriginalSaleId() {
        final SaleFixture f = fixture();
        assertAccepted(upload(f.owner().token(), List.of(
                op("sales", "PUT", f.sale(), saleData(f, "IN_PROGRESS")),
                op("sale_items", "PUT", f.item(), itemData(f)))), 2);
        final UUID replacement = UUID.randomUUID();
        final List<String> completion = new ArrayList<>(graph(f));
        completion.removeIf(operation -> operation.contains(f.item().toString())
                && operation.contains("\"table\":\"sale_items\""));
        completion.removeIf(operation -> operation.contains("\"table\":\"stock_movements\""));
        completion.add(op("sale_items", "DELETE", f.item(), null));
        completion.add(op("sale_items", "PUT", replacement, itemData(f)));
        assertAccepted(upload(f.owner().token(), completion), 8);
        assertThat(saleRepository.count()).isEqualTo(1);
        assertThat(saleRepository.findById(f.sale()).orElseThrow().getStatus().name()).isEqualTo("COMPLETED");
        assertThat(saleItemRepository.findById(f.item())).isEmpty();
        assertThat(saleItemRepository.findById(replacement)).isPresent();
    }

    @Test
    void shouldRecomputeBalancesFromOriginalAndReversingEntriesAndRefuseHardDeletes() {
        final SaleFixture f = fixture();
        assertAccepted(upload(f.owner().token(), graph(f)), 8);
        assertAccepted(upload(f.owner().token(), List.of(op("ledger_entries", "PUT", UUID.randomUUID(), """
                {"direction":"CREDIT","amount":"60.00","type":"ADJUSTMENT","customer_id":"%s","voided":false}"""
                .formatted(f.customer())))), 1);
        assertThat(customerRepository.findById(f.customer()).orElseThrow().getAccountBalance())
                .isEqualByComparingTo(BigDecimal.ZERO);
        final ResponseEntity<String> response = upload(f.owner().token(), List.of(
                op("ledger_entries", "DELETE", f.debit(), null),
                op("sales", "DELETE", f.sale(), null),
                op("business_settings", "DELETE", f.settings(), null)));
        assertThat((int) JsonPath.read(response.getBody(), "$.rejected.length()")).isEqualTo(3);
        assertThat(saleRepository.count()).isEqualTo(1);
        assertThat(ledgerEntryRepository.count()).isEqualTo(3);
    }
}
