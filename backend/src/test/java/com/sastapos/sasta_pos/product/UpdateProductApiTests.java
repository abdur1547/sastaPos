package com.sastapos.sasta_pos.product;

import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.JsonPath;
import com.sastapos.sasta_pos.product.support.ProductApiTestBase;
import com.sastapos.sasta_pos.tax_category.TaxCategory;
import com.sastapos.sasta_pos.units_of_measure.UnitsOfMeasure;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;


/** Use case 4a — update product (PATCH). */
class UpdateProductApiTests extends ProductApiTestBase {

    private ResponseEntity<String> patch(final StoreOwner owner, final UUID id, final String body) {
        return patchJson(PRODUCTS_URL + "/" + id, body, owner.token());
    }

    @Test
    void shouldUpdateAllEditableFields() {
        final StoreOwner owner = createStore();
        final UnitsOfMeasure oldUnit = seedUnit(true);
        final UnitsOfMeasure newUnit = seedUnit(true);
        final TaxCategory tax = seedTaxCategory(10.0);
        final UUID id = createProduct(owner.token(), productJson("Old", "old-sku", "old-bc", "old-pct",
                "1.00", "7", oldUnit.getId(), null));

        final ResponseEntity<String> response = patch(owner, id, """
                {"name": " New ", "sku": "new-sku", "barCode": "new-bc", "pctCode": "new-pct",
                 "description": "desc", "unitPrice": 25.25, "unitOfMeasureId": "%s",
                 "taxCategoryIds": ["%s"], "status": "INACTIVE"}""".formatted(newUnit.getId(), tax.getId()));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertProductShape(JsonPath.read(response.getBody(), "$"));
        assertThat((String) JsonPath.read(response.getBody(), "$.name")).isEqualTo("New");
        assertThat((String) JsonPath.read(response.getBody(), "$.sku")).isEqualTo("new-sku");
        assertThat((String) JsonPath.read(response.getBody(), "$.barCode")).isEqualTo("new-bc");
        assertThat((String) JsonPath.read(response.getBody(), "$.pctCode")).isEqualTo("new-pct");
        assertThat((String) JsonPath.read(response.getBody(), "$.description")).isEqualTo("desc");
        assertThat((String) JsonPath.read(response.getBody(), "$.status")).isEqualTo("INACTIVE");
        assertThat((String) JsonPath.read(response.getBody(), "$.unitOfMeasureId")).isEqualTo(newUnit.getId().toString());
        assertThat((List<String>) JsonPath.read(response.getBody(), "$.taxCategoryIds"))
                .containsExactly(tax.getId().toString());
        assertDecimal(response.getBody(), "$.unitPrice", "25.25");
        assertDecimal(response.getBody(), "$.stockQuantity", "7");
    }

    @Test
    void shouldLeaveUntouchedFieldsUnchangedOnPartialUpdate() {
        final StoreOwner owner = createStore();
        final UnitsOfMeasure unit = seedUnit(true);
        final UUID id = createProduct(owner.token(), productJson("Keep", "keep-sku", null, "keep-pct",
                "3.00", "4", unit.getId(), null));

        final ResponseEntity<String> response = patch(owner, id, "{\"unitPrice\": 4}");

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat((String) JsonPath.read(response.getBody(), "$.name")).isEqualTo("Keep");
        assertThat((String) JsonPath.read(response.getBody(), "$.sku")).isEqualTo("keep-sku");
        assertThat((String) JsonPath.read(response.getBody(), "$.status")).isEqualTo("ACTIVE");
        assertDecimal(response.getBody(), "$.unitPrice", "4");
    }

