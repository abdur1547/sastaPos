package com.sastapos.sasta_pos.store.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;


@Getter
@Setter
public class CreateStoreRequest {

    @NotBlank
    @Size(max = 255)
    private String name;

    @NotBlank
    @Size(max = 255)
    private String ntn;

    @Size(max = 1000)
    @Schema(
        description = "Physical address of the store",
        example = "123 Main Street, Islamabad",
        requiredMode = Schema.RequiredMode.NOT_REQUIRED
    )
    private String address;

    @Size(max = 10)
    @Schema(
        description = "Currency code of the store",
        example = "PKR",
        requiredMode = Schema.RequiredMode.NOT_REQUIRED
    )
    private String currencyCode;

    @Size(max = 100)
    @Schema(
        description = "IANA timezone identifier",
        example = "Asia/Karachi",
        defaultValue = "Asia/Karachi",
        requiredMode = Schema.RequiredMode.NOT_REQUIRED
    )
    private String timezone;

}
