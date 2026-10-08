package com.sastapos.sasta_pos.product;

import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.JsonPath;
import com.sastapos.sasta_pos.auth.support.TestDataFactory;
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


/** Use case 4c — list products with filters, pagination and sorting (plus get-by-id). */
class ListProductsApiTests extends ProductApiTestBase {

    private ResponseEntity<String> list(final StoreOwner owner, final String query) {
        return getJson(PRODUCTS_URL + (query.isEmpty() ? "" : "?" + query), owner.token());
    }

    private List<String> names(final ResponseEntity<String> response) {
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        return JsonPath.read(response.getBody(), "$.content[*].name");
    }

    private UUID add(final StoreOwner owner, final String name, final String sku, final String barCode,
            final String pct, final String price, final String stock, final UnitsOfMeasure unit,
            final String taxIds) {
        return createProduct(owner.token(), productJson(name, sku, barCode, pct, price, stock, unit.getId(), taxIds));
    }

    @Test
    void shouldReturnPagedEnvelopeSortedByNameAscendingByDefault() {
        final StoreOwner owner = createStore();
        final UnitsOfMeasure unit = seedUnit(true);
        add(owner, "Charlie", null, null, "p3", "1", null, unit, null);
        add(owner, "Alpha", null, null, "p1", "1", null, unit, null);
        add(owner, "Bravo", null, null, "p2", "1", null, unit, null);

        final ResponseEntity<String> response = list(owner, "");

        assertThat(names(response)).containsExactly("Alpha", "Bravo", "Charlie");
        assertThat((Integer) JsonPath.read(response.getBody(), "$.page")).isZero();
        assertThat((Integer) JsonPath.read(response.getBody(), "$.size")).isEqualTo(20);
        assertThat(((Number) JsonPath.read(response.getBody(), "$.totalElements")).longValue()).isEqualTo(3);
        assertThat((Integer) JsonPath.read(response.getBody(), "$.totalPages")).isEqualTo(1);
        assertProductShape(JsonPath.read(response.getBody(), "$.content[0]"));
    }

    @Test
    void shouldReturnEmptyPageForStoreWithoutProducts() {
        final StoreOwner owner = createStore();

        final ResponseEntity<String> response = list(owner, "");

        assertThat(names(response)).isEmpty();
        assertThat((Integer) JsonPath.read(response.getBody(), "$.totalPages")).isZero();
    }

    @Test
    void shouldOnlyListActiveProductsUnlessStatusRequested() {
        final StoreOwner owner = createStore();
        final UnitsOfMeasure unit = seedUnit(true);
        add(owner, "Live", null, null, "p1", "1", null, unit, null);
        final UUID dead = add(owner, "Dead", null, null, "p2", "1", null, unit, null);
        patchJson(PRODUCTS_URL + "/" + dead, "{\"status\": \"INACTIVE\"}", owner.token());

        assertThat(names(list(owner, ""))).containsExactly("Live");
        assertThat(names(list(owner, "status=ACTIVE"))).containsExactly("Live");
        assertThat(names(list(owner, "status=INACTIVE"))).containsExactly("Dead");
    }

    @ParameterizedTest
    @ValueSource(strings = {"status=IN_ACTIVE", "status=active", "status=DELETED",
            "unitOfMeasureId=abc", "taxCategoryId=abc", "minPrice=abc", "maxStock=x", "page=abc", "size=abc"})
    void shouldRejectInvalidFilterValues(final String query) {
        final StoreOwner owner = createStore();

        assertErrorResponse(list(owner, query), HttpStatus.BAD_REQUEST);
    }

    @Test
    void shouldSearchAcrossNameSkuBarCodeAndPctCodeIgnoringCase() {
        final StoreOwner owner = createStore();
        final UnitsOfMeasure unit = seedUnit(true);
        add(owner, "Coca Cola", "SKU-111", null, "p1", "1", null, unit, null);
        add(owner, "Pepsi", "ZZZ", "BAR-222", "p2", "1", null, unit, null);
        add(owner, "Water", "yyy", null, "HS-3333", "1", null, unit, null);

        assertThat(names(list(owner, "search=coca"))).containsExactly("Coca Cola");
        assertThat(names(list(owner, "search=sku-111"))).containsExactly("Coca Cola");
        assertThat(names(list(owner, "search=bar-22"))).containsExactly("Pepsi");
        assertThat(names(list(owner, "search=hs-33"))).containsExactly("Water");
        assertThat(names(list(owner, "search=nomatch"))).isEmpty();
        assertThat(names(list(owner, "search="))).hasSize(3);
    }

