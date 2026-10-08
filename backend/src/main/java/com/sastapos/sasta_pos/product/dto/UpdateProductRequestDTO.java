package com.sastapos.sasta_pos.product.dto;

import com.sastapos.sasta_pos.store.RowStatus;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.util.Set;
import java.util.UUID;
import lombok.Getter;
import lombok.Setter;


/**
 * Partial update: omitted/null fields are left unchanged. {@code stockQuantity} is deliberately
 * absent — stock only changes through stock movements — and unknown properties are rejected.
 */
@Getter
@Setter
public class UpdateProductRequestDTO extends StrictRequestDTO {

    @Size(max = 255)
    @Pattern(regexp = ".*\\S.*", message = "must not be blank")
    private String name;

    @Size(max = 255)
    @Pattern(regexp = ".*\\S.*", message = "must not be blank")
    private String sku;

    @Size(max = 255)
    @Pattern(regexp = ".*\\S.*", message = "must not be blank")
    private String barCode;

    @Size(max = 255)
    @Pattern(regexp = ".*\\S.*", message = "must not be blank")
    private String pctCode;

    @Size(max = 5000)
    private String description;

    @DecimalMin("0.00")
    @Digits(integer = 16, fraction = 2)
    private BigDecimal unitPrice;

    private UUID unitOfMeasureId;

    @Size(max = 50)
    private Set<@NotNull UUID> taxCategoryIds;

    private RowStatus status;

}
