package com.sastapos.sasta_pos.product;

import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.JsonPath;
import com.sastapos.sasta_pos.auth.support.TestDataFactory;
import com.sastapos.sasta_pos.product.support.ProductApiTestBase;
import com.sastapos.sasta_pos.stock_movement.StockMovement;
import com.sastapos.sasta_pos.stock_movement.StockMovementType;
import com.sastapos.sasta_pos.store.RowStatus;
import com.sastapos.sasta_pos.tax_category.TaxCategory;
import com.sastapos.sasta_pos.units_of_measure.UnitsOfMeasure;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;


/** Use case 4 — add product. */
class CreateProductApiTests extends ProductApiTestBase {

    // ---------- happy paths ----------

    @Test
    void shouldCreateProductWithOnlyRequiredFieldsAndApplyDefaults() {
        final StoreOwner owner = createStore();
        final UnitsOfMeasure unit = seedUnit(true);
        final String name = productName();
        final String pct = uniquePct();

        final ResponseEntity<String> response = postJson(PRODUCTS_URL, """
                {"name": "%s", "pctCode": "%s", "unitPrice": 10.5, "unitOfMeasureId": "%s"}"""
                .formatted(name, pct, unit.getId()), owner.token());

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        final Map<String, Object> product = JsonPath.read(response.getBody(), "$");
        assertProductShape(product);
        assertThat(product)
                .containsEntry("name", name)
                .containsEntry("pctCode", pct)
                .containsEntry("sku", null)
                .containsEntry("barCode", null)
                .containsEntry("description", null)
                .containsEntry("status", "ACTIVE")
                .containsEntry("unitOfMeasureId", unit.getId().toString())
                .containsEntry("storeId", owner.storeId().toString());
        assertThat((List<?>) product.get("taxCategoryIds")).isEmpty();
        assertDecimal(response.getBody(), "$.unitPrice", "10.50");
        assertDecimal(response.getBody(), "$.stockQuantity", "0");
        assertThat((String) product.get("createdAt")).isNotBlank();
        assertThat(stockMovementRepository.count()).isZero();
    }

    @Test
    void shouldCreateProductWithAllFieldsAndRecordInitialStockMovement() {
        final StoreOwner owner = createStore();
        final UnitsOfMeasure unit = seedUnit(true);
        final TaxCategory gst = seedTaxCategory(18.0);
        final TaxCategory fed = seedTaxCategory(5.0, true, owner.storeId());
        final String sku = uniqueSku();

        final ResponseEntity<String> response = postJson(PRODUCTS_URL, """
                {"name": "  Padded Name  ", "sku": "%s", "barCode": "8901234567890",
                 "pctCode": "  2106.9090 ", "description": "Cold drink", "unitPrice": 99.99,
                 "stockQuantity": 12.5, "unitOfMeasureId": "%s",
                 "taxCategoryIds": ["%s", "%s", "%s"]}"""
                .formatted(sku, unit.getId(), gst.getId(), fed.getId(), gst.getId()), owner.token());

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        final Map<String, Object> product = JsonPath.read(response.getBody(), "$");
        assertThat(product)
                .containsEntry("name", "Padded Name")
                .containsEntry("sku", sku)
                .containsEntry("barCode", "8901234567890")
                .containsEntry("pctCode", "2106.9090")
                .containsEntry("description", "Cold drink");
        assertDecimal(response.getBody(), "$.unitPrice", "99.99");
        assertDecimal(response.getBody(), "$.stockQuantity", "12.5");
        assertThat((List<String>) product.get("taxCategoryIds"))
                .containsExactlyInAnyOrder(gst.getId().toString(), fed.getId().toString());

        final List<StockMovement> movements = stockMovementRepository.findAll();
        assertThat(movements).hasSize(1);
        final StockMovement movement = movements.get(0);
        assertThat(movement.getType()).isEqualTo(StockMovementType.ADJUSTMENT_IN);
        assertThat(movement.getQuantity()).isEqualByComparingTo("12.5");
        assertThat(movement.getQuantityBefore()).isEqualByComparingTo("0");
        assertThat(movement.getQuantityAfter()).isEqualByComparingTo("12.5");
        assertThat(movement.getDescription()).isNotBlank();
        assertThat(movement.getStore().getId()).isEqualTo(owner.storeId());
        assertThat(productRepository.count()).isEqualTo(1);
    }

