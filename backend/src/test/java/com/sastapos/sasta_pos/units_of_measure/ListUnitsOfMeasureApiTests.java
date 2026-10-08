package com.sastapos.sasta_pos.units_of_measure;

import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.JsonPath;
import com.sastapos.sasta_pos.auth.support.TestDataFactory;
import com.sastapos.sasta_pos.store.support.StoreApiTestBase;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

class ListUnitsOfMeasureApiTests extends StoreApiTestBase {

    private static final String URL = "/api/units-of-measure";

    private String token;

    private ResponseEntity<String> list(final String query) {
        if (token == null) {
            token = signupAndGetToken(TestDataFactory.personName(), TestDataFactory.uniqueEmail(),
                    TestDataFactory.validPassword());
        }
        return getJson(URL + (query.isEmpty() ? "" : "?" + query), token);
    }

    private List<String> codes(final ResponseEntity<String> response) {
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        return JsonPath.read(response.getBody(), "$.content[*].code");
    }

    private void seed(final String name, final String code, final boolean allowsFraction, final boolean active) {
        final UnitsOfMeasure unit = new UnitsOfMeasure();
        unit.setName(name);
        unit.setCode(code);
        unit.setAllowsFraction(allowsFraction);
        unit.setIsActive(active);
        unitsOfMeasureRepository.saveAndFlush(unit);
    }

    private void seedSet() {
        seed("Kilogram", "kg", true, true);
        seed("Piece", "pcs", false, true);
        seed("Liter", "l", true, true);
        seed("Dozen", "dz", false, false);
    }

    @Test
    void shouldReturnPagedEnvelopeSortedByNameAscendingByDefault() {
        seedSet();

        final ResponseEntity<String> response = list("");

        assertThat(codes(response)).containsExactly("dz", "kg", "l", "pcs");
        assertThat((Integer) JsonPath.read(response.getBody(), "$.page")).isZero();
        assertThat((Integer) JsonPath.read(response.getBody(), "$.size")).isEqualTo(20);
        assertThat(((Number) JsonPath.read(response.getBody(), "$.totalElements")).longValue()).isEqualTo(4);
        assertThat((Integer) JsonPath.read(response.getBody(), "$.totalPages")).isEqualTo(1);
        assertThat(JsonPath.<String>read(response.getBody(), "$.content[0].id")).isNotBlank();
        assertThat(JsonPath.<String>read(response.getBody(), "$.content[0].name")).isEqualTo("Dozen");
        assertThat(JsonPath.<Boolean>read(response.getBody(), "$.content[0].allowsFraction")).isFalse();
        assertThat(JsonPath.<Boolean>read(response.getBody(), "$.content[0].isActive")).isFalse();
        assertThat(JsonPath.<String>read(response.getBody(), "$.content[0].dateCreated")).isNotBlank();
        assertThat(JsonPath.<String>read(response.getBody(), "$.content[0].lastUpdated")).isNotBlank();
    }

    @Test
    void shouldReturnEmptyPageWhenNoUnitsExist() {
        final ResponseEntity<String> response = list("");

        assertThat(codes(response)).isEmpty();
        assertThat((Integer) JsonPath.read(response.getBody(), "$.totalPages")).isZero();
    }

    @Test
    void shouldSearchByNameOrCodeCaseInsensitively() {
        seedSet();

        assertThat(codes(list("search=KILO"))).containsExactly("kg");
        assertThat(codes(list("search=PC"))).containsExactly("pcs");
        assertThat(codes(list("search=nomatch"))).isEmpty();
    }

    @Test
    void shouldTreatLikeWildcardsInSearchLiterally() {
        seedSet();

        assertThat(codes(list("search=%25"))).isEmpty();
        assertThat(codes(list("search=_"))).isEmpty();
    }

    @Test
    void shouldFilterByNameCodeActiveAndAllowsFraction() {
        seedSet();

        assertThat(codes(list("name=ilo"))).containsExactly("kg");
        assertThat(codes(list("code=dz"))).containsExactly("dz");
        assertThat(codes(list("isActive=false"))).containsExactly("dz");
        assertThat(codes(list("isActive=true"))).containsExactly("kg", "l", "pcs");
        assertThat(codes(list("allowsFraction=true"))).containsExactly("kg", "l");
        assertThat(codes(list("allowsFraction=false&isActive=true"))).containsExactly("pcs");
    }

