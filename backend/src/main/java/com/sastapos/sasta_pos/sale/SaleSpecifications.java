package com.sastapos.sasta_pos.sale;

import com.sastapos.sasta_pos.payment.Payment;
import com.sastapos.sasta_pos.sale_item.SaleItem;
import jakarta.persistence.criteria.JoinType;
import jakarta.persistence.criteria.Predicate;
import jakarta.persistence.criteria.Root;
import jakarta.persistence.criteria.Subquery;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.util.StringUtils;

/** Builds the dynamic WHERE clause of the sale list endpoint. */
final class SaleSpecifications {

    private SaleSpecifications() {
    }

    static Specification<Sale> forStore(final UUID storeId, final SaleFilter filter) {
        return (root, query, cb) -> {
            final List<Predicate> predicates = new ArrayList<>();
            predicates.add(cb.equal(root.get("store").get("id"), storeId));
            if (isEmpty(filter.saleStatus())) {
                predicates.add(cb.notEqual(root.get("status"), SaleStatus.VOIDED));
            } else {
                predicates.add(root.get("status").in(filter.saleStatus()));
            }
            if (!isEmpty(filter.saleType())) {
                predicates.add(root.get("saleType").in(filter.saleType()));
            }
            if (filter.from() != null) {
                predicates.add(cb.greaterThanOrEqualTo(root.get("soldAt"), filter.from()));
            }
            if (filter.to() != null) {
                predicates.add(cb.lessThanOrEqualTo(root.get("soldAt"), filter.to()));
            }
            if (filter.customerId() != null) {
                predicates.add(cb.equal(root.get("customer").get("id"), filter.customerId()));
            }
            if (filter.userId() != null) {
                predicates.add(cb.equal(root.get("user").get("id"), filter.userId()));
            }
            if (StringUtils.hasText(filter.invoiceNumber())) {
                predicates.add(cb.like(cb.lower(root.get("invoiceNumber")),
                        "%" + escapeLike(filter.invoiceNumber().trim().toLowerCase(Locale.ROOT)) + "%", '\\'));
            }
            if (filter.productId() != null) {
                final Subquery<Integer> sub = query.subquery(Integer.class);
                final Root<SaleItem> item = sub.from(SaleItem.class);
                sub.select(cb.literal(1)).where(cb.equal(item.get("sale"), root),
                        cb.equal(item.get("product").get("id"), filter.productId()));
                predicates.add(cb.exists(sub));
            }
            if (!isEmpty(filter.paymentMethod())) {
                final Subquery<Integer> sub = query.subquery(Integer.class);
                final Root<Payment> payment = sub.from(Payment.class);
                sub.select(cb.literal(1)).where(cb.equal(payment.get("sale"), root),
                        payment.get("method").in(filter.paymentMethod()));
                predicates.add(cb.exists(sub));
            }
            if (filter.minTotalAmount() != null) {
                predicates.add(cb.greaterThanOrEqualTo(root.get("totalAmount"), filter.minTotalAmount()));
            }
            if (filter.maxTotalAmount() != null) {
                predicates.add(cb.lessThanOrEqualTo(root.get("totalAmount"), filter.maxTotalAmount()));
            }
            if (filter.hasRemaining() != null) {
                predicates.add(filter.hasRemaining()
                        ? cb.greaterThan(root.<BigDecimal>get("remaining"), BigDecimal.ZERO)
                        : cb.lessThanOrEqualTo(root.<BigDecimal>get("remaining"), BigDecimal.ZERO));
            }
            if (StringUtils.hasText(filter.search())) {
                final String pattern = "%" + escapeLike(filter.search().trim().toLowerCase(Locale.ROOT)) + "%";
                predicates.add(cb.or(
                        cb.like(cb.lower(root.get("invoiceNumber")), pattern, '\\'),
                        cb.like(cb.lower(root.join("customer", JoinType.LEFT).get("name")), pattern, '\\')));
            }
            return cb.and(predicates.toArray(new Predicate[0]));
        };
    }

    private static boolean isEmpty(final Collection<?> values) {
        return values == null || values.isEmpty();
    }

    private static String escapeLike(final String value) {
        return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }
}
