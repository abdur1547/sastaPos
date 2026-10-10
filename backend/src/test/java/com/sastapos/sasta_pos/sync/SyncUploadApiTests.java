package com.sastapos.sasta_pos.sync;

import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.JsonPath;
import com.sastapos.sasta_pos.customer.Customer;
import com.sastapos.sasta_pos.product.Product;
import com.sastapos.sasta_pos.product.support.ProductApiTestBase;
import com.sastapos.sasta_pos.sale.SaleStatus;
import com.sastapos.sasta_pos.store.RowStatus;
import com.sastapos.sasta_pos.tax_category.TaxCategory;
import com.sastapos.sasta_pos.units_of_measure.UnitsOfMeasure;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;


/** PowerSync write path: POST /api/sync/upload. */
class SyncUploadApiTests extends ProductApiTestBase {

    private static final String UPLOAD_URL = "/api/sync/upload";

    private static String op(final String table, final String op, final UUID id, final String data) {
        return op(table, op, id.toString(), data);
    }

    private static String op(final String table, final String op, final String id, final String data) {
        return "{\"table\":\"%s\",\"op\":\"%s\",\"id\":\"%s\"%s}".formatted(table, op, id,
                data == null ? "" : ",\"data\":" + data);
    }

    private static String body(final String... ops) {
        return "{\"operations\":[" + String.join(",", ops) + "]}";
    }

    private ResponseEntity<String> upload(final String token, final String... ops) {
        return postJson(UPLOAD_URL, body(ops), token);
    }

    private static String productData(final UUID unitId, final String name, final String pct) {
        return """
                {"name":"%s","pct_code":"%s","unit_price":"12.5","stock_quantity":"3","units_of_measure_id":"%s",
                "status":"ACTIVE","date_created":"2025-01-01T10:00:00Z","last_updated":"2025-01-01T10:00:00Z"}"""
                .formatted(name, pct, unitId);
    }

