package com.sastapos.sasta_pos.customer.dto;

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
@Schema(description = "A payment received from a customer against their account as a whole")
public class CreateCustomerPaymentRequestDTO extends StrictRequestDTO {

    @NotNull
    @DecimalMin(value = "0.00", inclusive = false)
    @Digits(integer = 16, fraction = 2)
    @Schema(description = "Amount received; may exceed the balance (the customer is then in credit)", example = "1500.00")
    private BigDecimal amount;

    @NotNull
    @Schema(description = "How the money was received (CREDIT is not a payment method)")
    private CustomerPaymentMethod method;

    @Size(max = 255)
    @Schema(description = "Optional external reference, e.g. a bank transfer id", example = "TRX-1001")
    private String referenceNumber;

    @Size(max = 1000)
    private String description;

}
