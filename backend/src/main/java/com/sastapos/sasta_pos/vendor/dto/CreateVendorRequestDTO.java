package com.sastapos.sasta_pos.vendor.dto;

import com.sastapos.sasta_pos.vendor.TaxRegistrationStatus;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class CreateVendorRequestDTO {

    @NotBlank
    @Size(max = 255)
    private String name;

    @Size(max = 255)
    private String phoneNumber;

    @Size(max = 255)
    private String ntn;

    @Size(max = 255)
    private String strn;

    private TaxRegistrationStatus salesTaxRegistrationStatus = TaxRegistrationStatus.UNREGISTERED;

    private String address;

}