    @Test
    void shouldRequireAuthentication() {
        assertThat(postJson(UPLOAD_URL, body()).getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void shouldInsertCustomersInBulkAndIgnoreClientBalanceAndStore() {
        final StoreOwner owner = createStore();
        final StoreOwner other = createStore();
        final UUID a = UUID.randomUUID();
        final UUID b = UUID.randomUUID();
        final String data = """
                {"name":"%s","account_balance":"999","status":"ACTIVE","store_id":"%s"}""";

        final ResponseEntity<String> response = upload(owner.token(),
                op("customers", "PUT", a, data.formatted("Ali", other.storeId())),
                op("customers", "PUT", b, data.formatted("Bilal", other.storeId())));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat((int) JsonPath.read(response.getBody(), "$.applied")).isEqualTo(2);
        assertThat((int) JsonPath.read(response.getBody(), "$.rejected.length()")).isZero();
        final Customer ali = customerRepository.findById(a).orElseThrow();
        assertThat(ali.getAccountBalance()).isEqualByComparingTo("0");
        assertThat(ali.getStore().getId()).isEqualTo(owner.storeId());
    }

    @Test
    void shouldUpsertPatchAndCoalesceProducts() {
        final StoreOwner owner = createStore();
        final UnitsOfMeasure unit = seedUnit(true);
        final UUID id = UUID.randomUUID();

        final ResponseEntity<String> response = upload(owner.token(),
                op("products", "PUT", id, productData(unit.getId(), "Soap", uniquePct())),
                op("products", "PATCH", id, "{\"name\":\"Soap Bar\",\"unit_price\":\"20\"}"));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        final Product product = productRepository.findById(id).orElseThrow();
        assertThat(product.getName()).isEqualTo("Soap Bar");
        assertThat(product.getUnitPrice()).isEqualByComparingTo("20");

        upload(owner.token(), op("products", "PATCH", id, "{\"stock_quantity\":\"7\"}"));
        assertThat(productRepository.findById(id).orElseThrow().getStockQuantity()).isEqualByComparingTo("7");
        assertThat(productRepository.findById(id).orElseThrow().getName()).isEqualTo("Soap Bar");
    }

    @Test
    void shouldBeIdempotentWhenRetried() {
        final StoreOwner owner = createStore();
        final UnitsOfMeasure unit = seedUnit(true);
        final UUID id = UUID.randomUUID();
        final String put = op("products", "PUT", id, productData(unit.getId(), "Tea", uniquePct()));

        assertThat(upload(owner.token(), put).getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(upload(owner.token(), put).getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(productRepository.count()).isEqualTo(1);
    }

    @Test
    void shouldRejectOnlyTheOffendingRowOnUniqueViolation() {
        final StoreOwner owner = createStore();
        final UnitsOfMeasure unit = seedUnit(true);
        final String pct = uniquePct();
        final UUID first = UUID.randomUUID();
        final UUID dup = UUID.randomUUID();
        final UUID fine = UUID.randomUUID();

        final ResponseEntity<String> response = upload(owner.token(),
                op("products", "PUT", first, productData(unit.getId(), "One", pct)),
                op("products", "PUT", dup, productData(unit.getId(), "Two", pct)),
                op("products", "PUT", fine, productData(unit.getId(), "Three", uniquePct())));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat((int) JsonPath.read(response.getBody(), "$.applied")).isEqualTo(2);
        assertThat((String) JsonPath.read(response.getBody(), "$.rejected[0].id")).isEqualTo(dup.toString());
        assertThat(productRepository.findById(first)).isPresent();
        assertThat(productRepository.findById(dup)).isEmpty();
        assertThat(productRepository.findById(fine)).isPresent();
    }

    @Test
    void shouldRejectInvalidRowAndUnknownTable() {
        final StoreOwner owner = createStore();
        final UUID bad = UUID.randomUUID();

        final ResponseEntity<String> response = upload(owner.token(),
                op("customers", "PUT", bad, "{\"status\":\"ACTIVE\"}"),
                op("lists", "PUT", UUID.randomUUID(), "{\"name\":\"x\"}"));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat((int) JsonPath.read(response.getBody(), "$.applied")).isZero();
        assertThat((int) JsonPath.read(response.getBody(), "$.rejected.length()")).isEqualTo(2);
        assertThat(customerRepository.findById(bad)).isEmpty();
    }

    @Test
    void shouldNotTouchAnotherStoresRows() {
        final StoreOwner owner = createStore();
        final StoreOwner other = createStore();
        final UnitsOfMeasure unit = seedUnit(true);
        final UUID id = UUID.randomUUID();
        upload(owner.token(), op("products", "PUT", id, productData(unit.getId(), "Mine", uniquePct())));

        upload(other.token(),
                op("products", "PUT", id, productData(unit.getId(), "Hijack", uniquePct())),
                op("products", "PATCH", id, "{\"name\":\"Hijack\"}"),
                op("products", "DELETE", id, null));

        final Product product = productRepository.findById(id).orElseThrow();
        assertThat(product.getName()).isEqualTo("Mine");
        assertThat(product.getStore().getId()).isEqualTo(owner.storeId());
    }

    @Test
    void shouldSyncStockMovementsAndTaxCategoryLinksThenDeleteProductWithChildren() {
        final StoreOwner owner = createStore();
        final UnitsOfMeasure unit = seedUnit(true);
        final TaxCategory tax = seedTaxCategory(10);
        final UUID product = UUID.randomUUID();
        final UUID movement = UUID.randomUUID();
        final String linkId = "[\"" + product + "\",\"" + tax.getId() + "\"]";

        final ResponseEntity<String> response = upload(owner.token(),
                op("stock_movements", "PUT", movement, """
                        {"type":"STOCK_IN","quantity":"3","quantity_before":"0","quantity_after":"3",
                        "description":"initial","product_id":"%s","date_created":"2025-01-01T10:00:00Z",
                        "last_updated":"2025-01-01T10:00:00Z"}""".formatted(product)),
                op("product_tax_categories", "PUT", linkId.replace("\"", "\\\""),
                        "{\"product_id\":\"%s\",\"tax_category_id\":\"%s\"}".formatted(product, tax.getId())),
                op("products", "PUT", product, productData(unit.getId(), "Rice", uniquePct())));

        assertThat((int) JsonPath.read(response.getBody(), "$.applied")).isEqualTo(3);
        assertThat(stockMovementRepository.findById(movement)).isPresent();

        final ResponseEntity<String> deleted = upload(owner.token(),
                op("products", "DELETE", product, null));
        assertThat(deleted.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(productRepository.findById(product)).isEmpty();
        assertThat(stockMovementRepository.findById(movement)).isEmpty();
    }

    @Test
    void shouldDeactivateSoldProductInsteadOfDeleting() {
        final StoreOwner owner = createStore();
        final UnitsOfMeasure unit = seedUnit(true);
        final UUID id = createProduct(owner.token(), unit.getId());
        recordSaleOf(owner.storeId(), id, SaleStatus.COMPLETED);

        upload(owner.token(), op("products", "DELETE", id, null));

        assertThat(productRepository.findById(id).orElseThrow().getStatus()).isEqualTo(RowStatus.INACTIVE);
    }

    @Test
    void shouldDropPatchAfterDeleteAndKeepDeleteAfterPut() {
        final StoreOwner owner = createStore();
        final UUID id = UUID.randomUUID();
        upload(owner.token(), op("customers", "PUT", id, "{\"name\":\"Gone\",\"status\":\"ACTIVE\"}"));

        upload(owner.token(),
                op("customers", "DELETE", id, null),
                op("customers", "PATCH", id, "{\"name\":\"Zombie\"}"));

        assertThat(customerRepository.findById(id)).isEmpty();
    }

}
