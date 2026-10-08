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

/** Use case 6b — delete customer. */
class DeleteCustomerApiTests extends CustomerApiTestBase {

    @Test
    void shouldHardDeleteCleanCustomer() {
        final StoreOwner owner = createStore();
        final UUID id = createCustomer(owner.token());

        final ResponseEntity<String> response = deleteJson(customerUrl(id), owner.token());

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        assertThat(response.getBody()).isNull();
        assertThat(customerRepository.existsById(id)).isFalse();
        assertThat(getJson(customerUrl(id), owner.token()).getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    }

    @Test
    void shouldFreeNameAndPhoneAfterHardDelete() {
        final StoreOwner owner = createStore();
        final String phone = uniquePhone();
        final UUID id = createCustomer(owner.token(), customerJson("Reusable", phone, null));
        deleteJson(customerUrl(id), owner.token());

        assertThat(postJson(CUSTOMERS_URL, customerJson("Reusable", phone, null), owner.token()).getStatusCode())
                .isEqualTo(HttpStatus.CREATED);
    }

    @Test
    void shouldDeactivateInsteadOfDeleteWhenCustomerHasSales() {
        final StoreOwner owner = createStore();
        final UUID id = createCustomer(owner.token());
        recordSaleFor(owner.storeId(), id);

        final ResponseEntity<String> response = deleteJson(customerUrl(id), owner.token());

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat((String) JsonPath.read(response.getBody(), "$.message")).containsIgnoringCase("deactivated");
        assertThat((String) JsonPath.read(response.getBody(), "$.customer.status")).isEqualTo("INACTIVE");
        assertThat(requireCustomerById(id).getStatus()).isEqualTo(RowStatus.INACTIVE);
    }

    @Test
    void shouldDeactivateInsteadOfDeleteWhenCustomerHasLedgerEntries() {
        final StoreOwner owner = createStore();
        final UUID id = createCustomer(owner.token());
        final UUID entryId = takePayment(owner.token(), id, "100.00");
        assertThat(postJson(voidUrl(id, entryId), voidJson("oops"), owner.token()).getStatusCode())
                .isEqualTo(HttpStatus.OK);

        final ResponseEntity<String> response = deleteJson(customerUrl(id), owner.token());

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat((String) JsonPath.read(response.getBody(), "$.customer.status")).isEqualTo("INACTIVE");
        assertDecimal(response.getBody(), "$.customer.accountBalance", "0");
        assertThat(ledgerEntryRepository.count()).isEqualTo(2);
    }

    @Test
    void shouldOnlyChangeStatusOnSoftDelete() {
        final StoreOwner owner = createStore();
        final String phone = uniquePhone();
        final UUID id = createCustomer(owner.token(), customerJson("Intact", phone, "ntn"));
        recordSaleFor(owner.storeId(), id);

        deleteJson(customerUrl(id), owner.token());

        final var customer = requireCustomerById(id);
        assertThat(customer.getName()).isEqualTo("Intact");
        assertThat(customer.getPhoneNumber()).isEqualTo(phone);
        assertThat(customer.getNtn()).isEqualTo("ntn");
    }

    @Test
    void shouldBeIdempotentForAlreadyDeactivatedCustomerWithHistory() {
        final StoreOwner owner = createStore();
        final UUID id = createCustomer(owner.token());
        recordSaleFor(owner.storeId(), id);
        deleteJson(customerUrl(id), owner.token());

        final ResponseEntity<String> response = deleteJson(customerUrl(id), owner.token());

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    @Test
    void shouldRejectDeleteWhenCustomerOwesStore() {
        final StoreOwner owner = createStore();
        final UUID id = createCustomer(owner.token());
        setBalance(id, "10.00");

        assertThat(deleteJson(customerUrl(id), owner.token()).getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(customerRepository.existsById(id)).isTrue();
        assertThat(requireCustomerById(id).getStatus()).isEqualTo(RowStatus.ACTIVE);
    }

    @Test
    void shouldRejectDeleteWhenStoreOwesCustomer() {
        final StoreOwner owner = createStore();
        final UUID id = createCustomer(owner.token());
        takePayment(owner.token(), id, "75.00");

        final ResponseEntity<String> response = deleteJson(customerUrl(id), owner.token());

        assertErrorResponse(response, HttpStatus.CONFLICT);
        assertThat((String) JsonPath.read(response.getBody(), "$.message")).contains("outstanding balance");
        assertThat(requireCustomerById(id).getStatus()).isEqualTo(RowStatus.ACTIVE);
    }

    @Test
    void shouldAllowCashierToDeleteCustomerInTheirStore() {
        final StoreOwner owner = createStore();
        final String cashier = signupCashierAttachedToStore(owner.storeId());
        final UUID id = createCustomer(owner.token());

        assertThat(deleteJson(customerUrl(id), cashier).getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
    }

    @Test
    void shouldReturn404ForUnknownAndForeignCustomer() {
        final StoreOwner owner = createStore();
        final UUID foreign = createCustomer(createStore().token());

        assertErrorMessage(deleteJson(customerUrl(UUID.randomUUID()), owner.token()), HttpStatus.NOT_FOUND,
                "Customer not found");
        assertErrorMessage(deleteJson(customerUrl(foreign), owner.token()), HttpStatus.NOT_FOUND,
                "Customer not found");
        assertThat(customerRepository.existsById(foreign)).isTrue();
    }

    @Test
    void shouldReturn400ForMalformedId401WithoutTokenAnd404WithoutStore() {
        final StoreOwner owner = createStore();
        final String noStore = signupAndGetToken(TestDataFactory.personName(), TestDataFactory.uniqueEmail(),
                TestDataFactory.validPassword());

        assertErrorResponse(deleteJson(CUSTOMERS_URL + "/xyz", owner.token()), HttpStatus.BAD_REQUEST);
        assertThat(deleteJson(customerUrl(UUID.randomUUID()), null).getStatusCode())
                .isEqualTo(HttpStatus.UNAUTHORIZED);
        assertErrorMessage(deleteJson(customerUrl(UUID.randomUUID()), noStore), HttpStatus.NOT_FOUND,
                "You don't have a store yet");
    }

}
