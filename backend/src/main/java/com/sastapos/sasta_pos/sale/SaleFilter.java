package com.sastapos.sasta_pos.sale;

import com.sastapos.sasta_pos.payment.PaymentMethod;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

public record SaleFilter(LocalDateTime from, LocalDateTime to, List<SaleStatus> saleStatus,
                         List<SaleType> saleType, UUID customerId, UUID userId, String invoiceNumber,
                         UUID productId, List<PaymentMethod> paymentMethod, BigDecimal minTotalAmount,
                         BigDecimal maxTotalAmount, Boolean hasRemaining, String search) {
}
