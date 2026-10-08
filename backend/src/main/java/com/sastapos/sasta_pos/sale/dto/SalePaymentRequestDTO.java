package com.sastapos.sasta_pos.sale.dto;

import com.sastapos.sasta_pos.payment.PaymentMethod;
import com.sastapos.sasta_pos.product.dto.StrictRequestDTO;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import lombok.Getter;
import lombok.Setter;


@Getter
@Setter
@Schema(description = "Money received at the time of the sale")
public class SalePaymentRequestDTO extends StrictRequestDTO {

    @NotNull
    @DecimalMin(value = "0.00", inclusive = false)
    @Digits(integer = 16, fraction = 2)
    @Schema(example = "500.00")
    private BigDecimal amount;

    @Schema(description = "CASH (default) or BANK. CREDIT is derived by the backend and rejected here",
            allowableValues = {"CASH", "BANK"}, defaultValue = "CASH")
    private PaymentMethod method;

    @Size(max = 255)
    @Schema(description = "External reference, e.g. a bank transfer id", example = "TRX-1001")
    private String referenceNumber;

    @Size(max = 1000)
    private String description;

}
