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

/** Use case 6 — create customer. */
class CreateCustomerApiTests extends CustomerApiTestBase {

    @Test
    void shouldCreateCustomerWithOnlyNameAndApplyDefaults() {
        final StoreOwner owner = createStore();
        final String name = uniqueName();

        final ResponseEntity<String> response = postJson(CUSTOMERS_URL, customerJson(name), owner.token());

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        final Map<String, Object> customer = JsonPath.read(response.getBody(), "$");
        assertCustomerShape(customer);
        assertThat(customer).containsEntry("name", name).containsEntry("phoneNumber", null)
                .containsEntry("ntn", null).containsEntry("status", "ACTIVE")
                .containsEntry("storeId", owner.storeId().toString());
        assertDecimal(response.getBody(), "$.accountBalance", "0");
        assertThat((String) customer.get("createdAt")).isNotBlank();
        assertThat(customerRepository.count()).isEqualTo(1);
    }

    @Test
    void shouldCreateCustomerWithAllFieldsAndTrimValues() {
        final StoreOwner owner = createStore();
        final String phone = uniquePhone();

        final ResponseEntity<String> response = postJson(CUSTOMERS_URL,
                customerJson("  Padded Name  ", "  " + phone + " ", " 1234567-8 "), owner.token());

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        final Map<String, Object> customer = JsonPath.read(response.getBody(), "$");
        assertThat(customer).containsEntry("name", "Padded Name").containsEntry("phoneNumber", phone)
                .containsEntry("ntn", "1234567-8");
    }

    @Test
    void shouldStoreBlankPhoneAndNtnAsNullAndAllowManyCustomersWithoutPhone() {
        final StoreOwner owner = createStore();

        for (int i = 0; i < 2; i++) {
            final ResponseEntity<String> response = postJson(CUSTOMERS_URL,
                    customerJson(uniqueName(), "  ", ""), owner.token());
            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
            assertThat((Object) JsonPath.read(response.getBody(), "$.phoneNumber")).isNull();
            assertThat((Object) JsonPath.read(response.getBody(), "$.ntn")).isNull();
        }
    }

    @Test
    void shouldAllowCashierToCreateCustomerInTheirStore() {
        final StoreOwner owner = createStore();
        final String cashier = signupCashierAttachedToStore(owner.storeId());

        final ResponseEntity<String> response = postJson(CUSTOMERS_URL, customerJson(uniqueName()), cashier);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        assertThat((String) JsonPath.read(response.getBody(), "$.storeId")).isEqualTo(owner.storeId().toString());
    }

    @Test
    void shouldIgnoreClientSuppliedBalanceStatusAndStoreByRejectingThem() {
        final StoreOwner owner = createStore();

        for (final String extra : List.of("\"accountBalance\": 500", "\"status\": \"INACTIVE\"",
                "\"storeId\": \"" + UUID.randomUUID() + "\"", "\"bogus\": 1")) {
            final ResponseEntity<String> response = postJson(CUSTOMERS_URL,
                    "{\"name\": \"" + uniqueName() + "\", " + extra + "}", owner.token());
            assertErrorResponse(response, HttpStatus.BAD_REQUEST);
        }
        assertThat(customerRepository.count()).isZero();
    }

    @Test
    void shouldRequireAuthentication() {
        assertThat(postJson(CUSTOMERS_URL, customerJson(uniqueName())).getStatusCode())
                .isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(postJson(CUSTOMERS_URL, customerJson(uniqueName()), "not-a-jwt").getStatusCode())
                .isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void shouldReturn404WhenUserHasNoStore() {
        final String token = signupAndGetToken(TestDataFactory.personName(), TestDataFactory.uniqueEmail(),
                TestDataFactory.validPassword());

        assertErrorMessage(postJson(CUSTOMERS_URL, customerJson(uniqueName()), token), HttpStatus.NOT_FOUND,
                "You don't have a store yet");
    }

    @ParameterizedTest
    @ValueSource(strings = {"{}", "{\"name\": null}", "{\"name\": \"\"}", "{\"name\": \"   \"}",
            "[]", "not json"})
    void shouldRejectMissingOrBlankName(final String body) {
        final StoreOwner owner = createStore();

        assertErrorResponse(postJson(CUSTOMERS_URL, body, owner.token()), HttpStatus.BAD_REQUEST);
    }

    @Test
    void shouldRejectOverlongFields() {
        final StoreOwner owner = createStore();

        assertErrorResponse(postJson(CUSTOMERS_URL, customerJson("a".repeat(256)), owner.token()),
                HttpStatus.BAD_REQUEST);
        assertErrorResponse(postJson(CUSTOMERS_URL, customerJson(uniqueName(), "1".repeat(51), null),
                owner.token()), HttpStatus.BAD_REQUEST);
        assertErrorResponse(postJson(CUSTOMERS_URL, customerJson(uniqueName(), null, "n".repeat(256)),
                owner.token()), HttpStatus.BAD_REQUEST);
    }

    @Test
    void shouldRejectDuplicateNameInSameStoreCaseInsensitively() {
        final StoreOwner owner = createStore();
        createCustomer(owner.token(), customerJson("Ali Traders"));

        assertErrorMessage(postJson(CUSTOMERS_URL, customerJson("  ali TRADERS "), owner.token()),
                HttpStatus.CONFLICT, "A customer with this name already exists");
        assertThat(customerRepository.count()).isEqualTo(1);
    }

    @Test
    void shouldAllowSameNameInDifferentStores() {
        final StoreOwner first = createStore();
        final StoreOwner second = createStore();
        createCustomer(first.token(), customerJson("Shared Name"));

        assertThat(postJson(CUSTOMERS_URL, customerJson("Shared Name"), second.token()).getStatusCode())
                .isEqualTo(HttpStatus.CREATED);
    }

    @Test
    void shouldRejectDuplicatePhoneAcrossAllStores() {
        final StoreOwner first = createStore();
        final StoreOwner second = createStore();
        final String phone = uniquePhone();
        createCustomer(first.token(), customerJson(uniqueName(), phone, null));

        assertErrorMessage(postJson(CUSTOMERS_URL, customerJson(uniqueName(), phone, null), second.token()),
                HttpStatus.CONFLICT, "A customer with this phoneNumber already exists");
        assertErrorMessage(postJson(CUSTOMERS_URL, customerJson(uniqueName(), phone, null), first.token()),
                HttpStatus.CONFLICT, "A customer with this phoneNumber already exists");
    }

    @Test
    void shouldAllowReusingNameOfDeactivatedCustomerOnlyAsConflict() {
        // names stay reserved while a customer is merely deactivated
        final StoreOwner owner = createStore();
        final UUID id = createCustomer(owner.token(), customerJson("Reserved"));
        assertThat(patchJson(customerUrl(id), "{\"status\": \"INACTIVE\"}", owner.token()).getStatusCode())
                .isEqualTo(HttpStatus.OK);

        assertThat(postJson(CUSTOMERS_URL, customerJson("Reserved"), owner.token()).getStatusCode())
                .isEqualTo(HttpStatus.CONFLICT);
        assertThat(requireCustomerById(id).getStatus()).isEqualTo(RowStatus.INACTIVE);
    }

}
