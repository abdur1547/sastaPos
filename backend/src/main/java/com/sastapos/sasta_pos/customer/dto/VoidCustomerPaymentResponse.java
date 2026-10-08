package com.sastapos.sasta_pos.customer.dto;

public record VoidCustomerPaymentResponse(LedgerEntryDTO voidedEntry, LedgerEntryDTO reversalEntry,
                                          CustomerDTO customer) {
}
