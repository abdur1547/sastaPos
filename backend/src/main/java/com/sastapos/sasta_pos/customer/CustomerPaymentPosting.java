package com.sastapos.sasta_pos.customer;

import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;


/** Shared by REST and sync; a payment UUID is also its deterministic ledger-posting UUID. */
@Service
@RequiredArgsConstructor
public class CustomerPaymentPosting {

    private final NamedParameterJdbcTemplate jdbc;

    @Transactional(propagation = Propagation.MANDATORY)
    public void post(final UUID storeId, final List<UUID> paymentIds) {
        if (paymentIds.isEmpty()) {
            return;
        }
        final var params = new MapSqlParameterSource("ids", paymentIds).addValue("storeId", storeId);
        jdbc.queryForList("""
                SELECT c.id FROM customers c
                WHERE c.store_id = :storeId AND c.id IN (
                    SELECT customer_id FROM payments WHERE id IN (:ids) AND sale_id IS NULL AND store_id = :storeId AND customer_id IS NOT NULL
                ) ORDER BY c.id FOR NO KEY UPDATE
                """, params, UUID.class);

        jdbc.queryForList("""
                SELECT v.id FROM vendors v
                WHERE v.store_id = :storeId AND v.id IN (
                    SELECT vendor_id FROM payments WHERE id IN (:ids) AND sale_id IS NULL AND store_id = :storeId AND vendor_id IS NOT NULL
                ) ORDER BY v.id FOR NO KEY UPDATE
                """, params, UUID.class);

        final Boolean collision = jdbc.queryForObject("""
                SELECT EXISTS (
                    SELECT 1 FROM ledger_entries l JOIN payments p ON p.id = l.id
                    WHERE p.id IN (:ids) AND p.store_id = :storeId AND p.sale_id IS NULL
                      AND l.payment_id IS DISTINCT FROM p.id
                )
                """, params, Boolean.class);
        if (Boolean.TRUE.equals(collision)) {
            throw new DataIntegrityViolationException("Payment id conflicts with an existing ledger entry");
        }

        jdbc.update("""
                WITH posted AS (
                    INSERT INTO ledger_entries
                        (id, direction, amount, type, reference_number, description, voided,
                         customer_id, vendor_id, payment_id, store_id, user_id, date_created, last_updated)
                    SELECT p.id,
                           CASE WHEN p.direction = 'INCOMING' THEN 'CREDIT' ELSE 'DEBIT' END,
                           p.amount, 'PAYMENT', p.reference_number, p.description, false,
                           p.customer_id, p.vendor_id, p.id, p.store_id, p.user_id, p.date_created, p.last_updated
                    FROM payments p WHERE p.id IN (:ids) AND p.store_id = :storeId AND p.sale_id IS NULL
                    ON CONFLICT (id) DO NOTHING
                    RETURNING customer_id, vendor_id, direction, amount
                ), customer_totals AS (
                    SELECT customer_id,
                           SUM(CASE WHEN direction = 'CREDIT' THEN -amount ELSE amount END) AS delta
                    FROM posted WHERE customer_id IS NOT NULL GROUP BY customer_id
                ), vendor_totals AS (
                    SELECT vendor_id,
                           SUM(CASE WHEN direction = 'CREDIT' THEN -amount ELSE amount END) AS delta
                    FROM posted WHERE vendor_id IS NOT NULL GROUP BY vendor_id
                ), update_customers AS (
                    UPDATE customers c SET account_balance = c.account_balance + customer_totals.delta, last_updated = now()
                    FROM customer_totals WHERE c.id = customer_totals.customer_id AND c.store_id = :storeId
                )
                UPDATE vendors v SET account_balance = v.account_balance + vendor_totals.delta, last_updated = now()
                FROM vendor_totals WHERE v.id = vendor_totals.vendor_id AND v.store_id = :storeId
                """, params);
    }
}
