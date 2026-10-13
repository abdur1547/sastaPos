package com.sastapos.sasta_pos.sale;

import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.JsonPath;
import com.sastapos.sasta_pos.ledger_entry.LedgerEntryType;
import com.sastapos.sasta_pos.sale.support.SaleApiTestBase;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

class ManageSaleApiTests extends SaleApiTestBase {

    private StoreOwner owner;
    private UUID product;

    @BeforeEach
    void setUpStore() {
        owner = createStore();
        product = createProductWithStock(owner.token(), seedUnit(false).getId(), "100");
    }

    private String draft(final String qty, final String total) {
        return saleJson("DEBIT", null, null, "IN_PROGRESS", "1", total, "0", item(product, qty, total), "");
    }

    // ---------- update (PUT) ----------

    @Test
    void putReplacesDraftThenFinalises() {
        final UUID id = createSale(owner.token(), draft("2", "10.00"));
        ResponseEntity<String> r = putJson(saleUrl(id), draft("4", "20.00"), owner.token());
        assertThat(r.getStatusCode()).as(r.getBody()).isEqualTo(HttpStatus.OK);
        assertThat(decimal(r.getBody(), "$.totalAmount")).isEqualByComparingTo("20.00");
        assertThat(stockOf(product)).isEqualByComparingTo("100");

        r = putJson(saleUrl(id), saleJson("DEBIT", null, null, "COMPLETED", "1", "20.00", "20.00",
                item(product, "4", "20.00"), payment("20.00", "CASH")), owner.token());
        assertThat(r.getStatusCode()).as(r.getBody()).isEqualTo(HttpStatus.OK);
        assertThat((String) JsonPath.read(r.getBody(), "$.saleStatus")).isEqualTo("COMPLETED");
        assertThat((String) JsonPath.read(r.getBody(), "$.invoiceNumber")).doesNotStartWith("DRAFT");
        assertThat(stockOf(product)).isEqualByComparingTo("96");
    }

