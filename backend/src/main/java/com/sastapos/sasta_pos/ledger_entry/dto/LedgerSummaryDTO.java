package com.sastapos.sasta_pos.ledger_entry.dto;

import java.math.BigDecimal;

public record LedgerSummaryDTO(
        BigDecimal currentBalance,
        BigDecimal openingBalance,
        BigDecimal closingBalance,
        BigDecimal debitTotal,
        BigDecimal creditTotal,
        BigDecimal netChange
) {
}

