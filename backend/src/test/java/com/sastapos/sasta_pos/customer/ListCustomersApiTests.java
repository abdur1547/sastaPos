package com.sastapos.sasta_pos.customer;

import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.JsonPath;
import com.sastapos.sasta_pos.auth.support.TestDataFactory;
import com.sastapos.sasta_pos.customer.support.CustomerApiTestBase;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

/** Use case 6c — list customers with filters. */
class ListCustomersApiTests extends CustomerApiTestBase {

    private List<String> names(final ResponseEntity<String> response) {
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        return JsonPath.read(response.getBody(), "$.content[*].name");
    }

    private UUID customer(final StoreOwner owner, final String name, final String balance) {
        final UUID id = createCustomer(owner.token(), customerJson(name));
        setBalance(id, balance);
        return id;
    }

    @Test
    void shouldReturnEmptyEnvelopeWhenNoCustomers() {
        final StoreOwner owner = createStore();

        final ResponseEntity<String> response = getJson(CUSTOMERS_URL, owner.token());

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        final Map<String, Object> page = JsonPath.read(response.getBody(), "$");
        assertThat(page.keySet()).containsExactlyInAnyOrder("content", "page", "size", "totalElements",
                "totalPages");
        assertThat((List<?>) page.get("content")).isEmpty();
        assertThat(page).containsEntry("page", 0).containsEntry("size", 20).containsEntry("totalElements", 0);
    }

    @Test
    void shouldListOnlyActiveCustomersOfOwnStoreSortedByNameByDefault() {
        final StoreOwner owner = createStore();
        createCustomer(createStore().token(), customerJson("Foreign"));
        customer(owner, "Charlie", "0");
        customer(owner, "alice", "0");
        customer(owner, "Bob", "0");
        final UUID gone = customer(owner, "Zed", "0");
        patchJson(customerUrl(gone), "{\"status\": \"INACTIVE\"}", owner.token());

        final ResponseEntity<String> response = getJson(CUSTOMERS_URL, owner.token());

        assertThat(names(response)).containsExactly("alice", "Bob", "Charlie");
        assertCustomerShape(JsonPath.read(response.getBody(), "$.content[0]"));
    }

    @Test
    void shouldFilterByStatus() {
        final StoreOwner owner = createStore();
        customer(owner, "Active One", "0");
        final UUID gone = customer(owner, "Gone One", "0");
        patchJson(customerUrl(gone), "{\"status\": \"INACTIVE\"}", owner.token());

        assertThat(names(getJson(CUSTOMERS_URL + "?status=INACTIVE", owner.token()))).containsExactly("Gone One");
        assertThat(names(getJson(CUSTOMERS_URL + "?status=ACTIVE", owner.token()))).containsExactly("Active One");
    }

    @Test
    void shouldSearchAcrossNamePhoneAndNtnCaseInsensitively() {
        final StoreOwner owner = createStore();
        createCustomer(owner.token(), customerJson("Hamza Store", "03001112222", "NTN-777"));
        createCustomer(owner.token(), customerJson("Other", "03339998888", "ABC"));

        assertThat(names(getJson(CUSTOMERS_URL + "?search=hAMZa", owner.token()))).containsExactly("Hamza Store");
        assertThat(names(getJson(CUSTOMERS_URL + "?search=0333999", owner.token()))).containsExactly("Other");
        assertThat(names(getJson(CUSTOMERS_URL + "?search=ntn-7", owner.token()))).containsExactly("Hamza Store");
        assertThat(names(getJson(CUSTOMERS_URL + "?search=nomatch", owner.token()))).isEmpty();
        assertThat(names(getJson(CUSTOMERS_URL + "?search=  ", owner.token()))).hasSize(2);
    }

    @Test
    void shouldTreatLikeWildcardsInSearchAsLiterals() {
        final StoreOwner owner = createStore();
        createCustomer(owner.token(), customerJson("100% Pure"));
        createCustomer(owner.token(), customerJson("Under_score"));
        createCustomer(owner.token(), customerJson("Plain"));

        assertThat(names(getJson(CUSTOMERS_URL + "?search=%", owner.token()))).containsExactly("100% Pure");
        assertThat(names(getJson(CUSTOMERS_URL + "?search=_", owner.token()))).containsExactly("Under_score");
    }

    @Test
    void shouldFilterByHasBalance() {
        final StoreOwner owner = createStore();
        customer(owner, "Owes", "50.00");
        customer(owner, "Credit", "-5.00");
        customer(owner, "Settled", "0");

        assertThat(names(getJson(CUSTOMERS_URL + "?hasBalance=true", owner.token())))
                .containsExactly("Credit", "Owes");
        assertThat(names(getJson(CUSTOMERS_URL + "?hasBalance=false", owner.token()))).containsExactly("Settled");
    }

