package com.sastapos.sasta_pos.sale;

import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.JsonPath;
import com.sastapos.sasta_pos.sale.support.SaleApiTestBase;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

class CreateSaleApiTests extends SaleApiTestBase {

    private StoreOwner owner;
    private UUID product;

    @BeforeEach
    void setUpStore() {
        owner = createStore();
        product = createProductWithStock(owner.token(), seedUnit(false).getId(), "100");
    }

    private ResponseEntity<String> post(final String body) {
        return postJson(SALES_URL, body, owner.token());
    }

    @Test
    void debitSaleHappyPath() {
        final ResponseEntity<String> r = post(simpleDebit(product));
        assertThat(r.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        final String b = r.getBody();
        assertThat((String) JsonPath.read(b, "$.saleStatus")).isEqualTo("COMPLETED");
        assertThat((String) JsonPath.read(b, "$.saleType")).isEqualTo("DEBIT");
        assertThat(decimal(b, "$.totalAmount")).isEqualByComparingTo("10.00");
        assertThat(decimal(b, "$.remaining")).isEqualByComparingTo("0");
        assertThat(decimal(b, "$.totalPaid")).isEqualByComparingTo("10.00");
        assertThat((String) JsonPath.read(b, "$.invoiceNumber")).doesNotStartWith("DRAFT");
        assertThat(JsonPath.<Integer>read(b, "$.saleItems.length()")).isEqualTo(1);
        assertThat(JsonPath.<Integer>read(b, "$.payments.length()")).isEqualTo(1);
        assertThat(stockOf(product)).isEqualByComparingTo("98");
        assertThat(stockMovementRepository.count()).isGreaterThanOrEqualTo(2);
        assertThat(ledgerEntryRepository.count()).isZero();
    }

    @Test
    void invoiceNumbersIncrement() {
        final String a = JsonPath.read(post(simpleDebit(product)).getBody(), "$.invoiceNumber");
        final String b = JsonPath.read(post(simpleDebit(product)).getBody(), "$.invoiceNumber");
        assertThat(a).isNotEqualTo(b);
    }

    @Test
    void soldAtIsUtcRatherThanStoreLocalTime() {
        final LocalDateTime before = LocalDateTime.now(ZoneOffset.UTC);
        final ResponseEntity<String> response = post(simpleDebit(product));
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        final UUID id = UUID.fromString(JsonPath.read(response.getBody(), "$.id"));
        assertThat(saleRepository.findById(id).orElseThrow().getSoldAt())
                .isBetween(before, LocalDateTime.now(ZoneOffset.UTC));
    }

    @Test
    void taxAndDiscountAreComputedServerSide() {
        final UUID taxId = seedTaxCategory(0.10).getId();
        final UUID taxed = createProduct(owner.token(), productJson(productName(), null, null, uniquePct(),
                "100.00", "10", seedUnit(false).getId(), "[\"" + taxId + "\"]"));
        // subtotal 100, discount 10 -> taxable 90; tax is 10% of the line (100) = 10; total 100
        final ResponseEntity<String> r = post(saleJson("DEBIT", null, "10.00", null, "1", "100.00", "100.00",
                item(taxed, "1", "100.00"), payment("100.00", "CASH")));
        assertThat(r.getStatusCode()).as(r.getBody()).isEqualTo(HttpStatus.CREATED);
        assertThat(decimal(r.getBody(), "$.taxableAmount")).isEqualByComparingTo("90.00");
        assertThat(decimal(r.getBody(), "$.taxAmount")).isEqualByComparingTo("10.00");
        assertThat(decimal(r.getBody(), "$.totalAmount")).isEqualByComparingTo("100.00");
    }

    @Test
    void creditSaleWithPartialPaymentUpdatesLedgerAndBalance() {
        final UUID cust = newCustomer(owner.token());
        final ResponseEntity<String> r = post(saleJson("CREDIT", cust, null, null, "1", "10.00", "4.00",
                item(product, "2", "10.00"), payment("4.00", "CASH")));
        assertThat(r.getStatusCode()).as(r.getBody()).isEqualTo(HttpStatus.CREATED);
        assertThat(decimal(r.getBody(), "$.remaining")).isEqualByComparingTo("6.00");
        assertThat(balanceOf(cust)).isEqualByComparingTo("6.00");
        assertThat(ledgerEntryRepository.count()).isEqualTo(2);
        final UUID saleId = UUID.fromString(JsonPath.read(r.getBody(), "$.id"));
        assertThat(ledgerEntryRepository.findAll()).allSatisfy(entry ->
                assertThat(entry.getSale().getId()).isEqualTo(saleId));
    }

    @Test
    void creditSaleWithNoPayment() {
        final UUID cust = newCustomer(owner.token());
        final ResponseEntity<String> r = post(saleJson("CREDIT", cust, null, null, "1", "10.00", "0",
                item(product, "2", "10.00"), ""));
        assertThat(r.getStatusCode()).as(r.getBody()).isEqualTo(HttpStatus.CREATED);
        assertThat(balanceOf(cust)).isEqualByComparingTo("10.00");
        final UUID saleId = UUID.fromString(JsonPath.read(r.getBody(), "$.id"));
        assertThat(ledgerEntryRepository.findAll()).hasSize(1).allSatisfy(entry ->
                assertThat(entry.getSale().getId()).isEqualTo(saleId));
    }

    @Test
    void debitSaleWithCustomerKeepsBalanceUnchanged() {
        final UUID cust = newCustomer(owner.token());
        final ResponseEntity<String> r = post(saleJson("DEBIT", cust, null, null, "1", "10.00", "10.00",
                item(product, "2", "10.00"), payment("10.00", "BANK")));
        assertThat(r.getStatusCode()).as(r.getBody()).isEqualTo(HttpStatus.CREATED);
        assertThat(balanceOf(cust)).isEqualByComparingTo("0");
        final UUID saleId = UUID.fromString(JsonPath.read(r.getBody(), "$.id"));
        assertThat(ledgerEntryRepository.findAll()).hasSize(2).allSatisfy(entry ->
                assertThat(entry.getSale().getId()).isEqualTo(saleId));
    }

    @Test
    void debitSaleWithSplitPaymentsLinksEveryLedgerEntry() {
        final UUID cust = newCustomer(owner.token());
        final ResponseEntity<String> r = post(saleJson("DEBIT", cust, null, null, "1", "10.00", "10.00",
                item(product, "2", "10.00"), payment("4.00", "CASH") + "," + payment("6.00", "BANK")));
        assertThat(r.getStatusCode()).as(r.getBody()).isEqualTo(HttpStatus.CREATED);
        final UUID saleId = UUID.fromString(JsonPath.read(r.getBody(), "$.id"));
        assertThat(ledgerEntryRepository.findAll()).hasSize(3).allSatisfy(entry ->
                assertThat(entry.getSale().getId()).isEqualTo(saleId));
        assertThat(balanceOf(cust)).isEqualByComparingTo("0");
    }

    @Test
    void fractionalQuantityAllowedForFractionalUnit() {
        final UUID p = createProductWithStock(owner.token(), seedUnit(true).getId(), "10");
        final ResponseEntity<String> r = post(saleJson("DEBIT", null, null, null, "1", "7.50", "7.50",
                item(p, "1.5", "7.50"), payment("7.50", "CASH")));
        assertThat(r.getStatusCode()).as(r.getBody()).isEqualTo(HttpStatus.CREATED);
        assertThat(stockOf(p)).isEqualByComparingTo("8.5");
    }

    @Test
    void fractionalQuantityRejectedForWholeUnit() {
        final ResponseEntity<String> r = post(saleJson("DEBIT", null, null, null, "1", "7.50", "7.50",
                item(product, "1.5", "7.50"), payment("7.50", "CASH")));
        assertThat(r.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void draftHasNoSideEffects() {
        final ResponseEntity<String> r = post(saleJson("DEBIT", null, null, "IN_PROGRESS", "1", "10.00",
                "0", item(product, "2", "10.00"), ""));
        assertThat(r.getStatusCode()).as(r.getBody()).isEqualTo(HttpStatus.CREATED);
        assertThat((String) JsonPath.read(r.getBody(), "$.saleStatus")).isEqualTo("IN_PROGRESS");
        assertThat(stockOf(product)).isEqualByComparingTo("100");
    }

    @Test
    void snakeCaseAliasesAccepted() {
        final String body = """
                {"sale_type":"DEBIT","total_items":1,"total_price":10.00,"total_paid_price":10.00,
                 "sale_items":[{"product_id":"%s","quantity":2,"item_total":10.00}],
                 "payments":[{"amount":10.00,"method":"CASH"}]}""".formatted(product);
        assertThat(post(body).getStatusCode()).isEqualTo(HttpStatus.CREATED);
    }

    // ---------- failures ----------

    @Test
    void requiresAuthentication() {
        final ResponseEntity<String> r = restTemplate.postForEntity(SALES_URL, null, String.class);
        assertThat(r.getStatusCode().value()).isIn(401, 403);
    }

    @Test
    void userWithoutStoreGets404() {
        final String token = signupAndGetToken("No Store", "nostore@example.com", "Password123!");
        assertThat(postJson(SALES_URL, simpleDebit(product), token).getStatusCode())
                .isEqualTo(HttpStatus.NOT_FOUND);
    }

    @Test
    void totalPriceMismatch() {
        final ResponseEntity<String> r = post(saleJson("DEBIT", null, null, null, "1", "11.00", "11.00",
                item(product, "2", "10.00"), payment("11.00", "CASH")));
        assertThat(r.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(stockOf(product)).isEqualByComparingTo("100");
    }

    @Test
    void itemTotalMismatch() {
        assertThat(post(saleJson("DEBIT", null, null, null, "1", "10.00", "10.00",
                item(product, "2", "9.00"), payment("10.00", "CASH"))).getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void totalItemsMismatch() {
        assertThat(post(saleJson("DEBIT", null, null, null, "5", "10.00", "10.00",
                item(product, "2", "10.00"), payment("10.00", "CASH"))).getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void duplicateProductRejected() {
        assertThat(post(saleJson("DEBIT", null, null, null, "2", "20.00", "20.00",
                item(product, "2", "10.00") + "," + item(product, "2", "10.00"),
                payment("20.00", "CASH"))).getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void emptyItemsRejected() {
        assertThat(post(saleJson("DEBIT", null, null, null, "0", "0", "0", "", "")).getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void nonPositiveQuantityRejected() {
        assertThat(post(saleJson("DEBIT", null, null, null, "1", "0", "0", item(product, "0", "0"), ""))
                .getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(post(saleJson("DEBIT", null, null, null, "1", "-10.00", "-10.00",
                item(product, "-2", "-10.00"), payment("-10.00", "CASH"))).getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void creditWithoutCustomerRejected() {
        assertThat(post(saleJson("CREDIT", null, null, null, "1", "10.00", "0", item(product, "2", "10.00"),
                "")).getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void discountGreaterThanSubtotalRejected() {
        assertThat(post(saleJson("DEBIT", null, "50.00", null, "1", "0", "0", item(product, "2", "10.00"),
                "")).getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void debitUnderpaidRejected() {
        assertThat(post(saleJson("DEBIT", null, null, null, "1", "10.00", "5.00", item(product, "2", "10.00"),
                payment("5.00", "CASH"))).getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void overpaymentRejected() {
        final UUID cust = newCustomer(owner.token());
        assertThat(post(saleJson("CREDIT", cust, null, null, "1", "10.00", "20.00",
                item(product, "2", "10.00"), payment("20.00", "CASH"))).getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void paymentSumMismatchRejected() {
        final UUID cust = newCustomer(owner.token());
        assertThat(post(saleJson("CREDIT", cust, null, null, "1", "10.00", "5.00",
                item(product, "2", "10.00"), payment("3.00", "CASH"))).getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void creditPaymentMethodRejected() {
        assertThat(post(saleJson("DEBIT", null, null, null, "1", "10.00", "10.00", item(product, "2", "10.00"),
                payment("10.00", "CREDIT"))).getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void invalidEnumRejected() {
        assertThat(post(simpleDebit(product).replace("DEBIT", "BOGUS")).getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void unknownPropertyRejected() {
        assertThat(post(simpleDebit(product).replaceFirst("\\{", "{\"foo\":1,")).getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void insufficientStockIs409AndNothingWritten() {
        final UUID p2 = createProductWithStock(owner.token(), seedUnit(false).getId(), "1");
        final ResponseEntity<String> r = post(saleJson("DEBIT", null, null, null, "2", "20.00", "20.00",
                item(product, "2", "10.00") + "," + item(p2, "2", "10.00"), payment("20.00", "CASH")));
        assertThat(r.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(stockOf(product)).isEqualByComparingTo("100");
        assertThat(stockOf(p2)).isEqualByComparingTo("1");
        assertThat(saleRepository.count()).isZero();
    }

    @Test
    void unknownProductIs404() {
        assertThat(post(simpleDebit(UUID.randomUUID())).getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    }

    @Test
    void otherStoresProductAndCustomerAre404() {
        final StoreOwner other = createStore();
        final UUID foreign = createProductWithStock(other.token(), seedUnit(false).getId(), "10");
        assertThat(post(simpleDebit(foreign)).getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        final UUID foreignCust = newCustomer(other.token());
        assertThat(post(saleJson("CREDIT", foreignCust, null, null, "1", "10.00", "0",
                item(product, "2", "10.00"), "")).getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    }

    @Test
    void inactiveProductRejected() {
        final var p = productRepository.findById(product).orElseThrow();
        p.setStatus(com.sastapos.sasta_pos.store.RowStatus.INACTIVE);
        productRepository.save(p);
        assertThat(post(simpleDebit(product)).getStatusCode().is4xxClientError()).isTrue();
        assertThat(stockOf(product)).isEqualByComparingTo(new BigDecimal("100"));
    }
}
