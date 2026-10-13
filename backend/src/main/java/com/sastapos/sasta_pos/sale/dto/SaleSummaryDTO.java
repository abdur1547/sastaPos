package com.sastapos.sasta_pos.sale.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.math.BigDecimal;

@Schema(description = "Totals of the sales register for the same filters as the list. Money figures cover "
        + "COMPLETED sales only; voided sales are reported separately and drafts are ignored.")
public record SaleSummaryDTO(
        @Schema(description = "Number of completed sales") long saleCount,
        @Schema(description = "Sum of total_amount of completed sales") BigDecimal netSales,
        @Schema(description = "Sum of discounts given on completed sales") BigDecimal discountTotal,
        @Schema(description = "Sum of tax charged on completed sales") BigDecimal taxTotal,
        @Schema(description = "Amount collected at the counter for completed sales") BigDecimal collected,
        @Schema(description = "Amount still owed on completed sales (credit given)") BigDecimal outstanding,
        @Schema(description = "netSales / saleCount, 0 when there are no sales") BigDecimal averageSale,
        @Schema(description = "Number of voided sales") long voidedCount,
        @Schema(description = "Sum of total_amount of voided sales") BigDecimal voidedAmount) {
}
