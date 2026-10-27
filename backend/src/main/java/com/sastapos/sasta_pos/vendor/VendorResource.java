package com.sastapos.sasta_pos.vendor;

import com.sastapos.sasta_pos.customer.dto.LedgerEntryDTO;
import com.sastapos.sasta_pos.ledger_entry.LedgerDirection;
import com.sastapos.sasta_pos.ledger_entry.LedgerEntryService;
import com.sastapos.sasta_pos.ledger_entry.LedgerEntryType;
import com.sastapos.sasta_pos.ledger_entry.dto.LedgerSummaryDTO;
import com.sastapos.sasta_pos.payment.PaymentService;
import com.sastapos.sasta_pos.product.dto.PageResponse;
import com.sastapos.sasta_pos.store.RowStatus;
import com.sastapos.sasta_pos.user.User;
import com.sastapos.sasta_pos.vendor.dto.CreateVendorRequestDTO;
import com.sastapos.sasta_pos.vendor.dto.DeleteVendorResponse;
import com.sastapos.sasta_pos.vendor.dto.RecordSettlementRequestDTO;
import com.sastapos.sasta_pos.vendor.dto.SettlementResponse;
import com.sastapos.sasta_pos.vendor.dto.UpdateVendorRequestDTO;
import com.sastapos.sasta_pos.vendor.dto.VendorDTO;
import com.sastapos.sasta_pos.vendor.dto.VendorDetailDTO;
import com.sastapos.sasta_pos.vendor.dto.VoidSettlementRequestDTO;
import com.sastapos.sasta_pos.vendor.dto.VoidSettlementResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
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
@RequestMapping(value = "/api/vendors", produces = MediaType.APPLICATION_JSON_VALUE)
@Tag(name = "Vendor", description = "Manage vendors, their account balances, ledger and payments")
@SecurityRequirement(name = "bearerAuth")
public class VendorResource {

    private final VendorService vendorService;
    private final LedgerEntryService ledgerEntryService;
    private final PaymentService paymentService;

    @GetMapping
    @Operation(summary = "List vendors of the user's store (filters, pagination, sorting)")
    @ApiResponse(responseCode = "200", description = "Vendors retrieved")
    @ApiResponse(responseCode = "400", description = "Invalid filter or paging parameter")
    public ResponseEntity<PageResponse<VendorDTO>> getAllVendors(
            @AuthenticationPrincipal final User user,
            @RequestParam(required = false) final String search,
            @RequestParam(required = false) final RowStatus status,
            @RequestParam(required = false) final TaxRegistrationStatus salesTaxRegistrationStatus,
            @RequestParam(required = false) final Boolean hasBalance,
            @RequestParam(required = false) final BalanceState balanceState,
            @RequestParam(required = false) final BigDecimal minBalance,
            @RequestParam(required = false) final BigDecimal maxBalance,
            @RequestParam(defaultValue = "0") final int page,
            @RequestParam(defaultValue = "20") final int size,
            @RequestParam(defaultValue = "name") final String sortBy,
            @RequestParam(defaultValue = "asc") final String sortDir) {
        final VendorService.VendorFilter filter = new VendorService.VendorFilter(
                search, status, salesTaxRegistrationStatus, hasBalance, balanceState, minBalance, maxBalance);
        return ResponseEntity.ok(vendorService.findAll(user, filter, page, size, sortBy, sortDir));
    }

    @GetMapping("/{id}")
    @Operation(summary = "Get vendor detail and history counts")
    @ApiResponse(responseCode = "200", description = "Vendor detail retrieved")
    @ApiResponse(responseCode = "404", description = "Vendor not found")
    public ResponseEntity<VendorDetailDTO> getVendor(
            @AuthenticationPrincipal final User user,
            @PathVariable(name = "id") final UUID id) {
        return ResponseEntity.ok(vendorService.get(user, id));
    }

    @PostMapping
    @Operation(summary = "Create a vendor",
            description = "Created ACTIVE with accountBalance 0.00 in the user's store.")
    @ApiResponse(responseCode = "201", description = "Vendor created")
    @ApiResponse(responseCode = "400", description = "Validation failed (blank name, STRN missing when registered, ...)")
    @ApiResponse(responseCode = "409", description = "Name already used in store, or phoneNumber already in use")
    public ResponseEntity<VendorDTO> createVendor(
            @AuthenticationPrincipal final User user,
            @RequestBody @Valid final CreateVendorRequestDTO request) {
        return new ResponseEntity<>(vendorService.create(user, request), HttpStatus.CREATED);
    }

