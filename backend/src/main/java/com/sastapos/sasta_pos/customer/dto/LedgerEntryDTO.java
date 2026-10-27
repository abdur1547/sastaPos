package com.sastapos.sasta_pos.customer.dto;

import com.sastapos.sasta_pos.ledger_entry.LedgerDirection;
import com.sastapos.sasta_pos.ledger_entry.LedgerEntryType;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.Getter;
import lombok.Setter;


@Getter
@Setter
public class LedgerEntryDTO {

    private UUID id;
    private LedgerDirection direction;
    private LedgerEntryType type;
    private BigDecimal amount;
    private String referenceNumber;
    private String description;
    private boolean voided;
    private String voidReason;
    private OffsetDateTime voidedAt;
    private UUID voidedBy;
    private UUID customerId;
    private UUID vendorId;
    private UUID saleId;
    private UUID paymentId;
    private UUID reversalOfEntryId;
    @com.fasterxml.jackson.annotation.JsonProperty("isReversal")
    private boolean isReversal;
    private UUID storeId;
    private UUID userId;
    private OffsetDateTime createdAt;
    private OffsetDateTime lastUpdated;

}