    @Test
    void shouldNotRecordStockMovementWhenStockQuantityIsZero() {
        final StoreOwner owner = createStore();
        final UnitsOfMeasure unit = seedUnit(true);

        createProduct(owner.token(), productJson(productName(), null, null, uniquePct(), "1.00", "0",
                unit.getId(), null));

        assertThat(stockMovementRepository.count()).isZero();
    }

    @Test
    void shouldAllowWholeStockForUnitThatDoesNotAllowFractions() {
        final StoreOwner owner = createStore();
        final UnitsOfMeasure piece = seedUnit(false);

        final UUID id = createProductWithStock(owner.token(), piece.getId(), "5.00");

        assertThat(productRepository.findById(id)).isPresent();
    }

    @Test
    void shouldAllowTheSameNameTwiceAndSameSkuInDifferentStores() {
        final StoreOwner first = createStore();
        final StoreOwner second = createStore();
        final UnitsOfMeasure unit = seedUnit(true);
        final String sku = uniqueSku();
        final String pct = uniquePct();
        final String barCode = "BC-" + UUID.randomUUID();

        createProduct(first.token(), productJson("Same Name", sku, barCode, pct, "1", null, unit.getId(), null));
        createProduct(first.token(), productJson("Same Name", null, null, uniquePct(), "1", null, unit.getId(), null));
        createProduct(second.token(), productJson("Same Name", sku, barCode, pct, "1", null, unit.getId(), null));

        assertThat(productRepository.count()).isEqualTo(3);
    }

    @Test
    void shouldAllowCashierWithStoreToCreateProduct() {
        final StoreOwner owner = createStore();
        final String cashierToken = signupCashierAttachedToStore(owner.storeId());
        final UnitsOfMeasure unit = seedUnit(true);

        final ResponseEntity<String> response = postJson(PRODUCTS_URL, productJson(unit.getId()), cashierToken);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        assertThat((String) JsonPath.read(response.getBody(), "$.storeId")).isEqualTo(owner.storeId().toString());
    }

    // ---------- auth / store ----------

