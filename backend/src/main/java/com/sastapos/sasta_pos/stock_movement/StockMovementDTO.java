package com.sastapos.sasta_pos.stock_movement;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.UUID;
import lombok.Getter;
import lombok.Setter;


@Getter
@Setter
public class StockMovementDTO {

    private UUID id;

    @NotNull
    private StockMovementType type;

    @NotNull
    private Double quantity;

    @NotNull
    private Double quantityBefore;

    @NotNull
    private Double quantityAfter;

    @NotNull
    @Size(max = 255)
    private String referenceType;

    @NotNull
    private String reason;

    private UUID product;

    private UUID store;

}