    @Test
    void shouldTreatSearchWildcardsLiterally() {
        final StoreOwner owner = createStore();
        final UnitsOfMeasure unit = seedUnit(true);
        add(owner, "100% Juice", null, null, "p1", "1", null, unit, null);
        add(owner, "Plain", null, null, "p2", "1", null, unit, null);
        add(owner, "a_b", null, null, "p3", "1", null, unit, null);

        assertThat(names(list(owner, "search=%"))).containsExactly("100% Juice");
        assertThat(names(list(owner, "search=_"))).containsExactly("a_b");
    }

    @Test
    void shouldFilterByUnitOfMeasureAndTaxCategory() {
        final StoreOwner owner = createStore();
        final UnitsOfMeasure kg = seedUnit(true);
        final UnitsOfMeasure piece = seedUnit(false);
        final TaxCategory gst = seedTaxCategory(18);
        final TaxCategory fed = seedTaxCategory(5);
        add(owner, "A", null, null, "p1", "1", null, kg, "[\"%s\", \"%s\"]".formatted(gst.getId(), fed.getId()));
        add(owner, "B", null, null, "p2", "1", null, piece, "[\"%s\"]".formatted(gst.getId()));
        add(owner, "C", null, null, "p3", "1", null, piece, null);

        assertThat(names(list(owner, "unitOfMeasureId=" + piece.getId()))).containsExactly("B", "C");
        assertThat(names(list(owner, "taxCategoryId=" + gst.getId()))).containsExactly("A", "B");
        assertThat(names(list(owner, "taxCategoryId=" + fed.getId()))).containsExactly("A");
        assertThat(names(list(owner, "taxCategoryId=" + gst.getId() + "&unitOfMeasureId=" + piece.getId())))
                .containsExactly("B");
        assertThat(names(list(owner, "taxCategoryId=" + UUID.randomUUID()))).isEmpty();
    }

    @Test
    void shouldFilterByStockAndPriceRangesInclusively() {
        final StoreOwner owner = createStore();
        final UnitsOfMeasure unit = seedUnit(true);
        add(owner, "Low", null, null, "p1", "5.00", "0", unit, null);
        add(owner, "Mid", null, null, "p2", "50.00", "10", unit, null);
        add(owner, "High", null, null, "p3", "500.00", "100", unit, null);

        assertThat(names(list(owner, "minStock=10&maxStock=100"))).containsExactly("High", "Mid");
        assertThat(names(list(owner, "maxStock=0"))).containsExactly("Low");
        assertThat(names(list(owner, "minPrice=50&maxPrice=50"))).containsExactly("Mid");
        assertThat(names(list(owner, "minPrice=6&maxStock=10"))).containsExactly("Mid");
        assertThat(names(list(owner, "minPrice=1000"))).isEmpty();
    }

    @ParameterizedTest
    @ValueSource(strings = {"minStock=5&maxStock=1", "minPrice=10&maxPrice=9.99", "minStock=-1", "maxPrice=-1"})
    void shouldRejectInvalidRanges(final String query) {
        final StoreOwner owner = createStore();

        assertErrorResponse(list(owner, query), HttpStatus.BAD_REQUEST);
    }

    @Test
    void shouldPaginateAndKeepOrderStableAcrossPages() {
        final StoreOwner owner = createStore();
        final UnitsOfMeasure unit = seedUnit(true);
        for (int i = 1; i <= 5; i++) {
            add(owner, "P" + i, null, null, "p" + i, "1", null, unit, null);
        }

        final ResponseEntity<String> first = list(owner, "size=2&page=0");
        final ResponseEntity<String> last = list(owner, "size=2&page=2");
        final ResponseEntity<String> beyond = list(owner, "size=2&page=9");

        assertThat(names(first)).containsExactly("P1", "P2");
        assertThat(((Number) JsonPath.read(first.getBody(), "$.totalElements")).longValue()).isEqualTo(5);
        assertThat((Integer) JsonPath.read(first.getBody(), "$.totalPages")).isEqualTo(3);
        assertThat((Integer) JsonPath.read(first.getBody(), "$.size")).isEqualTo(2);
        assertThat(names(last)).containsExactly("P5");
        assertThat(names(beyond)).isEmpty();
    }

