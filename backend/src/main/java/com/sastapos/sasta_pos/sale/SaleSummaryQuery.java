package com.sastapos.sasta_pos.sale;

import com.sastapos.sasta_pos.sale.dto.SaleSummaryDTO;
import jakarta.persistence.EntityManager;
import jakarta.persistence.Tuple;
import jakarta.persistence.criteria.CriteriaBuilder;
import jakarta.persistence.criteria.CriteriaQuery;
import jakarta.persistence.criteria.Root;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/** Aggregates the sales register (one grouped query) using the exact WHERE clause of the list. */
@Component
@RequiredArgsConstructor
class SaleSummaryQuery {

    private static final List<SaleStatus> POSTED = List.of(SaleStatus.COMPLETED, SaleStatus.VOIDED);
    private static final BigDecimal ZERO = BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);

    private final EntityManager entityManager;

    SaleSummaryDTO summarize(final UUID storeId, final SaleFilter filter) {
        final CriteriaBuilder cb = entityManager.getCriteriaBuilder();
        final CriteriaQuery<Tuple> query = cb.createTupleQuery();
        final Root<Sale> root = query.from(Sale.class);
        query.multiselect(
                root.get("status").alias("status"),
                cb.count(root).alias("count"),
                cb.sum(root.<BigDecimal>get("totalAmount")).alias("total"),
                cb.sum(root.<BigDecimal>get("discountAmount")).alias("discount"),
                cb.sum(root.<BigDecimal>get("taxAmount")).alias("tax"),
                cb.sum(root.<BigDecimal>get("totalPaid")).alias("paid"),
                cb.sum(root.<BigDecimal>get("remaining")).alias("remaining"));
        query.where(SaleSpecifications.forStore(storeId, postedOnly(filter)).toPredicate(root, query, cb));
        query.groupBy(root.get("status"));

        Tuple completed = null;
        Tuple voided = null;
        for (final Tuple row : entityManager.createQuery(query).getResultList()) {
            if (row.get("status") == SaleStatus.COMPLETED) {
                completed = row;
            } else if (row.get("status") == SaleStatus.VOIDED) {
                voided = row;
            }
        }
        final long saleCount = count(completed);
        final BigDecimal netSales = money(completed, "total");
        final BigDecimal average = saleCount == 0 ? ZERO
                : netSales.divide(BigDecimal.valueOf(saleCount), 2, RoundingMode.HALF_UP);
        return new SaleSummaryDTO(saleCount, netSales, money(completed, "discount"), money(completed, "tax"),
                money(completed, "paid"), money(completed, "remaining"), average, count(voided),
                money(voided, "total"));
    }

    /** Drafts are never part of the register; an explicit status filter can only narrow it. */
    private static SaleFilter postedOnly(final SaleFilter filter) {
        final List<SaleStatus> statuses = filter.saleStatus() == null || filter.saleStatus().isEmpty()
                ? POSTED
                : filter.saleStatus().stream().filter(POSTED::contains).toList();
        return new SaleFilter(filter.from(), filter.to(),
                statuses.isEmpty() ? List.of(SaleStatus.IN_PROGRESS) : statuses, filter.saleType(),
                filter.customerId(), filter.userId(), filter.invoiceNumber(), filter.productId(),
                filter.paymentMethod(), filter.minTotalAmount(), filter.maxTotalAmount(), filter.hasRemaining(),
                filter.search());
    }

    private static long count(final Tuple row) {
        return row == null ? 0 : row.get("count", Long.class);
    }

    private static BigDecimal money(final Tuple row, final String alias) {
        if (row == null) {
            return ZERO;
        }
        final BigDecimal value = row.get(alias, BigDecimal.class);
        return value == null ? ZERO : value.setScale(2, RoundingMode.HALF_UP);
    }
}
