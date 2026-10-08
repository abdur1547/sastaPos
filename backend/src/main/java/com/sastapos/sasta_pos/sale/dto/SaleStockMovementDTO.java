package com.sastapos.sasta_pos.sale.dto;

import com.sastapos.sasta_pos.stock_movement.StockMovementType;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.Getter;
import lombok.Setter;


@Getter
@Setter
public class SaleStockMovementDTO {

    private UUID id;
    private StockMovementType type;
    private BigDecimal quantity;
    private BigDecimal quantityBefore;
    private BigDecimal quantityAfter;
    private String description;
    private UUID productId;
    private UUID saleId;
    private UUID saleItemId;
    private OffsetDateTime createdAt;

}
