package com.sastapos.sasta_pos.product.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.util.Set;
import java.util.UUID;
import lombok.Getter;
import lombok.Setter;


/** Unknown properties are rejected (see StrictRequestDTO). */
@Getter
@Setter
public class CreateProductRequestDTO extends StrictRequestDTO {

    @NotBlank
    @Size(max = 255)
    private String name;

    @Size(max = 255)
    @Pattern(regexp = ".*\\S.*", message = "must not be blank")
    private String sku;

    @Size(max = 255)
    @Pattern(regexp = ".*\\S.*", message = "must not be blank")
    private String barCode;

    @NotBlank
    @Size(max = 255)
    private String pctCode;

    @Size(max = 5000)
    private String description;

    @NotNull
    @DecimalMin("0.00")
    @Digits(integer = 16, fraction = 2)
    private BigDecimal unitPrice;

    @DecimalMin("0.00")
    @Digits(integer = 16, fraction = 2)
    private BigDecimal stockQuantity;

    @NotNull
    private UUID unitOfMeasureId;

    @Size(max = 50)
    private Set<@NotNull UUID> taxCategoryIds;

}
