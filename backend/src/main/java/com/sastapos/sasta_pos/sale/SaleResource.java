package com.sastapos.sasta_pos.sale;

import com.sastapos.sasta_pos.payment.PaymentMethod;
import com.sastapos.sasta_pos.product.dto.PageResponse;
import com.sastapos.sasta_pos.sale.dto.CreateSaleRequestDTO;
import com.sastapos.sasta_pos.sale.dto.SaleDTO;
import com.sastapos.sasta_pos.sale.dto.SaleSummaryDTO;
import com.sastapos.sasta_pos.sale.dto.UpdateSaleRequestDTO;
import com.sastapos.sasta_pos.sale.dto.VoidSaleRequestDTO;
import com.sastapos.sasta_pos.sale.dto.VoidSaleResponse;
import com.sastapos.sasta_pos.user.User;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;


@RestController
@RequiredArgsConstructor
@RequestMapping(value = "/api/sales", produces = MediaType.APPLICATION_JSON_VALUE)
@Tag(name = "Sale", description = "Create, list, finalise and void sales of the authenticated user's store. "
        + "Taxes are always added on top of prices; all money has 2 decimals. Error responses use the "
        + "shared ApiErrorResponse body: 400 validation/total mismatch, 403 not allowed, 404 unknown "
        + "(or foreign) resource, 409 insufficient stock or invalid state.")
@SecurityRequirement(name = "bearerAuth")
public class SaleResource {

    private final SaleService saleService;

