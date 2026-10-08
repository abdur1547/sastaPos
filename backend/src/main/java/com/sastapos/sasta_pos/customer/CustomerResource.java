package com.sastapos.sasta_pos.customer;

import com.sastapos.sasta_pos.customer.dto.CreateCustomerPaymentRequestDTO;
import com.sastapos.sasta_pos.customer.dto.CreateCustomerRequestDTO;
import com.sastapos.sasta_pos.customer.dto.CustomerDTO;
import com.sastapos.sasta_pos.customer.dto.CustomerPaymentResponse;
import com.sastapos.sasta_pos.customer.dto.DeleteCustomerResponse;
import com.sastapos.sasta_pos.customer.dto.UpdateCustomerRequestDTO;
import com.sastapos.sasta_pos.customer.dto.VoidCustomerPaymentRequestDTO;
import com.sastapos.sasta_pos.customer.dto.VoidCustomerPaymentResponse;
import com.sastapos.sasta_pos.product.dto.PageResponse;
import com.sastapos.sasta_pos.store.RowStatus;
import com.sastapos.sasta_pos.user.User;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.math.BigDecimal;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;


@RestController
@RequiredArgsConstructor
@RequestMapping(value = "/api/customers", produces = MediaType.APPLICATION_JSON_VALUE)
@Tag(name = "Customer", description = "Manage customers, their account balance and payments for the authenticated user's store")
@SecurityRequirement(name = "bearerAuth")
public class CustomerResource {

    private final CustomerService customerService;

    @GetMapping
    @Operation(summary = "List customers of the user's store (filters, pagination, sorting)",
            description = "Filters are optional and AND-ed. Deactivated customers are only returned when status=INACTIVE. "
                    + "size is capped at 100. sortBy: name | accountBalance | createdAt; sortDir: asc | desc.")
    @ApiResponse(responseCode = "400", description = "Invalid filter, range, enum value or paging/sorting parameter")
    @ApiResponse(responseCode = "404", description = "The user has no store yet")
    public ResponseEntity<PageResponse<CustomerDTO>> getAllCustomers(
            @AuthenticationPrincipal final User user,
            @Parameter(description = "Case-insensitive match on name, phoneNumber or ntn")
            @RequestParam(required = false) final String search,
            @Parameter(description = "Defaults to ACTIVE") @RequestParam(required = false) final RowStatus status,
            @Parameter(description = "true: balance != 0, false: balance == 0")
            @RequestParam(required = false) final Boolean hasBalance,
            @RequestParam(required = false) final BigDecimal minBalance,
            @RequestParam(required = false) final BigDecimal maxBalance,
            @RequestParam(defaultValue = "0") final int page,
            @RequestParam(defaultValue = "20") final int size,
            @RequestParam(defaultValue = "name") final String sortBy,
            @RequestParam(defaultValue = "asc") final String sortDir) {
        final CustomerService.CustomerFilter filter = new CustomerService.CustomerFilter(search, status,
                hasBalance, minBalance, maxBalance);
        return ResponseEntity.ok(customerService.findAll(user, filter, page, size, sortBy, sortDir));
    }

    @GetMapping("/{id}")
    @Operation(summary = "Get a customer of the user's store")
    @ApiResponse(responseCode = "404", description = "Customer not found in the user's store")
    public ResponseEntity<CustomerDTO> getCustomer(@AuthenticationPrincipal final User user,
            @PathVariable(name = "id") final UUID id) {
        return ResponseEntity.ok(customerService.get(user, id));
    }

    @PostMapping
    @Operation(summary = "Add a customer",
            description = "Created ACTIVE with accountBalance 0.00 in the user's store.")
    @ApiResponse(responseCode = "201", description = "Customer created")
    @ApiResponse(responseCode = "400", description = "Validation failed (blank name, unknown property, ...)")
    @ApiResponse(responseCode = "404", description = "The user has no store yet")
    @ApiResponse(responseCode = "409", description = "Name already used in the store, or phoneNumber already used")
    public ResponseEntity<CustomerDTO> createCustomer(@AuthenticationPrincipal final User user,
            @RequestBody @Valid final CreateCustomerRequestDTO request) {
        return new ResponseEntity<>(customerService.create(user, request), HttpStatus.CREATED);
    }

