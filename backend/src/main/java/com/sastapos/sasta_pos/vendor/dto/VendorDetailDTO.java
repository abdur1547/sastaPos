package com.sastapos.sasta_pos.vendor.dto;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class VendorDetailDTO extends VendorDTO {

    private long purchaseCount;
    private long paymentCount;
    private long returnCount;

}

