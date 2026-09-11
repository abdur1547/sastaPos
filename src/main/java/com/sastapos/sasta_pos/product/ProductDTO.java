package com.sastapos.sasta_pos.product;

import com.sastapos.sasta_pos.store.RowStatus;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.UUID;
import lombok.Getter;
import lombok.Setter;


@Getter
@Setter
public class ProductDTO {

    private UUID id;

    @NotNull
    @Size(max = 255)
    @ProductNameUnique
    private String name;

    @NotNull
    @Size(max = 255)
    @ProductSkuUnique
    private String sku;

    @NotNull
    @Size(max = 255)
    @ProductBarcodeUnique
    private String barcode;

    private String description;

    @NotNull
    private Double sellingPrice;

    @NotNull
    private Double taxRate;

    @NotNull
    private Double stockQuantity;

    @NotNull
    private RowStatus status;

    @NotNull
    private UUID unitsOfMeasure;

    @NotNull
    private UUID taxCategory;

    private UUID store;

}
