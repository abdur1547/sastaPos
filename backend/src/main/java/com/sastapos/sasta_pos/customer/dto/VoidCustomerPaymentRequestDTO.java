package com.sastapos.sasta_pos.customer.dto;

import com.sastapos.sasta_pos.product.dto.StrictRequestDTO;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;


@Getter
@Setter
public class VoidCustomerPaymentRequestDTO extends StrictRequestDTO {

    @NotBlank
    @Size(max = 1000)
    @Schema(description = "Why the payment is voided", example = "Cheque bounced")
    private String voidReason;

}