    @Test
    void shouldRejectUnauthenticatedRequest() {
        final ResponseEntity<String> response = postJson(PRODUCTS_URL, productJson(seedUnit(true).getId()));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void shouldReturnNotFoundWhenUserHasNoStore() {
        final String token = signupAndGetToken(TestDataFactory.personName(), TestDataFactory.uniqueEmail(),
                TestDataFactory.validPassword());

        final ResponseEntity<String> response = postJson(PRODUCTS_URL, productJson(seedUnit(true).getId()), token);

        assertErrorMessage(response, HttpStatus.NOT_FOUND, "You don't have a store yet");
    }

    // ---------- body validation ----------

    @Test
    void shouldRejectMissingRequiredFields() {
        final StoreOwner owner = createStore();
        final UnitsOfMeasure unit = seedUnit(true);

        assertBadRequest(owner, """
                {"pctCode": "p1", "unitPrice": 1, "unitOfMeasureId": "%s"}""".formatted(unit.getId()));
        assertBadRequest(owner, """
                {"name": "n", "unitPrice": 1, "unitOfMeasureId": "%s"}""".formatted(unit.getId()));
        assertBadRequest(owner, """
                {"name": "n", "pctCode": "p1", "unitOfMeasureId": "%s"}""".formatted(unit.getId()));
        assertBadRequest(owner, """
                {"name": "n", "pctCode": "p1", "unitPrice": 1}""");
        assertBadRequest(owner, "{}");
        assertThat(productRepository.count()).isZero();
    }

    @ParameterizedTest
    @ValueSource(strings = {"\"\"", "\"   \"", "null"})
    void shouldRejectBlankOrNullNameAndPctCode(final String value) {
        final StoreOwner owner = createStore();
        final UnitsOfMeasure unit = seedUnit(true);

        assertBadRequest(owner, """
                {"name": %s, "pctCode": "p", "unitPrice": 1, "unitOfMeasureId": "%s"}"""
                .formatted(value, unit.getId()));
        assertBadRequest(owner, """
                {"name": "n", "pctCode": %s, "unitPrice": 1, "unitOfMeasureId": "%s"}"""
                .formatted(value, unit.getId()));
    }

    @ParameterizedTest
    @ValueSource(strings = {"\"\"", "\"  \""})
    void shouldRejectBlankSkuAndBarCodeWhenProvided(final String value) {
        final StoreOwner owner = createStore();
        final UnitsOfMeasure unit = seedUnit(true);

        assertBadRequest(owner, """
                {"name": "n", "sku": %s, "pctCode": "p", "unitPrice": 1, "unitOfMeasureId": "%s"}"""
                .formatted(value, unit.getId()));
        assertBadRequest(owner, """
                {"name": "n", "barCode": %s, "pctCode": "p", "unitPrice": 1, "unitOfMeasureId": "%s"}"""
                .formatted(value, unit.getId()));
    }

    @Test
    void shouldRejectTooLongTextFields() {
        final StoreOwner owner = createStore();
        final UnitsOfMeasure unit = seedUnit(true);
        final String tooLong = "x".repeat(256);

        assertBadRequest(owner, productJson(tooLong, null, null, "p", "1", null, unit.getId(), null));
        assertBadRequest(owner, productJson("n", tooLong, null, "p", "1", null, unit.getId(), null));
        assertBadRequest(owner, productJson("n", null, tooLong, "p", "1", null, unit.getId(), null));
        assertBadRequest(owner, productJson("n", null, null, tooLong, "1", null, unit.getId(), null));
        assertBadRequest(owner, """
                {"name": "n", "pctCode": "p", "unitPrice": 1, "unitOfMeasureId": "%s",
                 "description": "%s"}""".formatted(unit.getId(), "d".repeat(5001)));
    }

    @ParameterizedTest
    @ValueSource(strings = {"-0.01", "-5", "1.234", "12345678901234567.00", "\"abc\"", "null", "[]"})
    void shouldRejectInvalidUnitPrice(final String price) {
        final StoreOwner owner = createStore();
        final UnitsOfMeasure unit = seedUnit(true);

        assertBadRequest(owner, productJson("n", null, null, "p", price, null, unit.getId(), null));
    }

    @ParameterizedTest
    @ValueSource(strings = {"-1", "-0.01", "1.005", "\"abc\"", "{}"})
    void shouldRejectInvalidStockQuantity(final String stock) {
        final StoreOwner owner = createStore();
        final UnitsOfMeasure unit = seedUnit(true);

        assertBadRequest(owner, productJson("n", null, null, "p", "1", stock, unit.getId(), null));
    }

    @Test
    void shouldAcceptZeroPrice() {
        final StoreOwner owner = createStore();
        final UnitsOfMeasure unit = seedUnit(true);

        createProduct(owner.token(), productJson("free", null, null, "p", "0", null, unit.getId(), null));
    }

    @Test
    void shouldRejectMalformedIdentifiers() {
        final StoreOwner owner = createStore();
        final UnitsOfMeasure unit = seedUnit(true);

        assertBadRequest(owner, """
                {"name": "n", "pctCode": "p", "unitPrice": 1, "unitOfMeasureId": "not-a-uuid"}""");
        assertBadRequest(owner, productJson("n", null, null, "p", "1", null, unit.getId(), "[\"not-a-uuid\"]"));
        assertBadRequest(owner, productJson("n", null, null, "p", "1", null, unit.getId(), "[null]"));
        assertBadRequest(owner, productJson("n", null, null, "p", "1", null, unit.getId(), "\"abc\""));
    }

    @Test
    void shouldRejectTooManyTaxCategories() {
        final StoreOwner owner = createStore();
        final UnitsOfMeasure unit = seedUnit(true);
        final String ids = java.util.stream.IntStream.range(0, 51)
                .mapToObj(i -> "\"" + UUID.randomUUID() + "\"")
                .collect(java.util.stream.Collectors.joining(",", "[", "]"));

        assertBadRequest(owner, productJson("n", null, null, "p", "1", null, unit.getId(), ids));
    }

    @Test
    void shouldRejectUnknownProperties() {
        final StoreOwner owner = createStore();
        final UnitsOfMeasure unit = seedUnit(true);

        assertBadRequest(owner, """
                {"name": "n", "pctCode": "p", "unitPrice": 1, "unitOfMeasureId": "%s",
                 "status": "INACTIVE"}""".formatted(unit.getId()));
        assertBadRequest(owner, """
                {"name": "n", "pctCode": "p", "unitPrice": 1, "unitOfMeasureId": "%s",
                 "storeId": "%s"}""".formatted(unit.getId(), UUID.randomUUID()));
    }

    @Test
    void shouldRejectMalformedJsonAndEmptyBody() {
        final StoreOwner owner = createStore();

        assertBadRequest(owner, "{not json");
        assertBadRequest(owner, "");
        assertBadRequest(owner, "[]");
    }

    // ---------- business rules ----------

    @Test
    void shouldReturnNotFoundForUnknownUnitOfMeasure() {
        final StoreOwner owner = createStore();

        final ResponseEntity<String> response = postJson(PRODUCTS_URL, productJson(UUID.randomUUID()), owner.token());

        assertErrorMessage(response, HttpStatus.NOT_FOUND, "Unit of measure not found");
    }

    @Test
    void shouldRejectInactiveUnitOfMeasure() {
        final StoreOwner owner = createStore();

        final ResponseEntity<String> response = postJson(PRODUCTS_URL,
                productJson(seedInactiveUnit().getId()), owner.token());

        assertErrorMessage(response, HttpStatus.BAD_REQUEST, "Unit of measure is not active");
    }

    @Test
    void shouldRejectFractionalStockForUnitThatDoesNotAllowFractions() {
        final StoreOwner owner = createStore();
        final UnitsOfMeasure piece = seedUnit(false);

        final ResponseEntity<String> response = postJson(PRODUCTS_URL,
                productJson("n", null, null, "p", "1", "2.5", piece.getId(), null), owner.token());

        assertErrorResponse(response, HttpStatus.BAD_REQUEST);
        assertThat(productRepository.count()).isZero();
    }

    @Test
    void shouldReturnNotFoundForUnknownInactiveOrForeignTaxCategory() {
        final StoreOwner owner = createStore();
        final StoreOwner other = createStore();
        final UnitsOfMeasure unit = seedUnit(true);
        final TaxCategory inactive = seedTaxCategory(5.0, false, null);
        final TaxCategory foreign = seedTaxCategory(5.0, true, other.storeId());
        final TaxCategory valid = seedTaxCategory(5.0);

        for (final UUID bad : List.of(UUID.randomUUID(), inactive.getId(), foreign.getId())) {
            final ResponseEntity<String> response = postJson(PRODUCTS_URL, productJson("n", null, null,
                    uniquePct(), "1", null, unit.getId(), "[\"%s\", \"%s\"]".formatted(valid.getId(), bad)),
                    owner.token());
            assertErrorMessage(response, HttpStatus.NOT_FOUND, "Tax category not found");
        }
        assertThat(productRepository.count()).isZero();
    }

    @Test
    void shouldRejectDuplicateSkuBarCodeAndPctCodeWithinStoreIgnoringCase() {
        final StoreOwner owner = createStore();
        final UnitsOfMeasure unit = seedUnit(true);
        createProduct(owner.token(), productJson("a", "Sku-1", "Bar-1", "Pct-1", "1", null, unit.getId(), null));

        assertErrorMessage(postJson(PRODUCTS_URL,
                productJson("b", "SKU-1", null, "p2", "1", null, unit.getId(), null), owner.token()),
                HttpStatus.CONFLICT, "A product with this sku already exists");
        assertErrorMessage(postJson(PRODUCTS_URL,
                productJson("b", null, "BAR-1", "p3", "1", null, unit.getId(), null), owner.token()),
                HttpStatus.CONFLICT, "A product with this barCode already exists");
        assertErrorMessage(postJson(PRODUCTS_URL,
                productJson("b", null, null, "PCT-1", "1", null, unit.getId(), null), owner.token()),
                HttpStatus.CONFLICT, "A product with this pctCode already exists");
        assertThat(productRepository.count()).isEqualTo(1);
    }

    @Test
    void shouldNotPersistProductOrMovementWhenValidationFailsAfterPartialWork() {
        final StoreOwner owner = createStore();
        final UnitsOfMeasure unit = seedUnit(true);

        postJson(PRODUCTS_URL, productJson("n", null, null, "p", "1", "10", unit.getId(),
                "[\"%s\"]".formatted(UUID.randomUUID())), owner.token());

        assertThat(productRepository.count()).isZero();
        assertThat(stockMovementRepository.count()).isZero();
        assertThat(productRepository.findAll()).noneMatch(p -> p.getStatus() == RowStatus.INACTIVE);
    }

    private void assertBadRequest(final StoreOwner owner, final String body) {
        assertErrorResponse(postJson(PRODUCTS_URL, body, owner.token()), HttpStatus.BAD_REQUEST);
    }

}
