package com.sastapos.sasta_pos.product;

import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.JsonPath;
import com.sastapos.sasta_pos.product.support.ProductApiTestBase;
import com.sastapos.sasta_pos.stock_movement.StockMovement;
import com.sastapos.sasta_pos.stock_movement.StockMovementType;
import com.sastapos.sasta_pos.units_of_measure.UnitsOfMeasure;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;


/** Use case 4d — manual stock movements. */
class StockMovementApiTests extends ProductApiTestBase {

    @ParameterizedTest
    @ValueSource(strings = {"STOCK_IN", "ADJUSTMENT_IN"})
    void shouldIncreaseStockForInboundTypes(final String type) {
        final StoreOwner owner = createStore();
        final UUID id = createProductWithStock(owner.token(), seedUnit(true).getId(), "10");

        final ResponseEntity<String> response = postJson(stockUrl(id),
                stockMovementJson(type, "2.5", "Received PO#1234"), owner.token());

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        final Map<String, Object> movement = JsonPath.read(response.getBody(), "$.stockMovement");
        assertThat(movement.keySet()).containsExactlyInAnyOrder("id", "type", "quantity", "quantityBefore",
                "quantityAfter", "description", "productId", "storeId", "createdAt");
        assertThat((String) JsonPath.read(response.getBody(), "$.stockMovement.type")).isEqualTo(type);
        assertThat((String) JsonPath.read(response.getBody(), "$.stockMovement.productId")).isEqualTo(id.toString());
        assertThat((String) JsonPath.read(response.getBody(), "$.stockMovement.storeId"))
                .isEqualTo(owner.storeId().toString());
        assertThat((String) JsonPath.read(response.getBody(), "$.stockMovement.description"))
                .isEqualTo("Received PO#1234");
        assertDecimal(response.getBody(), "$.stockMovement.quantity", "2.5");
        assertDecimal(response.getBody(), "$.stockMovement.quantityBefore", "10");
        assertDecimal(response.getBody(), "$.stockMovement.quantityAfter", "12.5");
        assertDecimal(response.getBody(), "$.product.stockQuantity", "12.5");
        assertProductShape(JsonPath.read(response.getBody(), "$.product"));
        assertThat(productRepository.findById(id).orElseThrow().getStockQuantity()).isEqualByComparingTo("12.5");
    }

