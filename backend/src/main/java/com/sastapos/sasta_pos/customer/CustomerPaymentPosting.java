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
                    SELECT customer_id FROM payments WHERE id IN (:ids) AND sale_id IS NULL AND store_id = :storeId
                ) ORDER BY c.id FOR NO KEY UPDATE
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
                         customer_id, payment_id, store_id, user_id, date_created, last_updated)
                    SELECT p.id, 'CREDIT', p.amount, 'PAYMENT', p.reference_number, p.description, false,
                           p.customer_id, p.id, p.store_id, p.user_id, p.date_created, p.last_updated
                    FROM payments p WHERE p.id IN (:ids) AND p.store_id = :storeId AND p.sale_id IS NULL
                    ON CONFLICT (id) DO NOTHING
                    RETURNING customer_id, amount
                ), totals AS (
                    SELECT customer_id, SUM(amount) AS amount FROM posted GROUP BY customer_id
                )
                UPDATE customers c SET account_balance = c.account_balance - totals.amount, last_updated = now()
                FROM totals WHERE c.id = totals.customer_id AND c.store_id = :storeId
                """, params);
    }
}
