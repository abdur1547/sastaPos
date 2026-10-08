package com.sastapos.sasta_pos.product.dto;

import com.sastapos.sasta_pos.store.RowStatus;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.Set;
import java.util.UUID;
import lombok.Getter;
import lombok.Setter;


@Getter
@Setter
public class ProductDTO {

    private UUID id;
    private String name;
    private String sku;
    private String barCode;
    private String pctCode;
    private String description;
    private BigDecimal unitPrice;
    private BigDecimal stockQuantity;
    private RowStatus status;
    private UUID unitOfMeasureId;
    private Set<UUID> taxCategoryIds;
    private UUID storeId;
    private OffsetDateTime createdAt;
    private OffsetDateTime lastUpdated;

}
