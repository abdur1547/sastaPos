package com.sastapos.sasta_pos.sale.dto;

import com.sastapos.sasta_pos.payment.PaymentMethod;
import com.sastapos.sasta_pos.sale.SaleStatus;
import com.sastapos.sasta_pos.sale.SaleType;
import io.swagger.v3.oas.annotations.media.Schema;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import lombok.Getter;
import lombok.Setter;


@Getter
@Setter
@Schema(description = "A sale with its items, payments and (when attached) customer")
public class SaleDTO {

    private UUID id;
    @Schema(description = "Prefix + sequence number; drafts carry a temporary DRAFT-xxxx number that is "
            + "replaced when the sale is completed")
    private String invoiceNumber;
    private SaleType saleType;
    private SaleStatus saleStatus;
    private BigDecimal subtotal;
    private BigDecimal discountAmount;
    private BigDecimal taxableAmount;
    private BigDecimal taxAmount;
    private BigDecimal totalAmount;
    private String currencyCode;
    @Schema(description = "Store-local date/time of the sale (of completion for drafts)")
    private LocalDateTime soldAt;
    private BigDecimal totalPaid;
    @Schema(description = "totalAmount - totalPaid; owed by the customer for CREDIT sales")
    private BigDecimal remaining;
    private String description;
    private String voidReason;
    private OffsetDateTime voidedAt;
    private UUID voidedBy;
    private SaleCustomerDTO customer;
    private UUID userId;
    private UUID storeId;
    private List<SaleItemDTO> saleItems;
    private List<SalePaymentDTO> payments;
    private OffsetDateTime createdAt;
    private OffsetDateTime lastUpdated;

    @Getter
    @Setter
    @Schema(description = "Customer snapshot; accountBalance is the live balance (> 0: customer owes the store)")
    public static class SaleCustomerDTO {

        private UUID id;
        private String name;
        private BigDecimal accountBalance;

    }

    @Getter
    @Setter
    public static class SaleItemDTO {

        private UUID id;
        private UUID productId;
        @Schema(description = "Product name at the time of sale")
        private String productName;
        @Schema(description = "Product sku at the time of sale")
        private String sku;
        private BigDecimal quantity;
        private BigDecimal unitPrice;
        @Schema(description = "Sum of the product's tax category rates as a fraction, e.g. 0.17 for 17%")
        private BigDecimal taxRate;
        @Schema(description = "unitPrice * quantity")
        private BigDecimal taxableAmount;
        @Schema(description = "taxableAmount + tax")
        private BigDecimal lineTotal;

    }

    @Getter
    @Setter
    public static class SalePaymentDTO {

        private UUID id;
        private BigDecimal amount;
        private PaymentMethod method;
        private String referenceNumber;
        private String description;

    }

}