    @Test
    void shouldFilterByBalanceRangeIncludingNegativeBounds() {
        final StoreOwner owner = createStore();
        customer(owner, "A", "-100.00");
        customer(owner, "B", "0");
        customer(owner, "C", "50.00");
        customer(owner, "D", "200.00");

        assertThat(names(getJson(CUSTOMERS_URL + "?minBalance=0&maxBalance=50", owner.token())))
                .containsExactly("B", "C");
        assertThat(names(getJson(CUSTOMERS_URL + "?minBalance=-100&maxBalance=-100", owner.token())))
                .containsExactly("A");
        assertThat(names(getJson(CUSTOMERS_URL + "?maxBalance=-1", owner.token()))).containsExactly("A");
        assertThat(names(getJson(CUSTOMERS_URL + "?minBalance=100", owner.token()))).containsExactly("D");
    }

    @Test
    void shouldCombineFiltersWithAnd() {
        final StoreOwner owner = createStore();
        customer(owner, "Ali Debtor", "10.00");
        customer(owner, "Ali Settled", "0");
        customer(owner, "Bob Debtor", "20.00");

        assertThat(names(getJson(CUSTOMERS_URL + "?search=ali&hasBalance=true&minBalance=5", owner.token())))
                .containsExactly("Ali Debtor");
        assertThat(names(getJson(CUSTOMERS_URL + "?hasBalance=false&minBalance=5", owner.token()))).isEmpty();
    }

    @Test
    void shouldSortByBalanceAndCreatedAtInBothDirections() throws InterruptedException {
        final StoreOwner owner = createStore();
        customer(owner, "First", "30.00");
        Thread.sleep(5);
        customer(owner, "Second", "-10.00");
        Thread.sleep(5);
        customer(owner, "Third", "20.00");

        assertThat(names(getJson(CUSTOMERS_URL + "?sortBy=accountBalance", owner.token())))
                .containsExactly("Second", "Third", "First");
        assertThat(names(getJson(CUSTOMERS_URL + "?sortBy=accountBalance&sortDir=desc", owner.token())))
                .containsExactly("First", "Third", "Second");
        assertThat(names(getJson(CUSTOMERS_URL + "?sortBy=createdAt&sortDir=DESC", owner.token())))
                .containsExactly("Third", "Second", "First");
        assertThat(names(getJson(CUSTOMERS_URL + "?sortBy=name&sortDir=desc", owner.token())))
                .containsExactly("Third", "Second", "First");
    }

    @Test
    void shouldPaginateAndReportTotals() {
        final StoreOwner owner = createStore();
        for (int i = 1; i <= 5; i++) {
            customer(owner, "Cust" + i, "0");
        }

        final ResponseEntity<String> second = getJson(CUSTOMERS_URL + "?page=1&size=2", owner.token());

        assertThat(names(second)).containsExactly("Cust3", "Cust4");
        assertThat((int) JsonPath.read(second.getBody(), "$.totalElements")).isEqualTo(5);
        assertThat((int) JsonPath.read(second.getBody(), "$.totalPages")).isEqualTo(3);
        assertThat((int) JsonPath.read(second.getBody(), "$.page")).isEqualTo(1);
        assertThat((int) JsonPath.read(second.getBody(), "$.size")).isEqualTo(2);
        assertThat(names(getJson(CUSTOMERS_URL + "?page=9&size=2", owner.token()))).isEmpty();
    }

    @Test
    void shouldCapPageSizeAt100() {
        final StoreOwner owner = createStore();

        final ResponseEntity<String> response = getJson(CUSTOMERS_URL + "?size=1000", owner.token());

        assertThat((int) JsonPath.read(response.getBody(), "$.size")).isEqualTo(100);
    }

    @ParameterizedTest
    @ValueSource(strings = {"status=DELETED", "status=active", "hasBalance=maybe", "minBalance=abc",
            "minBalance=10&maxBalance=5", "page=-1", "size=0", "size=-3", "page=x", "sortBy=password",
            "sortBy=dateCreated", "sortDir=sideways"})
    void shouldRejectInvalidParameters(final String query) {
        final StoreOwner owner = createStore();

        assertErrorResponse(getJson(CUSTOMERS_URL + "?" + query, owner.token()), HttpStatus.BAD_REQUEST);
    }

    @Test
    void shouldReturn401WithoutTokenAnd404WithoutStore() {
        final String noStore = signupAndGetToken(TestDataFactory.personName(), TestDataFactory.uniqueEmail(),
                TestDataFactory.validPassword());

        assertThat(restTemplate.getForEntity(CUSTOMERS_URL, String.class).getStatusCode())
                .isEqualTo(HttpStatus.UNAUTHORIZED);
        assertErrorMessage(getJson(CUSTOMERS_URL, noStore), HttpStatus.NOT_FOUND, "You don't have a store yet");
    }

    @Test
    void shouldShowSameStoreCustomersToCashier() {
        final StoreOwner owner = createStore();
        customer(owner, "Shared", "0");
        final String cashier = signupCashierAttachedToStore(owner.storeId());

        assertThat(names(getJson(CUSTOMERS_URL, cashier))).containsExactly("Shared");
    }

}