    @Test
    void shouldTreatEmptyBodyAsNoOp() {
        final StoreOwner owner = createStore();
        final UUID id = createProduct(owner.token(), seedUnit(true).getId());

        final ResponseEntity<String> response = patch(owner, id, "{}");

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    @Test
    void shouldReplaceAndClearTaxCategories() {
        final StoreOwner owner = createStore();
        final UnitsOfMeasure unit = seedUnit(true);
        final TaxCategory a = seedTaxCategory(1.0);
        final TaxCategory b = seedTaxCategory(2.0);
        final UUID id = createProduct(owner.token(), productJson("n", null, null, uniquePct(), "1", null,
                unit.getId(), "[\"%s\"]".formatted(a.getId())));

        final ResponseEntity<String> replaced = patch(owner, id, "{\"taxCategoryIds\": [\"%s\"]}".formatted(b.getId()));
        assertThat((List<String>) JsonPath.read(replaced.getBody(), "$.taxCategoryIds"))
                .containsExactly(b.getId().toString());

        final ResponseEntity<String> cleared = patch(owner, id, "{\"taxCategoryIds\": []}");
        assertThat((List<String>) JsonPath.read(cleared.getBody(), "$.taxCategoryIds")).isEmpty();
    }

    @Test
    void shouldDeactivateAndReactivateProduct() {
        final StoreOwner owner = createStore();
        final UUID id = createProduct(owner.token(), seedUnit(true).getId());

        assertThat((String) JsonPath.read(patch(owner, id, "{\"status\": \"INACTIVE\"}").getBody(), "$.status"))
                .isEqualTo("INACTIVE");
        assertThat((String) JsonPath.read(patch(owner, id, "{\"status\": \"ACTIVE\"}").getBody(), "$.status"))
                .isEqualTo("ACTIVE");
    }

    @Test
    void shouldAllowResendingOwnUniqueValues() {
        final StoreOwner owner = createStore();
        final UUID id = createProduct(owner.token(), productJson("n", "my-sku", "my-bc", "my-pct", "1", null,
                seedUnit(true).getId(), null));

        final ResponseEntity<String> response = patch(owner, id,
                "{\"sku\": \"MY-SKU\", \"barCode\": \"my-bc\", \"pctCode\": \"my-pct\"}");

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    @Test
    void shouldAllowFractionalUnitChangeKeepingFractionalStockOnlyIfUnitAllowsIt() {
        final StoreOwner owner = createStore();
        final UnitsOfMeasure kg = seedUnit(true);
        final UnitsOfMeasure piece = seedUnit(false);
        final UUID fractional = createProductWithStock(owner.token(), kg.getId(), "2.5");
        final UUID whole = createProductWithStock(owner.token(), kg.getId(), "3");

        assertErrorResponse(patch(owner, fractional, "{\"unitOfMeasureId\": \"%s\"}".formatted(piece.getId())),
                HttpStatus.BAD_REQUEST);
        assertThat(patch(owner, whole, "{\"unitOfMeasureId\": \"%s\"}".formatted(piece.getId())).getStatusCode())
                .isEqualTo(HttpStatus.OK);
        assertThat(productRepository.findById(fractional).orElseThrow().getUnitsOfMeasure().getId())
                .isEqualTo(kg.getId());
    }

    // ---------- failure paths ----------

    @Test
    void shouldRejectUnauthenticatedRequest() {
        final ResponseEntity<String> response = patchJson(PRODUCTS_URL + "/" + UUID.randomUUID(), "{}", null);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void shouldReturnNotFoundForUnknownProduct() {
        final StoreOwner owner = createStore();

        assertErrorMessage(patch(owner, UUID.randomUUID(), "{}"), HttpStatus.NOT_FOUND, "Product not found");
    }

    @Test
    void shouldReturnNotFoundForProductOfAnotherStore() {
        final StoreOwner owner = createStore();
        final StoreOwner intruder = createStore();
        final UUID id = createProduct(owner.token(), seedUnit(true).getId());

        assertErrorMessage(patch(intruder, id, "{\"name\": \"hacked\"}"), HttpStatus.NOT_FOUND, "Product not found");
        assertThat(productRepository.findById(id).orElseThrow().getName()).isNotEqualTo("hacked");
    }

    @Test
    void shouldRejectMalformedProductId() {
        final StoreOwner owner = createStore();

        assertErrorResponse(patchJson(PRODUCTS_URL + "/not-a-uuid", "{}", owner.token()), HttpStatus.BAD_REQUEST);
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "{\"name\": \"\"}", "{\"name\": \"   \"}", "{\"sku\": \" \"}", "{\"barCode\": \"\"}",
            "{\"pctCode\": \"\"}", "{\"name\": 123456}x", "{\"unitPrice\": -1}", "{\"unitPrice\": 1.999}",
            "{\"unitPrice\": \"abc\"}", "{\"status\": \"DELETED\"}", "{\"status\": \"IN_ACTIVE\"}",
            "{\"status\": 1}", "{\"unitOfMeasureId\": \"nope\"}", "{\"taxCategoryIds\": [null]}",
            "{\"taxCategoryIds\": \"abc\"}", "{\"description\": 12}x", "not json", "[]"})
    void shouldRejectInvalidBodies(final String body) {
        final StoreOwner owner = createStore();
        final UUID id = createProduct(owner.token(), seedUnit(true).getId());

        assertErrorResponse(patch(owner, id, body), HttpStatus.BAD_REQUEST);
    }

    @Test
    void shouldRejectTooLongFields() {
        final StoreOwner owner = createStore();
        final UUID id = createProduct(owner.token(), seedUnit(true).getId());

        assertErrorResponse(patch(owner, id, "{\"name\": \"%s\"}".formatted("x".repeat(256))), HttpStatus.BAD_REQUEST);
        assertErrorResponse(patch(owner, id, "{\"description\": \"%s\"}".formatted("x".repeat(5001))),
                HttpStatus.BAD_REQUEST);
    }

    @Test
    void shouldNeverAllowStockQuantityOrOtherFieldsToBeEdited() {
        final StoreOwner owner = createStore();
        final UUID id = createProductWithStock(owner.token(), seedUnit(true).getId(), "10");

        assertErrorResponse(patch(owner, id, "{\"stockQuantity\": 999}"), HttpStatus.BAD_REQUEST);
        assertErrorResponse(patch(owner, id, "{\"storeId\": \"%s\"}".formatted(UUID.randomUUID())),
                HttpStatus.BAD_REQUEST);
        assertErrorResponse(patch(owner, id, "{\"id\": \"%s\"}".formatted(UUID.randomUUID())),
                HttpStatus.BAD_REQUEST);
        assertThat(productRepository.findById(id).orElseThrow().getStockQuantity()).isEqualByComparingTo("10");
    }

    @Test
    void shouldReturnNotFoundForUnknownInactiveOrForeignReferences() {
        final StoreOwner owner = createStore();
        final StoreOwner other = createStore();
        final UUID id = createProduct(owner.token(), seedUnit(true).getId());

        assertErrorMessage(patch(owner, id, "{\"unitOfMeasureId\": \"%s\"}".formatted(UUID.randomUUID())),
                HttpStatus.NOT_FOUND, "Unit of measure not found");
        assertErrorMessage(patch(owner, id, "{\"unitOfMeasureId\": \"%s\"}".formatted(seedInactiveUnit().getId())),
                HttpStatus.BAD_REQUEST, "Unit of measure is not active");
        for (final UUID bad : List.of(UUID.randomUUID(), seedTaxCategory(1, false, null).getId(),
                seedTaxCategory(1, true, other.storeId()).getId())) {
            assertErrorMessage(patch(owner, id, "{\"taxCategoryIds\": [\"%s\"]}".formatted(bad)),
                    HttpStatus.NOT_FOUND, "Tax category not found");
        }
    }

    @Test
    void shouldRejectDuplicateSkuBarCodeAndPctCode() {
        final StoreOwner owner = createStore();
        final UnitsOfMeasure unit = seedUnit(true);
        createProduct(owner.token(), productJson("a", "sku-a", "bc-a", "pct-a", "1", null, unit.getId(), null));
        final UUID b = createProduct(owner.token(), productJson("b", "sku-b", "bc-b", "pct-b", "1", null,
                unit.getId(), null));

        assertErrorMessage(patch(owner, b, "{\"sku\": \"SKU-A\"}"), HttpStatus.CONFLICT,
                "A product with this sku already exists");
        assertErrorMessage(patch(owner, b, "{\"barCode\": \"bc-a\"}"), HttpStatus.CONFLICT,
                "A product with this barCode already exists");
        assertErrorMessage(patch(owner, b, "{\"pctCode\": \"Pct-A\"}"), HttpStatus.CONFLICT,
                "A product with this pctCode already exists");
        assertThat(productRepository.findById(b).orElseThrow().getSku()).isEqualTo("sku-b");
    }

    @Test
    void shouldAllowSameSkuAsAProductInAnotherStore() {
        final StoreOwner owner = createStore();
        final StoreOwner other = createStore();
        final UnitsOfMeasure unit = seedUnit(true);
        createProduct(other.token(), productJson("a", "shared", null, "pct-x", "1", null, unit.getId(), null));
        final UUID mine = createProduct(owner.token(), unit.getId());

        assertThat(patch(owner, mine, "{\"sku\": \"shared\"}").getStatusCode()).isEqualTo(HttpStatus.OK);
    }

}
