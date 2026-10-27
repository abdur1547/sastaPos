package com.sastapos.sasta_pos.payment;

import com.sastapos.sasta_pos.payment.dto.PaymentDTO;
import com.sastapos.sasta_pos.product.dto.PageResponse;
import com.sastapos.sasta_pos.user.User;
import com.sastapos.sasta_pos.vendor.dto.VoidSettlementRequestDTO;
import com.sastapos.sasta_pos.vendor.dto.VoidSettlementResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@RequestMapping(value = "/api/payments", produces = MediaType.APPLICATION_JSON_VALUE)
@Tag(name = "Payment", description = "Payments and standalone settlement management")
@SecurityRequirement(name = "bearerAuth")
public class PaymentResource {

    private final PaymentService paymentService;

    @GetMapping
    @Operation(summary = "List store payments with filters, pagination and sorting")
    @ApiResponse(responseCode = "200", description = "Payments retrieved")
    @ApiResponse(responseCode = "400", description = "Invalid filter or parameters")
    public ResponseEntity<PageResponse<PaymentDTO>> getAllPayments(
            @AuthenticationPrincipal final User user,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) final OffsetDateTime from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) final OffsetDateTime to,
            @RequestParam(required = false) final UUID customerId,
            @RequestParam(required = false) final UUID vendorId,
            @RequestParam(required = false) final UUID saleId,
            @RequestParam(required = false) final UUID userId,
            @RequestParam(required = false) final PaymentDirection direction,
            @RequestParam(required = false) final PaymentMethod method,
            @RequestParam(required = false) final Boolean voided,
            @RequestParam(required = false) final BigDecimal minAmount,
            @RequestParam(required = false) final BigDecimal maxAmount,
            @RequestParam(required = false) final String search,
            @RequestParam(defaultValue = "0") final int page,
            @RequestParam(defaultValue = "20") final int size,
            @RequestParam(defaultValue = "occurredAt") final String sortBy,
            @RequestParam(defaultValue = "desc") final String sortDir) {
        final PaymentService.PaymentFilter filter = new PaymentService.PaymentFilter(
                from, to, customerId, vendorId, saleId, userId, direction, method, voided, minAmount, maxAmount, search);
        return ResponseEntity.ok(paymentService.findAll(user, filter, page, size, sortBy, sortDir));
    }

    @GetMapping("/{id}")
    @Operation(summary = "Get payment details by ID")
    @ApiResponse(responseCode = "200", description = "Payment retrieved")
    @ApiResponse(responseCode = "404", description = "Payment not found")
    public ResponseEntity<PaymentDTO> getPayment(
            @AuthenticationPrincipal final User user,
            @PathVariable(name = "id") final UUID id) {
        return ResponseEntity.ok(paymentService.get(user, id));
    }

    @PostMapping("/{id}/void")
    @Operation(summary = "Void a standalone payment (OWNER only)")
    @ApiResponse(responseCode = "200", description = "Payment voided and reversed")
    @ApiResponse(responseCode = "400", description = "Invalid request or document-linked payment")
    @ApiResponse(responseCode = "403", description = "OWNER authorization required")
    @ApiResponse(responseCode = "404", description = "Payment not found")
    @ApiResponse(responseCode = "409", description = "Payment already voided")
    public ResponseEntity<VoidSettlementResponse> voidPayment(
            @AuthenticationPrincipal final User user,
            @PathVariable(name = "id") final UUID id,
            @RequestBody @Valid final VoidSettlementRequestDTO request) {
        return ResponseEntity.ok(paymentService.voidStandalonePayment(user, id, request));
    }

}