    @PatchMapping("/{id}")
    @Operation(summary = "Update a vendor")
    @ApiResponse(responseCode = "200", description = "Vendor updated")
    @ApiResponse(responseCode = "400", description = "Validation failed")
    @ApiResponse(responseCode = "404", description = "Vendor not found")
    @ApiResponse(responseCode = "409", description = "Name or phone number conflict")
    public ResponseEntity<VendorDTO> updateVendor(
            @AuthenticationPrincipal final User user,
            @PathVariable(name = "id") final UUID id,
            @RequestBody @Valid final UpdateVendorRequestDTO request) {
        return ResponseEntity.ok(vendorService.update(user, id, request));
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Delete or deactivate a vendor")
    @ApiResponse(responseCode = "204", description = "Hard-deleted (no history)")
    @ApiResponse(responseCode = "200", description = "Soft-deleted: vendor has history")
    @ApiResponse(responseCode = "404", description = "Vendor not found")
    @ApiResponse(responseCode = "409", description = "Vendor has an outstanding balance")
    public ResponseEntity<DeleteVendorResponse> deleteVendor(
            @AuthenticationPrincipal final User user,
            @PathVariable(name = "id") final UUID id) {
        final DeleteVendorResponse result = vendorService.delete(user, id);
        return result == null ? ResponseEntity.noContent().build() : ResponseEntity.ok(result);
    }

    @PostMapping("/{id}/payments")
    @Operation(summary = "Record a settlement payment with a vendor",
            description = "INCOMING (credit, decreases balance) or OUTGOING (debit, increases balance).")
    @ApiResponse(responseCode = "201", description = "Settlement recorded")
    @ApiResponse(responseCode = "400", description = "Validation failed")
    @ApiResponse(responseCode = "404", description = "Vendor not found")
    public ResponseEntity<SettlementResponse> recordPayment(
            @AuthenticationPrincipal final User user,
            @PathVariable(name = "id") final UUID id,
            @RequestBody @Valid final RecordSettlementRequestDTO request) {
        return new ResponseEntity<>(vendorService.recordPayment(user, id, request), HttpStatus.CREATED);
    }

    @PostMapping("/{vendorId}/payments/{paymentId}/void")
    @Operation(summary = "Void a vendor standalone payment (OWNER only)")
    @ApiResponse(responseCode = "200", description = "Payment voided and reversed")
    @ApiResponse(responseCode = "400", description = "Invalid request")
    @ApiResponse(responseCode = "403", description = "OWNER authorization required")
    @ApiResponse(responseCode = "404", description = "Vendor or payment not found")
    @ApiResponse(responseCode = "409", description = "Payment already voided")
    public ResponseEntity<VoidSettlementResponse> voidPayment(
            @AuthenticationPrincipal final User user,
            @PathVariable(name = "vendorId") final UUID vendorId,
            @PathVariable(name = "paymentId") final UUID paymentId,
            @RequestBody @Valid final VoidSettlementRequestDTO request) {
        return ResponseEntity.ok(paymentService.voidStandalonePayment(user, paymentId, request));
    }

    @GetMapping("/{id}/ledger")
    @Operation(summary = "Get vendor account ledger with filters and pagination")
    public ResponseEntity<PageResponse<LedgerEntryDTO>> getLedger(
            @AuthenticationPrincipal final User user,
            @PathVariable(name = "id") final UUID id,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) final OffsetDateTime from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) final OffsetDateTime to,
            @RequestParam(required = false) final LedgerDirection direction,
            @RequestParam(required = false) final List<LedgerEntryType> type,
            @RequestParam(required = false) final UUID saleId,
            @RequestParam(required = false) final UUID paymentId,
            @RequestParam(required = false) final Boolean voided,
            @RequestParam(required = false) final Boolean isReversal,
            @RequestParam(required = false) final String referenceNumber,
            @RequestParam(required = false) final String search,
            @RequestParam(required = false) final BigDecimal minAmount,
            @RequestParam(required = false) final BigDecimal maxAmount,
            @RequestParam(defaultValue = "0") final int page,
            @RequestParam(defaultValue = "20") final int size,
            @RequestParam(defaultValue = "occurredAt") final String sortBy,
            @RequestParam(defaultValue = "desc") final String sortDir) {
        final LedgerEntryService.LedgerFilter filter = new LedgerEntryService.LedgerFilter(
                from, to, direction, type, saleId, paymentId, voided, isReversal, referenceNumber, search, minAmount, maxAmount);
        return ResponseEntity.ok(ledgerEntryService.getLedger(user, id, true, filter, page, size, sortBy, sortDir));
    }

    @GetMapping("/{id}/ledger/summary")
    @Operation(summary = "Get vendor ledger summary (opening, closing, debit/credit totals)")
    public ResponseEntity<LedgerSummaryDTO> getLedgerSummary(
            @AuthenticationPrincipal final User user,
            @PathVariable(name = "id") final UUID id,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) final OffsetDateTime from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) final OffsetDateTime to,
            @RequestParam(required = false) final LedgerDirection direction,
            @RequestParam(required = false) final List<LedgerEntryType> type,
            @RequestParam(required = false) final UUID saleId,
            @RequestParam(required = false) final UUID paymentId,
            @RequestParam(required = false) final Boolean voided,
            @RequestParam(required = false) final Boolean isReversal,
            @RequestParam(required = false) final String referenceNumber,
            @RequestParam(required = false) final String search,
            @RequestParam(required = false) final BigDecimal minAmount,
            @RequestParam(required = false) final BigDecimal maxAmount) {
        final LedgerEntryService.LedgerFilter filter = new LedgerEntryService.LedgerFilter(
                from, to, direction, type, saleId, paymentId, voided, isReversal, referenceNumber, search, minAmount, maxAmount);
        return ResponseEntity.ok(ledgerEntryService.getLedgerSummary(user, id, true, filter));
    }

}

