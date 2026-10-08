package com.sastapos.sasta_pos.sale.dto;

import com.sastapos.sasta_pos.product.dto.StrictRequestDTO;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;
import lombok.Getter;
import lombok.Setter;


/**
 * Metadata-only edit. Financial fields are declared so that sending them yields a clear
 * "void and recreate" error rather than a generic unknown-property failure.
 */
@Getter
@Setter
@Schema(description = "Non-financial edit of a sale: only descriptions and payment references can change")
public class UpdateSaleRequestDTO extends StrictRequestDTO {

    @Size(max = 1000)
    private String description;

    @Valid
    @Size(max = 50)
    private List<@NotNull PaymentMetadataDTO> payments;

    @Schema(hidden = true)
    private Object saleItems;
    @Schema(hidden = true)
    private Object discount;
    @Schema(hidden = true)
    private Object customerId;
    @Schema(hidden = true)
    private Object saleType;
    @Schema(hidden = true)
    private Object saleStatus;

    @Getter
    @Setter
    @Schema(description = "Reference/description fix for an existing payment")
    public static class PaymentMetadataDTO extends StrictRequestDTO {

        @NotNull
        private java.util.UUID id;

        @Size(max = 255)
        private String referenceNumber;

        @Size(max = 1000)
        private String description;

        @Schema(hidden = true)
        private Object amount;
        @Schema(hidden = true)
        private Object method;

    }

    public boolean hasFinancialChange() {
        return saleItems != null || discount != null || customerId != null || saleType != null
                || saleStatus != null
                || (payments != null && payments.stream().anyMatch(p -> p.amount != null || p.method != null));
    }

}
