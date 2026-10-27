package com.sastapos.sasta_pos.vendor.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class VoidSettlementRequestDTO {

    @NotBlank(message = "voidReason is required")
    @Size(max = 1000)
    private String voidReason;

}

