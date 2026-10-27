package com.sastapos.sasta_pos.vendor.dto;

import com.sastapos.sasta_pos.store.RowStatus;
import com.sastapos.sasta_pos.vendor.BalanceState;
import com.sastapos.sasta_pos.vendor.TaxRegistrationStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class VendorDTO {

    private UUID id;
    private String name;
    private String phoneNumber;
    private String ntn;
    private String strn;
    private TaxRegistrationStatus salesTaxRegistrationStatus;
    private String address;

    @Schema(description = "> 0: vendor owes the store (advance); < 0: store owes the vendor; 0: settled")
    private BigDecimal accountBalance;

    private BigDecimal balanceAmount;
    private BalanceState balanceState;

    private RowStatus status;
    private UUID storeId;
    private OffsetDateTime createdAt;
    private OffsetDateTime lastUpdated;

}

