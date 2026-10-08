package com.sastapos.sasta_pos.sale.dto;

import com.fasterxml.jackson.annotation.JsonAlias;
import com.sastapos.sasta_pos.product.dto.StrictRequestDTO;
import com.sastapos.sasta_pos.sale.SaleStatus;
import com.sastapos.sasta_pos.sale.SaleType;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
import lombok.Getter;
import lombok.Setter;


/** Body of {@code POST /api/sales} and (full replace) {@code PUT /api/sales/{id}}. */
@Getter
@Setter
@Schema(description = "A sale. The totals are client-computed and only used for validation: the server "
        + "recomputes everything from current product prices and taxes and rejects any mismatch.")
public class CreateSaleRequestDTO extends StrictRequestDTO {

    @NotNull
    @JsonAlias("sale_type")
    @Schema(description = "DEBIT: must be fully paid now. CREDIT: requires a customer, any unpaid remainder "
            + "is added to the customer's account balance")
    private SaleType saleType;

    @JsonAlias("customer_id")
    @Schema(description = "Active customer of the caller's store; required for CREDIT, optional for DEBIT")
    private UUID customerId;

    @DecimalMin("0.00")
    @Digits(integer = 16, fraction = 2)
    @Schema(description = "Discount on the pre-tax subtotal; defaults to 0 and may not exceed the subtotal",
            example = "0.00")
    private BigDecimal discount;

    @JsonAlias("sale_status")
    @Schema(description = "COMPLETED (default) commits stock, ledger and an invoice number immediately. "
            + "IN_PROGRESS saves an editable draft without any side effects. VOIDED is not accepted.",
            allowableValues = {"COMPLETED", "IN_PROGRESS"}, defaultValue = "COMPLETED")
    private SaleStatus saleStatus;

    @Size(max = 1000)
    @Schema(description = "Optional internal note")
    private String description;

    @NotEmpty
    @Size(max = 500)
    @Valid
    @JsonAlias("sale_items")
    private List<@NotNull SaleItemRequestDTO> saleItems;

    @Valid
    @Size(max = 50)
    @Schema(description = "Payments received now; may be empty for a CREDIT sale")
    private List<@NotNull SalePaymentRequestDTO> payments;

    @NotNull
    @PositiveOrZero
    @JsonAlias("total_items")
    @Schema(description = "Must equal saleItems.length", example = "2")
    private Integer totalItems;

    @NotNull
    @DecimalMin("0.00")
    @Digits(integer = 16, fraction = 2)
    @JsonAlias("total_price")
    @Schema(description = "Must equal the server-computed grand total: subtotal - discount + tax",
            example = "24.57")
    private BigDecimal totalPrice;

    @NotNull
    @DecimalMin("0.00")
    @Digits(integer = 16, fraction = 2)
    @JsonAlias("total_paid_price")
    @Schema(description = "Must equal the sum of payments[].amount", example = "24.57")
    private BigDecimal totalPaidPrice;

}
