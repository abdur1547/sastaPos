package com.sastapos.sasta_pos.sale.dto;

import com.fasterxml.jackson.annotation.JsonAlias;
import com.sastapos.sasta_pos.product.dto.StrictRequestDTO;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;
import java.util.UUID;
import lombok.Getter;
import lombok.Setter;


@Getter
@Setter
@Schema(description = "One product line of a sale")
public class SaleItemRequestDTO extends StrictRequestDTO {

    @NotNull
    @JsonAlias("product_id")
    @Schema(description = "Active product of the caller's store; must be unique within the sale")
    private UUID productId;

    @NotNull
    @DecimalMin(value = "0.00", inclusive = false)
    @Digits(integer = 16, fraction = 2)
    @Schema(description = "Quantity sold (max 2 decimals); must be a whole number when the product's unit "
            + "of measure does not allow fractions", example = "2")
    private BigDecimal quantity;

    @NotNull
    @DecimalMin("0.00")
    @Digits(integer = 16, fraction = 2)
    @JsonAlias("item_total")
    @Schema(description = "Client-computed unitPrice * quantity (before tax); only used to detect "
            + "stale prices, must match the server-computed value at 2-decimal precision", example = "21.00")
    private BigDecimal itemTotal;

}
