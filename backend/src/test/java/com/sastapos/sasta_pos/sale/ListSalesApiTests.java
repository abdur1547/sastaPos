package com.sastapos.sasta_pos.sale;

import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.JsonPath;
import com.sastapos.sasta_pos.sale.support.SaleApiTestBase;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

class ListSalesApiTests extends SaleApiTestBase {

    private StoreOwner owner;
    private UUID product;
    private UUID cust;
    private UUID debitId;
    private UUID creditId;
    private UUID voidedId;

    @BeforeEach
    void seed() {
        owner = createStore();
        product = createProductWithStock(owner.token(), seedUnit(false).getId(), "100");
        cust = newCustomer(owner.token());
        debitId = createSale(owner.token(), simpleDebit(product));
        creditId = createSale(owner.token(), saleJson("CREDIT", cust, null, null, "1", "25.00", "5.00",
                item(product, "5", "25.00"), payment("5.00", "BANK")));
        voidedId = createSale(owner.token(), simpleDebit(product));
        postJson(voidUrl(voidedId), "{\"voidReason\":\"x\"}", owner.token());
    }

    private List<String> ids(final String query) {
        final ResponseEntity<String> r = getJson(SALES_URL + query, owner.token());
        assertThat(r.getStatusCode()).as(r.getBody()).isEqualTo(HttpStatus.OK);
        return JsonPath.read(r.getBody(), "$.content[*].id");
    }

    @Test
    void defaultExcludesVoided() {
        assertThat(ids("")).containsExactlyInAnyOrder(debitId.toString(), creditId.toString());
    }

    @Test
    void filtersByStatusIncludingVoided() {
        assertThat(ids("?saleStatus=VOIDED")).containsExactly(voidedId.toString());
        assertThat(ids("?saleStatus=VOIDED&saleStatus=COMPLETED")).hasSize(3);
        assertThat(ids("?saleStatus=IN_PROGRESS")).isEmpty();
    }

    @Test
    void filtersByTypeCustomerProductPaymentRemaining() {
        assertThat(ids("?saleType=CREDIT")).containsExactly(creditId.toString());
        assertThat(ids("?customerId=" + cust)).containsExactly(creditId.toString());
        assertThat(ids("?productId=" + product)).hasSize(2);
        assertThat(ids("?productId=" + UUID.randomUUID())).isEmpty();
        assertThat(ids("?paymentMethod=BANK")).containsExactly(creditId.toString());
        assertThat(ids("?hasRemaining=true")).containsExactly(creditId.toString());
        assertThat(ids("?hasRemaining=false")).containsExactly(debitId.toString());
    }

    @Test
    void filtersByAmountRangeAndInvoice() {
        assertThat(ids("?minTotalAmount=20")).containsExactly(creditId.toString());
        assertThat(ids("?maxTotalAmount=10")).containsExactly(debitId.toString());
        final String inv = JsonPath.read(getJson(saleUrl(debitId), owner.token()).getBody(),
                "$.invoiceNumber");
        assertThat(ids("?invoiceNumber=" + inv.toLowerCase())).contains(debitId.toString());
    }

    @Test
    void filtersByDateRangeAndUser() {
        assertThat(ids("?from=2000-01-01T00:00:00&to=2999-01-01T00:00:00")).hasSize(2);
        assertThat(ids("?from=2999-01-01T00:00:00")).isEmpty();
        assertThat(ids("?to=2000-01-01T00:00:00")).isEmpty();
        final UUID userId = saleRepository.findById(debitId).orElseThrow().getUser().getId();
        assertThat(ids("?userId=" + userId)).hasSize(2);
        assertThat(ids("?userId=" + UUID.randomUUID())).isEmpty();
    }

    @Test
    void paginationAndSorting() {
        final ResponseEntity<String> r = getJson(SALES_URL + "?size=1&page=0&sortBy=totalAmount&sortDir=asc",
                owner.token());
        assertThat(JsonPath.<Integer>read(r.getBody(), "$.content.length()")).isEqualTo(1);
        assertThat((String) JsonPath.read(r.getBody(), "$.content[0].id")).isEqualTo(debitId.toString());
        assertThat(ids("?size=1&page=1&sortBy=totalAmount&sortDir=asc")).containsExactly(creditId.toString());
        assertThat(ids("?size=1&sortBy=totalAmount&sortDir=desc")).containsExactly(creditId.toString());
    }

    @Test
    void oversizedPageIsCapped() {
        final ResponseEntity<String> r = getJson(SALES_URL + "?size=1000", owner.token());
        assertThat(r.getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    @Test
    void invalidParamsAre400() {
        for (final String q : new String[] {"?saleStatus=BOGUS", "?saleType=BOGUS", "?paymentMethod=BOGUS",
                "?sortBy=password", "?sortDir=sideways", "?from=notadate", "?customerId=abc", "?page=-1",
                "?size=0", "?minTotalAmount=10&maxTotalAmount=5", "?from=2026-02-01T00:00:00&to=2026-01-01T00:00:00"}) {
            assertThat(getJson(SALES_URL + q, owner.token()).getStatusCode()).as(q)
                    .isEqualTo(HttpStatus.BAD_REQUEST);
        }
    }

    @Test
    void scopedToStoreAndAuthenticated() {
        final String other = createStore().token();
        final ResponseEntity<String> r = getJson(SALES_URL, other);
        assertThat(JsonPath.<Integer>read(r.getBody(), "$.content.length()")).isZero();
        assertThat(restTemplate.getForEntity(SALES_URL, String.class).getStatusCode().value()).isIn(401, 403);
    }

    // ---------- get ----------

    @Test
    void getReturnsFullSale() {
        final ResponseEntity<String> r = getJson(saleUrl(creditId), owner.token());
        assertThat(r.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat((String) JsonPath.read(r.getBody(), "$.customer.id")).isEqualTo(cust.toString());
        assertThat(JsonPath.<Integer>read(r.getBody(), "$.saleItems.length()")).isEqualTo(1);
        assertThat(JsonPath.<Integer>read(r.getBody(), "$.payments.length()")).isEqualTo(1);
    }

    @Test
    void getVoidedStillAvailable() {
        assertThat(getJson(saleUrl(voidedId), owner.token()).getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    @Test
    void getUnknownOrForeignIs404() {
        assertThat(getJson(saleUrl(UUID.randomUUID()), owner.token()).getStatusCode())
                .isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(getJson(saleUrl(debitId), createStore().token()).getStatusCode())
                .isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(getJson(SALES_URL + "/not-a-uuid", owner.token()).getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);
    }
}
