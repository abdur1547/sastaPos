package com.sastapos.sasta_pos.business_setting;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.UUID;
import lombok.Getter;
import lombok.Setter;


@Getter
@Setter
public class BusinessSettingDTO {

    private UUID id;

    @NotNull
    @Size(max = 255)
    private String invoicePrefix;

    @NotNull
    private Integer invoiceNumberStart;

    @NotNull
    private Integer nextInvoiceNumber;

    @NotNull
    private Boolean defaultTaxInclusive;

    private String receiptFooter;

}
