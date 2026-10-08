package com.sastapos.sasta_pos.customer;

import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.JsonPath;
import com.sastapos.sasta_pos.auth.support.TestDataFactory;
import com.sastapos.sasta_pos.customer.support.CustomerApiTestBase;
import com.sastapos.sasta_pos.store.RowStatus;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

/** Use case 6a — update customer (+ GET by id). */
class UpdateCustomerApiTests extends CustomerApiTestBase {

    @Test
    void shouldUpdateAllEditableFields() {
        final StoreOwner owner = createStore();
        final UUID id = createCustomer(owner.token(), customerJson(uniqueName(), uniquePhone(), "old"));
        final String phone = uniquePhone();

        final ResponseEntity<String> response = patchJson(customerUrl(id), """
                {"name": "  New Name ", "phoneNumber": " %s ", "ntn": "new-ntn", "status": "INACTIVE"}"""
                .formatted(phone), owner.token());

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertCustomerShape(JsonPath.read(response.getBody(), "$"));
        final Map<String, Object> customer = JsonPath.read(response.getBody(), "$");
        assertThat(customer).containsEntry("id", id.toString()).containsEntry("name", "New Name")
                .containsEntry("phoneNumber", phone).containsEntry("ntn", "new-ntn")
                .containsEntry("status", "INACTIVE");
    }

    @Test
    void shouldLeaveOmittedFieldsUnchanged() {
        final StoreOwner owner = createStore();
        final String phone = uniquePhone();
        final UUID id = createCustomer(owner.token(), customerJson("Keep Me", phone, "ntn-1"));

        final ResponseEntity<String> response = patchJson(customerUrl(id), "{\"ntn\": \"ntn-2\"}", owner.token());

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat((Map<String, Object>) JsonPath.read(response.getBody(), "$"))
                .containsEntry("name", "Keep Me").containsEntry("phoneNumber", phone)
                .containsEntry("ntn", "ntn-2").containsEntry("status", "ACTIVE");
    }

    @Test
    void shouldAcceptEmptyBodyAsNoOp() {
        final StoreOwner owner = createStore();
        final UUID id = createCustomer(owner.token(), customerJson("Same"));

        final ResponseEntity<String> response = patchJson(customerUrl(id), "{}", owner.token());

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat((String) JsonPath.read(response.getBody(), "$.name")).isEqualTo("Same");
    }

    @Test
    void shouldClearPhoneAndNtnWithBlankValuesAndFreePhoneForReuse() {
        final StoreOwner owner = createStore();
        final String phone = uniquePhone();
        final UUID id = createCustomer(owner.token(), customerJson(uniqueName(), phone, "ntn"));

        final ResponseEntity<String> response = patchJson(customerUrl(id),
                "{\"phoneNumber\": \"\", \"ntn\": \"  \"}", owner.token());

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat((Object) JsonPath.read(response.getBody(), "$.phoneNumber")).isNull();
        assertThat((Object) JsonPath.read(response.getBody(), "$.ntn")).isNull();
        assertThat(postJson(CUSTOMERS_URL, customerJson(uniqueName(), phone, null), owner.token())
                .getStatusCode()).isEqualTo(HttpStatus.CREATED);
    }

    @Test
    void shouldAllowRenamingToSameNameWithDifferentCaseAndKeepingOwnPhone() {
        final StoreOwner owner = createStore();
        final String phone = uniquePhone();
        final UUID id = createCustomer(owner.token(), customerJson("ali", phone, null));

        final ResponseEntity<String> response = patchJson(customerUrl(id),
                "{\"name\": \"ALI\", \"phoneNumber\": \"" + phone + "\"}", owner.token());

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat((String) JsonPath.read(response.getBody(), "$.name")).isEqualTo("ALI");
    }

    @Test
    void shouldReactivateDeactivatedCustomerWithoutTouchingBalance() {
        final StoreOwner owner = createStore();
        final UUID id = createCustomer(owner.token());
        setBalance(id, "250.50");
        assertThat(patchJson(customerUrl(id), "{\"status\": \"INACTIVE\"}", owner.token()).getStatusCode())
                .isEqualTo(HttpStatus.OK);

        final ResponseEntity<String> response = patchJson(customerUrl(id), "{\"status\": \"ACTIVE\"}",
                owner.token());

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat((String) JsonPath.read(response.getBody(), "$.status")).isEqualTo("ACTIVE");
        assertDecimal(response.getBody(), "$.accountBalance", "250.50");
    }

    @Test
    void shouldDeactivateCustomerWithOutstandingBalanceWithoutChecks() {
        final StoreOwner owner = createStore();
        final UUID id = createCustomer(owner.token());
        setBalance(id, "-40.00");

        final ResponseEntity<String> response = patchJson(customerUrl(id), "{\"status\": \"INACTIVE\"}",
                owner.token());

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertDecimal(response.getBody(), "$.accountBalance", "-40.00");
    }

