package com.sastapos.sasta_pos.payment.dto;

import com.sastapos.sasta_pos.payment.PaymentDirection;
import com.sastapos.sasta_pos.payment.PaymentMethod;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class PaymentDTO {

    private UUID id;
    private BigDecimal amount;
    private PaymentMethod method;
    private PaymentDirection direction;
    private String referenceNumber;
    private String description;
    private UUID saleId;
    private UUID customerId;
    private UUID vendorId;
    private UUID storeId;
    private UUID userId;
    private boolean voided;
    private String voidReason;
    private OffsetDateTime voidedAt;
    private UUID voidedBy;
    private OffsetDateTime createdAt;
    private OffsetDateTime lastUpdated;

}

