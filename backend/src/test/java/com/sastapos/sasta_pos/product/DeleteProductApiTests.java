package com.sastapos.sasta_pos.product;

import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.JsonPath;
import com.sastapos.sasta_pos.product.support.ProductApiTestBase;
import com.sastapos.sasta_pos.sale.SaleStatus;
import com.sastapos.sasta_pos.store.RowStatus;
import com.sastapos.sasta_pos.units_of_measure.UnitsOfMeasure;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;


/** Use case 4b — delete product: hard delete when never sold, otherwise soft delete. */
class DeleteProductApiTests extends ProductApiTestBase {

    @Test
    void shouldHardDeleteNeverSoldProductAndItsStockMovements() {
        final StoreOwner owner = createStore();
        final UnitsOfMeasure unit = seedUnit(true);
        final UUID id = createProductWithStock(owner.token(), unit.getId(), "10");
        postJson(stockUrl(id), stockMovementJson("STOCK_IN", "5", "restock"), owner.token());
        assertThat(stockMovementRepository.count()).isEqualTo(2);

        final ResponseEntity<String> response = deleteJson(PRODUCTS_URL + "/" + id, owner.token());

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        assertThat(response.getBody()).isNull();
        assertThat(productRepository.findById(id)).isEmpty();
        assertThat(stockMovementRepository.count()).isZero();
        assertThat(getJson(PRODUCTS_URL + "/" + id, owner.token()).getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    }

    @Test
    void shouldHardDeleteProductWithTaxCategories() {
        final StoreOwner owner = createStore();
        final UUID id = createProduct(owner.token(), productJson("n", null, null, uniquePct(), "1", null,
                seedUnit(true).getId(), "[\"%s\"]".formatted(seedTaxCategory(5).getId())));

        assertThat(deleteJson(PRODUCTS_URL + "/" + id, owner.token()).getStatusCode())
                .isEqualTo(HttpStatus.NO_CONTENT);
        assertThat(taxCategoryRepository.count()).isEqualTo(1);
    }

    @ParameterizedTest
    @EnumSource(SaleStatus.class)
    void shouldSoftDeleteProductWithSaleHistoryRegardlessOfSaleStatus(final SaleStatus status) {
        final StoreOwner owner = createStore();
        final UUID id = createProductWithStock(owner.token(), seedUnit(true).getId(), "10");
        recordSaleOf(owner.storeId(), id, status);

        final ResponseEntity<String> response = deleteJson(PRODUCTS_URL + "/" + id, owner.token());

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat((String) JsonPath.read(response.getBody(), "$.message")).isNotBlank();
        assertThat((String) JsonPath.read(response.getBody(), "$.product.status")).isEqualTo("INACTIVE");
        assertThat((String) JsonPath.read(response.getBody(), "$.product.id")).isEqualTo(id.toString());
        assertThat(productRepository.findById(id).orElseThrow().getStatus()).isEqualTo(RowStatus.INACTIVE);
        assertDecimal(response.getBody(), "$.product.stockQuantity", "10");
        assertThat(stockMovementRepository.count()).isEqualTo(1);
        assertThat(saleItemRepository.count()).isEqualTo(1);
    }

    @Test
    void shouldBeIdempotentForAlreadyDeactivatedSoldProduct() {
        final StoreOwner owner = createStore();
        final UUID id = createProduct(owner.token(), seedUnit(true).getId());
        recordSaleOf(owner.storeId(), id, SaleStatus.COMPLETED);

        assertThat(deleteJson(PRODUCTS_URL + "/" + id, owner.token()).getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(deleteJson(PRODUCTS_URL + "/" + id, owner.token()).getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    @Test
    void shouldReturnNotFoundWhenDeletingTwice() {
        final StoreOwner owner = createStore();
        final UUID id = createProduct(owner.token(), seedUnit(true).getId());
        deleteJson(PRODUCTS_URL + "/" + id, owner.token());

        assertErrorMessage(deleteJson(PRODUCTS_URL + "/" + id, owner.token()), HttpStatus.NOT_FOUND,
                "Product not found");
    }

    @Test
    void shouldReturnNotFoundForUnknownOrForeignProduct() {
        final StoreOwner owner = createStore();
        final StoreOwner intruder = createStore();
        final UUID id = createProduct(owner.token(), seedUnit(true).getId());

        assertErrorMessage(deleteJson(PRODUCTS_URL + "/" + UUID.randomUUID(), owner.token()),
                HttpStatus.NOT_FOUND, "Product not found");
        assertErrorMessage(deleteJson(PRODUCTS_URL + "/" + id, intruder.token()), HttpStatus.NOT_FOUND,
                "Product not found");
        assertThat(productRepository.findById(id)).isPresent();
    }

    @Test
    void shouldRejectMalformedIdUnauthenticatedAndStorelessUsers() {
        final StoreOwner owner = createStore();
        final String storeless = signupAndGetToken("No Store", "nostore@example.com", "Passw0rd123");

        assertErrorResponse(deleteJson(PRODUCTS_URL + "/abc", owner.token()), HttpStatus.BAD_REQUEST);
        assertThat(deleteJson(PRODUCTS_URL + "/" + UUID.randomUUID(), null).getStatusCode())
                .isEqualTo(HttpStatus.UNAUTHORIZED);
        assertErrorMessage(deleteJson(PRODUCTS_URL + "/" + UUID.randomUUID(), storeless), HttpStatus.NOT_FOUND,
                "You don't have a store yet");
    }

}
