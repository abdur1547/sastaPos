package com.sastapos.sasta_pos.product.dto;

import com.sastapos.sasta_pos.stock_movement.StockMovementType;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import lombok.Getter;
import lombok.Setter;


@Getter
@Setter
public class CreateStockMovementRequestDTO extends StrictRequestDTO {

    @NotNull
    private StockMovementType type;

    @NotNull
    @DecimalMin(value = "0.00", inclusive = false)
    @Digits(integer = 16, fraction = 2)
    private BigDecimal quantity;

    @NotBlank
    @Size(max = 1000)
    private String description;

}
