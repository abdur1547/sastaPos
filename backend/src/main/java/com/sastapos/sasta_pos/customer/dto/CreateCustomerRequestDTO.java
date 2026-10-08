package com.sastapos.sasta_pos.customer.dto;

import com.sastapos.sasta_pos.product.dto.StrictRequestDTO;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;


@Getter
@Setter
@Schema(description = "Create a customer. accountBalance and status are server-controlled; unknown properties are rejected.")
public class CreateCustomerRequestDTO extends StrictRequestDTO {

    @NotBlank
    @Size(max = 255)
    @Schema(description = "Customer name, unique (case-insensitive) within the store", example = "Ali Traders")
    private String name;

    @Size(max = 50)
    @Schema(description = "Optional phone number, unique across all stores. A blank value is stored as null.",
            example = "+923001234567")
    private String phoneNumber;

    @Size(max = 255)
    @Schema(description = "Optional National Tax Number. A blank value is stored as null.", example = "1234567-8")
    private String ntn;

}