    @Test
    void shouldFilterByDateRanges() {
        seedSet();

        assertThat(codes(list("createdFrom=2000-01-01T00:00:00Z&createdTo=2999-01-01T00:00:00Z"))).hasSize(4);
        assertThat(codes(list("createdFrom=2999-01-01T00:00:00Z"))).isEmpty();
        assertThat(codes(list("updatedTo=2000-01-01T00:00:00Z"))).isEmpty();
        assertThat(codes(list("updatedFrom=2000-01-01T00:00:00Z"))).hasSize(4);
    }

    @Test
    void shouldRejectInvertedDateRanges() {
        assertErrorResponse(list("createdFrom=2030-01-01T00:00:00Z&createdTo=2020-01-01T00:00:00Z"),
                HttpStatus.BAD_REQUEST);
        assertErrorResponse(list("updatedFrom=2030-01-01T00:00:00Z&updatedTo=2020-01-01T00:00:00Z"),
                HttpStatus.BAD_REQUEST);
    }

    @Test
    void shouldSortByAnySupportedFieldInEitherDirection() {
        seedSet();

        assertThat(codes(list("sortBy=name&sortDir=desc"))).containsExactly("pcs", "l", "kg", "dz");
        assertThat(codes(list("sortBy=code&sortDir=asc"))).containsExactly("dz", "kg", "l", "pcs");
        assertThat(codes(list("sortBy=code&sortDir=DESC"))).containsExactly("pcs", "l", "kg", "dz");
        assertThat(codes(list("sortBy=isActive&sortDir=asc&search=k"))).containsExactly("kg");
        assertThat(codes(list("sortBy=allowsFraction&sortDir=desc&isActive=true")).subList(0, 2))
                .containsExactlyInAnyOrder("kg", "l");
        assertThat(codes(list("sortBy=dateCreated"))).hasSize(4);
        assertThat(codes(list("sortBy=lastUpdated&sortDir=desc"))).hasSize(4);
    }

    @Test
    void shouldRejectUnknownSortFieldAndDirection() {
        assertErrorResponse(list("sortBy=bogus"), HttpStatus.BAD_REQUEST);
        assertErrorResponse(list("sortDir=sideways"), HttpStatus.BAD_REQUEST);
    }

    @Test
    void shouldPaginate() {
        seedSet();

        final ResponseEntity<String> first = list("size=3&page=0");
        assertThat(codes(first)).containsExactly("dz", "kg", "l");
        assertThat((Integer) JsonPath.read(first.getBody(), "$.totalPages")).isEqualTo(2);
        assertThat(((Number) JsonPath.read(first.getBody(), "$.totalElements")).longValue()).isEqualTo(4);

        assertThat(codes(list("size=3&page=1"))).containsExactly("pcs");
        assertThat(codes(list("size=3&page=5"))).isEmpty();
    }

    @Test
    void shouldCapPageSizeAndRejectInvalidPaging() {
        final ResponseEntity<String> capped = list("size=1000");
        assertThat(capped.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat((Integer) JsonPath.read(capped.getBody(), "$.size")).isEqualTo(100);

        assertErrorResponse(list("page=-1"), HttpStatus.BAD_REQUEST);
        assertErrorResponse(list("size=0"), HttpStatus.BAD_REQUEST);
    }

    @Test
    void shouldRejectUnauthenticatedRequests() {
        assertThat(restTemplate.getForEntity(URL, String.class).getStatusCode())
                .isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(getJson(URL, "not-a-valid-token").getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void shouldAllowAnyAuthenticatedRoleWithOrWithoutStore() {
        seedSet();
        final StoreOwner owner = createStore();
        final String cashier = signupCashierAttachedToStore(owner.storeId());
        final String storeless = signupAndGetToken(TestDataFactory.personName(),
                TestDataFactory.uniqueEmail(), TestDataFactory.validPassword());

        for (final String t : List.of(owner.token(), cashier, storeless)) {
            assertThat(codes(getJson(URL, t))).hasSize(4);
        }
    }

}
