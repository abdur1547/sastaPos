package com.sastapos.sasta_pos.product.dto;

import com.sastapos.sasta_pos.stock_movement.StockMovementType;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.Getter;
import lombok.Setter;


@Getter
@Setter
public class StockMovementResponseDTO {

    private UUID id;
    private StockMovementType type;
    private BigDecimal quantity;
    private BigDecimal quantityBefore;
    private BigDecimal quantityAfter;
    private String description;
    private UUID productId;
    private UUID storeId;
    private OffsetDateTime createdAt;

}