    @Test
    void shouldDecreaseStockForAdjustmentOutIncludingDownToZero() {
        final StoreOwner owner = createStore();
        final UUID id = createProductWithStock(owner.token(), seedUnit(true).getId(), "10");

        final ResponseEntity<String> first = postJson(stockUrl(id),
                stockMovementJson("ADJUSTMENT_OUT", "4", "Damaged goods"), owner.token());
        final ResponseEntity<String> second = postJson(stockUrl(id),
                stockMovementJson("ADJUSTMENT_OUT", "6", "Stocktake"), owner.token());

        assertThat(first.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        assertDecimal(first.getBody(), "$.stockMovement.quantityBefore", "10");
        assertDecimal(first.getBody(), "$.stockMovement.quantityAfter", "6");
        assertThat(second.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        assertDecimal(second.getBody(), "$.product.stockQuantity", "0");
    }

    @Test
    void shouldChainMovementsAndPersistEachOne() {
        final StoreOwner owner = createStore();
        final UUID id = createProduct(owner.token(), seedUnit(true).getId());

        postJson(stockUrl(id), stockMovementJson("STOCK_IN", "100", "a"), owner.token());
        postJson(stockUrl(id), stockMovementJson("ADJUSTMENT_OUT", "30.25", "b"), owner.token());
        postJson(stockUrl(id), stockMovementJson("ADJUSTMENT_IN", "0.25", "c"), owner.token());

        final List<StockMovement> movements = stockMovementRepository.findAll();
        assertThat(movements).hasSize(3);
        assertThat(movements).extracting(StockMovement::getType).containsExactlyInAnyOrder(
                StockMovementType.STOCK_IN, StockMovementType.ADJUSTMENT_OUT, StockMovementType.ADJUSTMENT_IN);
        assertThat(productRepository.findById(id).orElseThrow().getStockQuantity()).isEqualByComparingTo("70");
    }

    @Test
    void shouldAllowFractionsOnlyForUnitsThatAllowThem() {
        final StoreOwner owner = createStore();
        final UUID kg = createProduct(owner.token(), seedUnit(true).getId());
        final UUID piece = createProduct(owner.token(), seedUnit(false).getId());

        assertThat(postJson(stockUrl(kg), stockMovementJson("STOCK_IN", "1.5", "x"), owner.token()).getStatusCode())
                .isEqualTo(HttpStatus.CREATED);
        assertErrorResponse(postJson(stockUrl(piece), stockMovementJson("STOCK_IN", "1.5", "x"), owner.token()),
                HttpStatus.BAD_REQUEST);
        assertThat(postJson(stockUrl(piece), stockMovementJson("STOCK_IN", "2.00", "x"), owner.token())
                .getStatusCode()).isEqualTo(HttpStatus.CREATED);
        assertThat(productRepository.findById(piece).orElseThrow().getStockQuantity()).isEqualByComparingTo("2");
    }

    @Test
    void shouldRejectAdjustmentOutBeyondAvailableStock() {
        final StoreOwner owner = createStore();
        final UUID id = createProductWithStock(owner.token(), seedUnit(true).getId(), "3");

        final ResponseEntity<String> response = postJson(stockUrl(id),
                stockMovementJson("ADJUSTMENT_OUT", "3.01", "oops"), owner.token());

        assertErrorMessage(response, HttpStatus.CONFLICT, "Insufficient stock: available 3.00, requested 3.01");
        assertThat(productRepository.findById(id).orElseThrow().getStockQuantity()).isEqualByComparingTo("3");
        assertThat(stockMovementRepository.count()).isEqualTo(1);
    }

    @Test
    void shouldNotOversellUnderConcurrentAdjustmentOut() {
        final StoreOwner owner = createStore();
        final UUID id = createProductWithStock(owner.token(), seedUnit(true).getId(), "10");

        final List<HttpStatus> statuses = java.util.stream.IntStream.range(0, 4)
                .mapToObj(i -> CompletableFuture.supplyAsync(() -> (HttpStatus) postJson(stockUrl(id),
                        stockMovementJson("ADJUSTMENT_OUT", "4", "race"), owner.token()).getStatusCode()))
                .toList().stream().map(CompletableFuture::join).toList();

        assertThat(statuses).filteredOn(s -> s == HttpStatus.CREATED).hasSize(2);
        assertThat(statuses).filteredOn(s -> s == HttpStatus.CONFLICT).hasSize(2);
        assertThat(productRepository.findById(id).orElseThrow().getStockQuantity()).isEqualByComparingTo("2");
    }

    @Test
    void shouldRejectSaleTypeAndUnknownTypes() {
        final StoreOwner owner = createStore();
        final UUID id = createProductWithStock(owner.token(), seedUnit(true).getId(), "5");

        assertErrorResponse(postJson(stockUrl(id), stockMovementJson("SALE", "1", "x"), owner.token()),
                HttpStatus.BAD_REQUEST);
        assertErrorResponse(postJson(stockUrl(id), stockMovementJson("REFUND", "1", "x"), owner.token()),
                HttpStatus.BAD_REQUEST);
        assertErrorResponse(postJson(stockUrl(id), stockMovementJson("stock_in", "1", "x"), owner.token()),
                HttpStatus.BAD_REQUEST);
        assertThat(productRepository.findById(id).orElseThrow().getStockQuantity()).isEqualByComparingTo("5");
    }

    @ParameterizedTest
    @ValueSource(strings = {"0", "0.00", "-1", "1.005", "\"abc\"", "null", "{}", "12345678901234567"})
    void shouldRejectInvalidQuantity(final String quantity) {
        final StoreOwner owner = createStore();
        final UUID id = createProductWithStock(owner.token(), seedUnit(true).getId(), "5");

        assertErrorResponse(postJson(stockUrl(id), stockMovementJson("STOCK_IN", quantity, "x"), owner.token()),
                HttpStatus.BAD_REQUEST);
    }

    @Test
    void shouldRejectStockIncreaseThatOverflowsTheColumn() {
        final StoreOwner owner = createStore();
        final UUID id = createProduct(owner.token(), seedUnit(true).getId());
        postJson(stockUrl(id), stockMovementJson("STOCK_IN", "9999999999999999.99", "max"), owner.token());

        assertErrorResponse(postJson(stockUrl(id), stockMovementJson("STOCK_IN", "0.01", "overflow"),
                owner.token()), HttpStatus.BAD_REQUEST);
    }

    @Test
    void shouldRejectMissingOrBlankDescriptionAndMissingFields() {
        final StoreOwner owner = createStore();
        final UUID id = createProduct(owner.token(), seedUnit(true).getId());

        assertErrorResponse(postJson(stockUrl(id), "{\"type\": \"STOCK_IN\", \"quantity\": 1}", owner.token()),
                HttpStatus.BAD_REQUEST);
        assertErrorResponse(postJson(stockUrl(id), stockMovementJson("STOCK_IN", "1", ""), owner.token()),
                HttpStatus.BAD_REQUEST);
        assertErrorResponse(postJson(stockUrl(id), stockMovementJson("STOCK_IN", "1", "   "), owner.token()),
                HttpStatus.BAD_REQUEST);
        assertErrorResponse(postJson(stockUrl(id), "{\"quantity\": 1, \"description\": \"x\"}", owner.token()),
                HttpStatus.BAD_REQUEST);
        assertErrorResponse(postJson(stockUrl(id), "{\"type\": \"STOCK_IN\", \"description\": \"x\"}",
                owner.token()), HttpStatus.BAD_REQUEST);
        assertErrorResponse(postJson(stockUrl(id), "{}", owner.token()), HttpStatus.BAD_REQUEST);
        assertErrorResponse(postJson(stockUrl(id), "garbage", owner.token()), HttpStatus.BAD_REQUEST);
        assertErrorResponse(postJson(stockUrl(id), stockMovementJson("STOCK_IN", "1", "x".repeat(1001)),
                owner.token()), HttpStatus.BAD_REQUEST);
        assertThat(stockMovementRepository.count()).isZero();
    }

    @Test
    void shouldRejectUnknownBodyProperties() {
        final StoreOwner owner = createStore();
        final UUID id = createProduct(owner.token(), seedUnit(true).getId());

        assertErrorResponse(postJson(stockUrl(id),
                "{\"type\": \"STOCK_IN\", \"quantity\": 1, \"description\": \"x\", \"quantityAfter\": 99}",
                owner.token()), HttpStatus.BAD_REQUEST);
    }

    @Test
    void shouldReturnNotFoundForUnknownOrForeignProduct() {
        final StoreOwner owner = createStore();
        final StoreOwner intruder = createStore();
        final UUID id = createProduct(owner.token(), seedUnit(true).getId());

        assertErrorMessage(postJson(stockUrl(UUID.randomUUID()), stockMovementJson("STOCK_IN", "1", "x"),
                owner.token()), HttpStatus.NOT_FOUND, "Product not found");
        assertErrorMessage(postJson(stockUrl(id), stockMovementJson("STOCK_IN", "1", "x"), intruder.token()),
                HttpStatus.NOT_FOUND, "Product not found");
        assertThat(stockMovementRepository.count()).isZero();
    }

    @Test
    void shouldRejectUnauthenticatedMalformedIdAndStorelessUser() {
        final StoreOwner owner = createStore();
        final String storeless = signupAndGetToken("No Store", "nostore2@example.com", "Passw0rd123");
        final String body = stockMovementJson("STOCK_IN", "1", "x");

        assertThat(postJson(stockUrl(UUID.randomUUID()), body).getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertErrorResponse(postJson(PRODUCTS_URL + "/abc/stock-movements", body, owner.token()),
                HttpStatus.BAD_REQUEST);
        assertErrorMessage(postJson(stockUrl(UUID.randomUUID()), body, storeless), HttpStatus.NOT_FOUND,
                "You don't have a store yet");
    }

    @Test
    void shouldStillAllowStockMovementsOnInactiveProduct() {
        final StoreOwner owner = createStore();
        final UUID id = createProduct(owner.token(), seedUnit(true).getId());
        patchJson(PRODUCTS_URL + "/" + id, "{\"status\": \"INACTIVE\"}", owner.token());

        assertThat(postJson(stockUrl(id), stockMovementJson("STOCK_IN", "1", "x"), owner.token()).getStatusCode())
                .isEqualTo(HttpStatus.CREATED);
    }

}