    @PatchMapping("/{id}")
    @Operation(summary = "Partially update a customer (accountBalance is not editable)",
            description = "Setting status=ACTIVE reactivates a deactivated customer; status=INACTIVE hides it "
                    + "without any balance check. A blank phoneNumber or ntn clears the value.")
    @ApiResponse(responseCode = "400", description = "Validation failed (blank name, unknown status or property such as accountBalance)")
    @ApiResponse(responseCode = "404", description = "Customer not found in the user's store")
    @ApiResponse(responseCode = "409", description = "Name already used in the store, or phoneNumber already used")
    public ResponseEntity<CustomerDTO> updateCustomer(@AuthenticationPrincipal final User user,
            @PathVariable(name = "id") final UUID id,
            @RequestBody @Valid final UpdateCustomerRequestDTO request) {
        return ResponseEntity.ok(customerService.update(user, id, request));
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Delete a customer, or deactivate it when it has history",
            description = "Hard delete only for a zero-balance customer with no sales and no ledger entries; "
                    + "a zero-balance customer with history is set to INACTIVE; a non-zero balance is rejected.")
    @ApiResponse(responseCode = "204", description = "Hard-deleted (no history)")
    @ApiResponse(responseCode = "200", description = "Soft-deleted: customer has sale/ledger history")
    @ApiResponse(responseCode = "404", description = "Customer not found in the user's store")
    @ApiResponse(responseCode = "409", description = "Customer has an outstanding balance")
    public ResponseEntity<DeleteCustomerResponse> deleteCustomer(@AuthenticationPrincipal final User user,
            @PathVariable(name = "id") final UUID id) {
        final DeleteCustomerResponse result = customerService.delete(user, id);
        return result == null ? ResponseEntity.noContent().build() : ResponseEntity.ok(result);
    }

    @PostMapping("/{id}/payments")
    @Operation(summary = "Take a payment from a customer",
            description = "Posts a CREDIT/PAYMENT ledger entry and decreases accountBalance by amount. "
                    + "Overpayment is allowed and leaves a negative balance (the store owes the customer).")
    @ApiResponse(responseCode = "201", description = "Payment recorded; returns the ledger entry and updated customer")
    @ApiResponse(responseCode = "400", description = "amount <= 0, invalid method (CASH or BANK only), unknown property")
    @ApiResponse(responseCode = "404", description = "Customer not found in the user's store")
    public ResponseEntity<CustomerPaymentResponse> takePayment(@AuthenticationPrincipal final User user,
            @PathVariable(name = "id") final UUID id,
            @RequestBody @Valid final CreateCustomerPaymentRequestDTO request) {
        return new ResponseEntity<>(customerService.takePayment(user, id, request), HttpStatus.CREATED);
    }

    @PostMapping("/{customerId}/payments/{ledgerEntryId}/void")
    @Operation(summary = "Void a customer payment (OWNER only)",
            description = "Flags the payment as voided and posts a reversing DEBIT/ADJUSTMENT entry, "
                    + "increasing accountBalance by the original amount. Nothing is deleted.")
    @ApiResponse(responseCode = "200", description = "Voided entry, reversing entry and updated customer")
    @ApiResponse(responseCode = "400", description = "Blank voidReason, or the entry is not a PAYMENT")
    @ApiResponse(responseCode = "403", description = "Only an OWNER may void payments")
    @ApiResponse(responseCode = "404", description = "Customer or payment not found in the user's store")
    @ApiResponse(responseCode = "409", description = "Payment is already voided")
    public ResponseEntity<VoidCustomerPaymentResponse> voidPayment(@AuthenticationPrincipal final User user,
            @PathVariable(name = "customerId") final UUID customerId,
            @PathVariable(name = "ledgerEntryId") final UUID ledgerEntryId,
            @RequestBody @Valid final VoidCustomerPaymentRequestDTO request) {
        return ResponseEntity.ok(customerService.voidPayment(user, customerId, ledgerEntryId, request));
    }

}
