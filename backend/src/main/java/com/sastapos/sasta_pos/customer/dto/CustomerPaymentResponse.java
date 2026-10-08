package com.sastapos.sasta_pos.customer.dto;

public record CustomerPaymentResponse(LedgerEntryDTO ledgerEntry, CustomerDTO customer) {
}
