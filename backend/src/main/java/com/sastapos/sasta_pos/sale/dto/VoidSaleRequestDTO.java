package com.sastapos.sasta_pos.sale.dto;

import com.sastapos.sasta_pos.product.dto.StrictRequestDTO;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;


@Getter
@Setter
public class VoidSaleRequestDTO extends StrictRequestDTO {

    @NotBlank
    @Size(max = 1000)
    @Schema(description = "Durable explanation of the void", example = "Wrong item scanned, corrected in INV-42")
    private String voidReason;

}