    @GetMapping
    @Operation(summary = "List sales of the user's store (filters, pagination, sorting)",
            description = "All filters are optional and AND-ed. VOIDED sales are hidden unless "
                    + "saleStatus explicitly includes VOIDED. Multi-value filters accept repeated or "
                    + "comma-separated values (e.g. saleStatus=COMPLETED,IN_PROGRESS). size is capped at "
                    + SaleService.MAX_PAGE_SIZE + ".")
    @ApiResponse(responseCode = "200", description = "Page of sales")
    @ApiResponse(responseCode = "400", description = "Invalid filter, range, enum value, sortBy or sortDir")
    public ResponseEntity<PageResponse<SaleDTO>> getAllSales(
            @AuthenticationPrincipal final User user,
            @Parameter(description = "soldAt >= from (ISO local date-time, store time), e.g. 2026-01-31T00:00:00")
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) final LocalDateTime from,
            @Parameter(description = "soldAt <= to (ISO local date-time, store time)")
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) final LocalDateTime to,
            @Parameter(description = "COMPLETED, IN_PROGRESS and/or VOIDED (default: all but VOIDED)")
            @RequestParam(required = false) final List<SaleStatus> saleStatus,
            @RequestParam(required = false) final List<SaleType> saleType,
            @RequestParam(required = false) final UUID customerId,
            @Parameter(description = "Cashier/staff member who made the sale")
            @RequestParam(required = false) final UUID userId,
            @Parameter(description = "Case-insensitive 'contains' match, e.g. INV-2024")
            @RequestParam(required = false) final String invoiceNumber,
            @Parameter(description = "Sales containing at least one item of this product")
            @RequestParam(required = false) final UUID productId,
            @Parameter(description = "Sales having at least one payment with one of these methods")
            @RequestParam(required = false) final List<PaymentMethod> paymentMethod,
            @RequestParam(required = false) final BigDecimal minTotalAmount,
            @RequestParam(required = false) final BigDecimal maxTotalAmount,
            @Parameter(description = "true: outstanding credit (remaining > 0); false: fully settled")
            @RequestParam(required = false) final Boolean hasRemaining,
            @Parameter(description = "Free text over invoice number and customer name")
            @RequestParam(required = false) final String search,
            @Parameter(description = "0-indexed page") @RequestParam(defaultValue = "0") final int page,
            @Parameter(description = "Page size, capped at 100") @RequestParam(defaultValue = "20") final int size,
            @Parameter(description = "soldAt, totalAmount, remaining or invoiceNumber")
            @RequestParam(defaultValue = "soldAt") final String sortBy,
            @Parameter(description = "asc or desc") @RequestParam(defaultValue = "desc") final String sortDir) {
        final SaleFilter filter = new SaleFilter(from, to, saleStatus, saleType,
                customerId, userId, invoiceNumber, productId, paymentMethod, minTotalAmount, maxTotalAmount,
                hasRemaining, search);
        return ResponseEntity.ok(saleService.findAll(user, filter, page, size, sortBy, sortDir));
    }

    @GetMapping("/summary")
    @Operation(summary = "Sales register totals for the same filters as the list",
            description = "Accepts every filter of GET /api/sales (pagination and sorting are ignored). "
                    + "Money totals cover COMPLETED sales; VOIDED sales are counted separately and "
                    + "IN_PROGRESS drafts are never included.")
    @ApiResponse(responseCode = "200", description = "Register totals")
    @ApiResponse(responseCode = "400", description = "Invalid filter, range or enum value")
    public ResponseEntity<SaleSummaryDTO> getSalesSummary(
            @AuthenticationPrincipal final User user,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) final LocalDateTime from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) final LocalDateTime to,
            @Parameter(description = "COMPLETED and/or VOIDED (default: both)")
            @RequestParam(required = false) final List<SaleStatus> saleStatus,
            @RequestParam(required = false) final List<SaleType> saleType,
            @RequestParam(required = false) final UUID customerId,
            @RequestParam(required = false) final UUID userId,
            @RequestParam(required = false) final String invoiceNumber,
            @RequestParam(required = false) final UUID productId,
            @RequestParam(required = false) final List<PaymentMethod> paymentMethod,
            @RequestParam(required = false) final BigDecimal minTotalAmount,
            @RequestParam(required = false) final BigDecimal maxTotalAmount,
            @RequestParam(required = false) final Boolean hasRemaining,
            @RequestParam(required = false) final String search) {
        final SaleFilter filter = new SaleFilter(from, to, saleStatus, saleType,
                customerId, userId, invoiceNumber, productId, paymentMethod, minTotalAmount, maxTotalAmount,
                hasRemaining, search);
        return ResponseEntity.ok(saleService.summarize(user, filter));
    }

    @GetMapping("/{id}")
    @Operation(summary = "Get a sale with its items, payments and customer")
    @ApiResponse(responseCode = "404", description = "Sale not found in the user's store")
    public ResponseEntity<SaleDTO> getSale(@AuthenticationPrincipal final User user,
            @PathVariable(name = "id") final UUID id) {
        return ResponseEntity.ok(saleService.get(user, id));
    }

    @PostMapping
    @ApiResponse(responseCode = "201", description = "Sale created")
    @ApiResponse(responseCode = "400", description = "Validation failed or client totals do not match the "
            + "server-computed values")
    @ApiResponse(responseCode = "404", description = "Product or customer not found in the user's store")
    @ApiResponse(responseCode = "409", description = "Insufficient stock for a product")
    @Operation(summary = "Create a sale",
            description = "With saleStatus COMPLETED (default) the whole request is validated and, "
                    + "atomically, an invoice number is allocated, stock is deducted (one SALE stock "
                    + "movement per item), payments are stored and, if a customer is attached, the ledger "
                    + "and account balance are updated. With saleStatus IN_PROGRESS a draft is saved "
                    + "without any of those side effects (no stock check, no invoice number). "
                    + "Server math: line = unitPrice x quantity; tax = line x sum(tax category rates); "
                    + "total = subtotal - discount + tax. totalPrice must equal that total. "
                    + "snake_case aliases (sale_type, customer_id, sale_items, ...) are also accepted.")
    public ResponseEntity<SaleDTO> createSale(@AuthenticationPrincipal final User user,
            @RequestBody @Valid final CreateSaleRequestDTO request) {
        return new ResponseEntity<>(saleService.create(user, request), HttpStatus.CREATED);
    }

    @PutMapping("/{id}")
    @Operation(summary = "Replace a draft sale (optionally finalise it)",
            description = "Only IN_PROGRESS sales can be replaced. Send saleStatus COMPLETED to finalise "
                    + "the draft, which runs every create-time validation including the stock check. "
                    + "COMPLETED and VOIDED sales answer 409: void and recreate instead.")
    @ApiResponse(responseCode = "409", description = "Sale is not a draft, or insufficient stock when finalising")
    public ResponseEntity<SaleDTO> updateSale(@AuthenticationPrincipal final User user,
            @PathVariable(name = "id") final UUID id, @RequestBody @Valid final CreateSaleRequestDTO request) {
        return ResponseEntity.ok(saleService.update(user, id, request));
    }

    @PatchMapping("/{id}")
    @Operation(summary = "Edit sale metadata (description, payment reference/description)",
            description = "Safe, non-financial corrections that have no stock or ledger side effects. "
                    + "Sending items, discount, customer, sale type, status or payment amount/method "
                    + "answers 409 pointing to void-and-recreate. VOIDED sales are read-only.")
    @ApiResponse(responseCode = "404", description = "Sale or payment not found")
    @ApiResponse(responseCode = "409", description = "Sale is voided or a financial field was sent")
    public ResponseEntity<SaleDTO> patchSale(@AuthenticationPrincipal final User user,
            @PathVariable(name = "id") final UUID id, @RequestBody @Valid final UpdateSaleRequestDTO request) {
        return ResponseEntity.ok(saleService.patch(user, id, request));
    }

    @PostMapping("/{id}/void")
    @Operation(summary = "Void a sale (soft delete with reversing entries)",
            description = "Marks the sale VOIDED and, for a COMPLETED sale, appends reversing "
                    + "ADJUSTMENT_IN stock movements and (with a customer) reversing ADJUSTMENT ledger "
                    + "entries that restore the customer's balance. Nothing is deleted. Allowed for the "
                    + "store OWNER, or the CASHIER who made the sale on the same day.")
    @ApiResponse(responseCode = "403", description = "Caller may not void this sale")
    @ApiResponse(responseCode = "409", description = "Sale is already voided")
    public ResponseEntity<VoidSaleResponse> voidSale(@AuthenticationPrincipal final User user,
            @PathVariable(name = "id") final UUID id, @RequestBody @Valid final VoidSaleRequestDTO request) {
        return ResponseEntity.ok(saleService.voidSale(user, id, request));
    }

}