    @Test
    void shouldCapPageSizeServerSide() {
        final StoreOwner owner = createStore();

        final ResponseEntity<String> response = list(owner, "size=100000");

        assertThat((Integer) JsonPath.read(response.getBody(), "$.size")).isEqualTo(100);
    }

    @ParameterizedTest
    @ValueSource(strings = {"size=0", "size=-5", "page=-1"})
    void shouldRejectInvalidPagination(final String query) {
        final StoreOwner owner = createStore();

        assertErrorResponse(list(owner, query), HttpStatus.BAD_REQUEST);
    }

    @Test
    void shouldSortByEachAllowedFieldInBothDirections() {
        final StoreOwner owner = createStore();
        final UnitsOfMeasure unit = seedUnit(true);
        add(owner, "B", null, null, "p1", "30", "1", unit, null);
        add(owner, "C", null, null, "p2", "10", "3", unit, null);
        add(owner, "A", null, null, "p3", "20", "2", unit, null);

        assertThat(names(list(owner, "sortBy=name&sortDir=desc"))).containsExactly("C", "B", "A");
        assertThat(names(list(owner, "sortBy=unitPrice"))).containsExactly("C", "A", "B");
        assertThat(names(list(owner, "sortBy=unitPrice&sortDir=DESC"))).containsExactly("B", "A", "C");
        assertThat(names(list(owner, "sortBy=stockQuantity&sortDir=desc"))).containsExactly("C", "A", "B");
        assertThat(names(list(owner, "sortBy=createdAt"))).containsExactly("B", "C", "A");
        assertThat(names(list(owner, "sortBy=createdAt&sortDir=desc"))).containsExactly("A", "C", "B");
    }

    @ParameterizedTest
    @ValueSource(strings = {"sortBy=sku", "sortBy=password", "sortDir=up"})
    void shouldRejectUnknownSortParameters(final String query) {
        final StoreOwner owner = createStore();

        assertErrorResponse(list(owner, query), HttpStatus.BAD_REQUEST);
    }

    @Test
    void shouldScopeListingAndLookupToOwnStore() {
        final StoreOwner owner = createStore();
        final StoreOwner other = createStore();
        final UnitsOfMeasure unit = seedUnit(true);
        add(owner, "Mine", null, null, "p1", "1", null, unit, null);
        final UUID theirs = add(other, "Theirs", null, null, "p1", "1", null, unit, null);

        assertThat(names(list(owner, ""))).containsExactly("Mine");
        assertThat(names(list(owner, "search=Theirs"))).isEmpty();
        assertErrorMessage(getJson(PRODUCTS_URL + "/" + theirs, owner.token()), HttpStatus.NOT_FOUND,
                "Product not found");
    }

    @Test
    void shouldGetProductById() {
        final StoreOwner owner = createStore();
        final UUID id = createProduct(owner.token(), seedUnit(true).getId());

        final ResponseEntity<String> response = getJson(PRODUCTS_URL + "/" + id, owner.token());

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertProductShape(JsonPath.read(response.getBody(), "$"));
        assertThat((String) JsonPath.read(response.getBody(), "$.id")).isEqualTo(id.toString());
    }

    @Test
    void shouldReturnNotFoundForUnknownIdAndBadRequestForMalformedId() {
        final StoreOwner owner = createStore();

        assertErrorMessage(getJson(PRODUCTS_URL + "/" + UUID.randomUUID(), owner.token()), HttpStatus.NOT_FOUND,
                "Product not found");
        assertErrorResponse(getJson(PRODUCTS_URL + "/xyz", owner.token()), HttpStatus.BAD_REQUEST);
    }

    @Test
    void shouldRejectUnauthenticatedAndStorelessUsers() {
        final String storeless = signupAndGetToken(TestDataFactory.personName(), TestDataFactory.uniqueEmail(),
                TestDataFactory.validPassword());

        assertThat(restTemplate.getForEntity(PRODUCTS_URL, String.class).getStatusCode())
                .isEqualTo(HttpStatus.UNAUTHORIZED);
        assertErrorMessage(getJson(PRODUCTS_URL, storeless), HttpStatus.NOT_FOUND, "You don't have a store yet");
        assertErrorMessage(getJson(PRODUCTS_URL + "/" + UUID.randomUUID(), storeless), HttpStatus.NOT_FOUND,
                "You don't have a store yet");
    }

}