    @Test
    void shouldRejectAccountBalanceAndOtherNonEditableProperties() {
        final StoreOwner owner = createStore();
        final UUID id = createCustomer(owner.token());

        for (final String body : List.of("{\"accountBalance\": 100}", "{\"storeId\": \"" + UUID.randomUUID() + "\"}",
                "{\"id\": \"" + UUID.randomUUID() + "\"}", "{\"bogus\": true}")) {
            assertErrorResponse(patchJson(customerUrl(id), body, owner.token()), HttpStatus.BAD_REQUEST);
        }
        assertThat(requireCustomerById(id).getAccountBalance()).isEqualByComparingTo("0");
    }

    @ParameterizedTest
    @ValueSource(strings = {"{\"status\": \"DELETED\"}", "{\"status\": \"active\"}", "{\"status\": 1}",
            "{\"name\": \"\"}", "{\"name\": \"   \"}", "{\"phoneNumber\": 12345678901234567890123456789012345678901234567890123}"})
    void shouldRejectInvalidValues(final String body) {
        final StoreOwner owner = createStore();
        final UUID id = createCustomer(owner.token());

        assertErrorResponse(patchJson(customerUrl(id), body, owner.token()), HttpStatus.BAD_REQUEST);
    }

    @Test
    void shouldRejectNameUsedByAnotherCustomerInSameStore() {
        final StoreOwner owner = createStore();
        createCustomer(owner.token(), customerJson("Taken"));
        final UUID id = createCustomer(owner.token());

        assertErrorMessage(patchJson(customerUrl(id), "{\"name\": \"taken\"}", owner.token()),
                HttpStatus.CONFLICT, "A customer with this name already exists");
    }

    @Test
    void shouldRejectPhoneUsedByAnyOtherCustomerGlobally() {
        final StoreOwner first = createStore();
        final StoreOwner second = createStore();
        final String phone = uniquePhone();
        createCustomer(first.token(), customerJson(uniqueName(), phone, null));
        final UUID id = createCustomer(second.token());

        assertErrorMessage(patchJson(customerUrl(id), "{\"phoneNumber\": \"" + phone + "\"}", second.token()),
                HttpStatus.CONFLICT, "A customer with this phoneNumber already exists");
    }

    @Test
    void shouldAllowSameNameAsCustomerOfAnotherStore() {
        final StoreOwner first = createStore();
        final StoreOwner second = createStore();
        createCustomer(first.token(), customerJson("Shared"));
        final UUID id = createCustomer(second.token());

        assertThat(patchJson(customerUrl(id), "{\"name\": \"Shared\"}", second.token()).getStatusCode())
                .isEqualTo(HttpStatus.OK);
    }

    @Test
    void shouldReturn404ForUnknownAndForeignCustomer() {
        final StoreOwner owner = createStore();
        final StoreOwner other = createStore();
        final UUID foreign = createCustomer(other.token());

        assertErrorMessage(patchJson(customerUrl(UUID.randomUUID()), "{}", owner.token()),
                HttpStatus.NOT_FOUND, "Customer not found");
        assertErrorMessage(patchJson(customerUrl(foreign), "{\"name\": \"hijack\"}", owner.token()),
                HttpStatus.NOT_FOUND, "Customer not found");
        assertThat(requireCustomerById(foreign).getName()).isNotEqualTo("hijack");
    }

    @Test
    void shouldReturn400ForMalformedIdAnd401WithoutToken() {
        final StoreOwner owner = createStore();

        assertErrorResponse(patchJson(CUSTOMERS_URL + "/not-a-uuid", "{}", owner.token()), HttpStatus.BAD_REQUEST);
        assertThat(patchJson(customerUrl(UUID.randomUUID()), "{}", null).getStatusCode())
                .isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void shouldReturn404WhenUserHasNoStore() {
        final String token = signupAndGetToken(TestDataFactory.personName(), TestDataFactory.uniqueEmail(),
                TestDataFactory.validPassword());

        assertErrorMessage(patchJson(customerUrl(UUID.randomUUID()), "{}", token), HttpStatus.NOT_FOUND,
                "You don't have a store yet");
    }

    // ---------- GET by id ----------

    @Test
    void shouldGetCustomerById() {
        final StoreOwner owner = createStore();
        final UUID id = createCustomer(owner.token(), customerJson("Fetch Me", uniquePhone(), "n"));

        final ResponseEntity<String> response = getJson(customerUrl(id), owner.token());

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertCustomerShape(JsonPath.read(response.getBody(), "$"));
        assertThat((String) JsonPath.read(response.getBody(), "$.name")).isEqualTo("Fetch Me");
    }

    @Test
    void shouldNotGetUnknownOrForeignCustomerById() {
        final StoreOwner owner = createStore();
        final UUID foreign = createCustomer(createStore().token());

        assertErrorMessage(getJson(customerUrl(foreign), owner.token()), HttpStatus.NOT_FOUND, "Customer not found");
        assertErrorMessage(getJson(customerUrl(UUID.randomUUID()), owner.token()), HttpStatus.NOT_FOUND,
                "Customer not found");
        assertThat(restTemplate.getForEntity(customerUrl(foreign), String.class).getStatusCode())
                .isEqualTo(HttpStatus.UNAUTHORIZED);
    }

}