    @Test
    void finalisingWithInsufficientStockIs409AndStaysDraft() {
        final UUID id = createSale(owner.token(), draft("2", "10.00"));
        final ResponseEntity<String> r = putJson(saleUrl(id), saleJson("DEBIT", null, null, "COMPLETED", "1",
                "1000.00", "1000.00", item(product, "200", "1000.00"), payment("1000.00", "CASH")),
                owner.token());
        assertThat(r.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(saleRepository.findById(id).orElseThrow().getStatus()).isEqualTo(SaleStatus.IN_PROGRESS);
    }

    @Test
    void putOnCompletedSaleIs409() {
        final UUID id = createSale(owner.token(), simpleDebit(product));
        assertThat(putJson(saleUrl(id), simpleDebit(product), owner.token()).getStatusCode())
                .isEqualTo(HttpStatus.CONFLICT);
    }

    @Test
    void putOnUnknownOrForeignSaleIs404() {
        assertThat(putJson(saleUrl(UUID.randomUUID()), draft("2", "10.00"), owner.token()).getStatusCode())
                .isEqualTo(HttpStatus.NOT_FOUND);
        final UUID id = createSale(owner.token(), draft("2", "10.00"));
        final StoreOwner other = createStore();
        assertThat(putJson(saleUrl(id), draft("2", "10.00"), other.token()).getStatusCode())
                .isEqualTo(HttpStatus.NOT_FOUND);
    }

    @Test
    void putWithInvalidBodyIs400() {
        final UUID id = createSale(owner.token(), draft("2", "10.00"));
        assertThat(putJson(saleUrl(id), draft("2", "99.00"), owner.token()).getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);
    }

    // ---------- patch ----------

    @Test
    void patchUpdatesDescription() {
        final UUID id = createSale(owner.token(), simpleDebit(product));
        final ResponseEntity<String> r = patchJson(saleUrl(id), "{\"description\":\"note\"}", owner.token());
        assertThat(r.getStatusCode()).as(r.getBody()).isEqualTo(HttpStatus.OK);
        assertThat((String) JsonPath.read(r.getBody(), "$.description")).isEqualTo("note");
    }

    @Test
    void patchUpdatesPaymentMetadata() {
        final UUID id = createSale(owner.token(), simpleDebit(product));
        final ResponseEntity<String> got = getJson(saleUrl(id), owner.token());
        final String payId = JsonPath.read(got.getBody(), "$.payments[0].id");
        final ResponseEntity<String> r = patchJson(saleUrl(id),
                "{\"payments\":[{\"id\":\"%s\",\"referenceNumber\":\"REF-1\"}]}".formatted(payId),
                owner.token());
        assertThat(r.getStatusCode()).as(r.getBody()).isEqualTo(HttpStatus.OK);
        assertThat((String) JsonPath.read(r.getBody(), "$.payments[0].referenceNumber")).isEqualTo("REF-1");
        assertThat(decimal(r.getBody(), "$.payments[0].amount")).isEqualByComparingTo("10.00");
    }

    @Test
    void patchUnknownPaymentIs404() {
        final UUID id = createSale(owner.token(), simpleDebit(product));
        assertThat(patchJson(saleUrl(id),
                "{\"payments\":[{\"id\":\"%s\",\"description\":\"x\"}]}".formatted(UUID.randomUUID()),
                owner.token()).getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    }

    @Test
    void patchFinancialFieldsIs409() {
        final UUID id = createSale(owner.token(), simpleDebit(product));
        for (final String body : new String[] {"{\"discount\":1}", "{\"saleItems\":[]}",
                "{\"saleStatus\":\"VOIDED\"}", "{\"customerId\":\"" + UUID.randomUUID() + "\"}",
                "{\"saleType\":\"CREDIT\"}"}) {
            assertThat(patchJson(saleUrl(id), body, owner.token()).getStatusCode()).as(body)
                    .isEqualTo(HttpStatus.CONFLICT);
        }
    }

    @Test
    void patchUnknownPropertyIs400AndForeignSaleIs404() {
        final UUID id = createSale(owner.token(), simpleDebit(product));
        assertThat(patchJson(saleUrl(id), "{\"bogus\":1}", owner.token()).getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(patchJson(saleUrl(id), "{\"description\":\"x\"}", createStore().token()).getStatusCode())
                .isEqualTo(HttpStatus.NOT_FOUND);
    }

    @Test
    void patchVoidedSaleIs409() {
        final UUID id = createSale(owner.token(), simpleDebit(product));
        postJson(voidUrl(id), "{\"voidReason\":\"oops\"}", owner.token());
        assertThat(patchJson(saleUrl(id), "{\"description\":\"x\"}", owner.token()).getStatusCode())
                .isEqualTo(HttpStatus.CONFLICT);
    }

    // ---------- void ----------

    @Test
    void ownerVoidRestoresStockAndCustomerBalance() {
        final UUID cust = newCustomer(owner.token());
        final UUID id = createSale(owner.token(), saleJson("CREDIT", cust, null, null, "1", "10.00", "4.00",
                item(product, "2", "10.00"), payment("4.00", "CASH")));
        assertThat(balanceOf(cust)).isEqualByComparingTo("6.00");
        final ResponseEntity<String> r = postJson(voidUrl(id), "{\"voidReason\":\"mistake\"}", owner.token());
        assertThat(r.getStatusCode()).as(r.getBody()).isEqualTo(HttpStatus.OK);
        assertThat((String) JsonPath.read(r.getBody(), "$.sale.saleStatus")).isEqualTo("VOIDED");
        assertThat((String) JsonPath.read(r.getBody(), "$.sale.voidReason")).isEqualTo("mistake");
        assertThat(JsonPath.<Integer>read(r.getBody(), "$.stockMovements.length()")).isEqualTo(1);
        assertThat(JsonPath.<Integer>read(r.getBody(), "$.ledgerEntries.length()")).isEqualTo(2);
        assertThat(JsonPath.<List<String>>read(r.getBody(), "$.ledgerEntries[*].saleId"))
                .containsExactly(id.toString(), id.toString());
        assertThat(ledgerEntryRepository.findAll()).hasSize(4).allSatisfy(entry ->
                assertThat(entry.getSale().getId()).isEqualTo(id));
        assertThat(stockOf(product)).isEqualByComparingTo("100");
        assertThat(balanceOf(cust)).isEqualByComparingTo("0");
    }

    @Test
    void voidSaleLinkedPaymentRetainsSaleOnItsReversal() {
        final UUID cust = newCustomer(owner.token());
        final UUID id = createSale(owner.token(), saleJson("DEBIT", cust, null, null, "1", "10.00", "10.00",
                item(product, "2", "10.00"), payment("10.00", "CASH")));
        final UUID paymentEntryId = ledgerEntryRepository.findAll().stream()
                .filter(entry -> entry.getType() == LedgerEntryType.PAYMENT)
                .findFirst().orElseThrow().getId();

        final ResponseEntity<String> r = postJson("/api/customers/" + cust + "/payments/" + paymentEntryId + "/void",
                "{\"voidReason\":\"bounced\"}", owner.token());

        assertThat(r.getStatusCode()).as(r.getBody()).isEqualTo(HttpStatus.OK);
        assertThat((String) JsonPath.read(r.getBody(), "$.voidedEntry.saleId")).isEqualTo(id.toString());
        assertThat((String) JsonPath.read(r.getBody(), "$.reversalEntry.saleId")).isEqualTo(id.toString());
        assertThat(ledgerEntryRepository.findAll()).hasSize(3).allSatisfy(entry ->
                assertThat(entry.getSale().getId()).isEqualTo(id));
        assertThat(balanceOf(cust)).isEqualByComparingTo("10.00");
    }

    @Test
    void voidDebitSaleWithoutCustomer() {
        final UUID id = createSale(owner.token(), simpleDebit(product));
        final ResponseEntity<String> r = postJson(voidUrl(id), "{\"voidReason\":\"x\"}", owner.token());
        assertThat(r.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(JsonPath.<Integer>read(r.getBody(), "$.ledgerEntries.length()")).isZero();
        assertThat(stockOf(product)).isEqualByComparingTo("100");
    }

    @Test
    void voidDraftHasNoReversals() {
        final UUID id = createSale(owner.token(), draft("2", "10.00"));
        final ResponseEntity<String> r = postJson(voidUrl(id), "{\"voidReason\":\"x\"}", owner.token());
        assertThat(r.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(JsonPath.<Integer>read(r.getBody(), "$.stockMovements.length()")).isZero();
        assertThat(stockOf(product)).isEqualByComparingTo("100");
    }

    @Test
    void doubleVoidIs409() {
        final UUID id = createSale(owner.token(), simpleDebit(product));
        postJson(voidUrl(id), "{\"voidReason\":\"x\"}", owner.token());
        assertThat(postJson(voidUrl(id), "{\"voidReason\":\"x\"}", owner.token()).getStatusCode())
                .isEqualTo(HttpStatus.CONFLICT);
        assertThat(stockOf(product)).isEqualByComparingTo("100");
    }

    @Test
    void blankOrMissingReasonIs400() {
        final UUID id = createSale(owner.token(), simpleDebit(product));
        assertThat(postJson(voidUrl(id), "{\"voidReason\":\"  \"}", owner.token()).getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(postJson(voidUrl(id), "{}", owner.token()).getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void voidForeignOrUnknownSaleIs404() {
        final UUID id = createSale(owner.token(), simpleDebit(product));
        assertThat(postJson(voidUrl(id), "{\"voidReason\":\"x\"}", createStore().token()).getStatusCode())
                .isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(postJson(voidUrl(UUID.randomUUID()), "{\"voidReason\":\"x\"}", owner.token())
                .getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    }

    @Test
    void cashierCanVoidOwnSaleSameDayButNotOthers() {
        final String cashier = signupCashierAttachedToStore(owner.storeId());
        final UUID mine = createSale(cashier, simpleDebit(product));
        final UUID ownersSale = createSale(owner.token(), simpleDebit(product));
        assertThat(postJson(voidUrl(ownersSale), "{\"voidReason\":\"x\"}", cashier).getStatusCode())
                .isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(postJson(voidUrl(mine), "{\"voidReason\":\"x\"}", cashier).getStatusCode())
                .isEqualTo(HttpStatus.OK);
    }

    @Test
    void cashierCannotVoidOwnSaleFromAnotherDay() {
        final String cashier = signupCashierAttachedToStore(owner.storeId());
        final UUID id = createSale(cashier, simpleDebit(product));
        backdateSale(id, 2);
        assertThat(postJson(voidUrl(id), "{\"voidReason\":\"x\"}", cashier).getStatusCode())
                .isEqualTo(HttpStatus.FORBIDDEN);
    }

    @Test
    void cashierSameDayPermissionUsesStoreDateRatherThanUtcDate() {
        final var store = storeRepository.findById(owner.storeId()).orElseThrow();
        store.setTimezone(LocalDateTime.now(ZoneOffset.UTC).getHour() < 12
                ? "Etc/GMT+12" : "Pacific/Kiritimati");
        storeRepository.save(store);
        final String cashier = signupCashierAttachedToStore(owner.storeId());
        final UUID id = createSale(cashier, simpleDebit(product));
        assertThat(postJson(voidUrl(id), "{\"voidReason\":\"x\"}", cashier).getStatusCode())
                .isEqualTo(HttpStatus.OK);
    }
}
