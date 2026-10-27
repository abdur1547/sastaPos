package com.sastapos.sasta_pos.vendor.dto;

import com.sastapos.sasta_pos.customer.dto.LedgerEntryDTO;
import com.sastapos.sasta_pos.payment.dto.PaymentDTO;

public record VoidSettlementResponse(
        PaymentDTO voidedPayment,
        LedgerEntryDTO voidedEntry,
        LedgerEntryDTO reversalEntry,
        VendorDTO vendor
) {
}

