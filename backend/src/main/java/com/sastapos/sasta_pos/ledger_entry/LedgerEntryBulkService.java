package com.sastapos.sasta_pos.ledger_entry;

import com.sastapos.sasta_pos.bulk.AbstractBulkEntityService;
import com.sastapos.sasta_pos.bulk.BulkColumn;
import com.sastapos.sasta_pos.bulk.BulkRejection;
import com.sastapos.sasta_pos.bulk.BulkResult;
import com.sastapos.sasta_pos.bulk.BulkRow;
import com.sastapos.sasta_pos.bulk.BulkTable;
import com.sastapos.sasta_pos.bulk.BulkValidationException;
import com.sastapos.sasta_pos.bulk.BulkWriter;
import com.sastapos.sasta_pos.bulk.BulkWriter.TypedRow;
import com.sastapos.sasta_pos.customer.CustomerPaymentLedgerBulkService;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;


/** Ledger amounts are append-only; balances are derived from persisted entries, never client patches. */
@Service
public class LedgerEntryBulkService extends AbstractBulkEntityService {

    private static final BulkTable TABLE = BulkTable.scopedBy("ledger_entries",
            "ledger_entries.payment_id IS NULL AND ledger_entries.store_id = CAST(:store_id AS uuid)",
            BulkColumn.text("direction").required().immutable().oneOf(LedgerDirection.class),
            BulkColumn.numeric("amount", 2).required().immutable().nonNegative(),
            BulkColumn.text("type").required().immutable().oneOf(LedgerEntryType.class),
            BulkColumn.text("reference_number").immutable(),
            BulkColumn.text("description").immutable(),
            BulkColumn.bool("voided").required().defaultTo(false),
            BulkColumn.text("void_reason"),
            BulkColumn.timestamp("voided_at"),
            BulkColumn.uuid("voided_by").refersToStoreRow("users"),
            BulkColumn.uuid("customer_id").immutable().refersToStoreRow("customers"),
            BulkColumn.uuid("vendor_id").immutable().refersToStoreRow("vendors"),
            BulkColumn.uuid("reversal_of_entry_id").immutable().refersToStoreRow("ledger_entries"),
            BulkColumn.uuid("sale_id").immutable().refersToStoreRow("sales",
                    "ref.store_id = CAST(:store_id AS uuid) AND ref.customer_id = CAST(:customer_id AS uuid)"),
            BulkColumn.uuid("payment_id").immutable(),
            BulkColumn.uuid("store_id").immutable().refersToStoreRow("stores", "ref.id = CAST(:store_id AS uuid)"),
            BulkColumn.uuid("user_id").immutable().refersToStoreRow("users"),
            BulkColumn.timestamp("date_created").required().immutable().defaultToNow(),
            BulkColumn.timestamp("last_updated").required().defaultToNow());

    private final CustomerPaymentLedgerBulkService paymentPostings;

    public LedgerEntryBulkService(final BulkWriter writer, final PlatformTransactionManager transactionManager,
            final CustomerPaymentLedgerBulkService paymentPostings) {
        super(TABLE, writer, transactionManager);
        this.paymentPostings = paymentPostings;
    }

    @Override
    public BulkResult upsertAll(final UUID storeId, final List<BulkRow> rows) {
        final BulkResult result = super.upsertAll(storeId,
                rows.stream().filter(row -> row.values().get("payment_id") == null).toList());
        result.merge(paymentPostings.upsertAll(storeId,
                rows.stream().filter(row -> row.values().get("payment_id") != null).toList()));
        return result;
    }

    @Override
    protected void normalize(final Map<String, Object> values, final boolean insert) {
        if (insert && LedgerEntryType.SALE.name().equals(values.get("type")) && values.get("sale_id") == null) {
            throw new BulkValidationException("sale_id is required for a SALE ledger entry");
        }
        if (insert && LedgerEntryType.PAYMENT.name().equals(values.get("type"))
                && values.get("sale_id") == null && values.get("payment_id") == null) {
            throw new BulkValidationException("payment_id is required for a standalone payment ledger entry");
        }
        if (Boolean.TRUE.equals(values.get("voided")) && values.get("void_reason") == null) {
            throw new BulkValidationException("void_reason is required for a voided ledger entry");
        }
    }

    @Override
    protected void afterWrite(final UUID storeId, final List<TypedRow> rows, final List<Object> refused) {
        final List<Object> keys = rows.stream().map(TypedRow::key).filter(key -> !refused.contains(key)).toList();
        if (keys.isEmpty()) {
            return;
        }
        final var params = new MapSqlParameterSource("keys", keys).addValue("storeId", storeId);
        final List<UUID> customers = writer.jdbc().queryForList(
                "SELECT c.id FROM customers c WHERE c.store_id = :storeId "
                        + "AND c.id IN (SELECT customer_id FROM ledger_entries WHERE id IN (:keys) AND customer_id IS NOT NULL) "
                        + "ORDER BY c.id FOR NO KEY UPDATE", params, UUID.class);
        if (!customers.isEmpty()) {
            writer.jdbc().update(
                    "UPDATE customers c SET account_balance = COALESCE((SELECT SUM(CASE WHEN direction = 'DEBIT' "
                            + "THEN amount ELSE -amount END) FROM ledger_entries WHERE customer_id = c.id), 0), "
                            + "last_updated = now() WHERE c.store_id = :storeId AND c.id IN (:customers)",
                    new MapSqlParameterSource("customers", customers).addValue("storeId", storeId));
        }

        final List<UUID> vendors = writer.jdbc().queryForList(
                "SELECT v.id FROM vendors v WHERE v.store_id = :storeId "
                        + "AND v.id IN (SELECT vendor_id FROM ledger_entries WHERE id IN (:keys) AND vendor_id IS NOT NULL) "
                        + "ORDER BY v.id FOR NO KEY UPDATE", params, UUID.class);
        if (!vendors.isEmpty()) {
            writer.jdbc().update(
                    "UPDATE vendors v SET account_balance = COALESCE((SELECT SUM(CASE WHEN direction = 'DEBIT' "
                            + "THEN amount ELSE -amount END) FROM ledger_entries WHERE vendor_id = v.id), 0), "
                            + "last_updated = now() WHERE v.store_id = :storeId AND v.id IN (:vendors)",
                    new MapSqlParameterSource("vendors", vendors).addValue("storeId", storeId));
        }
    }

    @Override
    protected List<BulkRejection> applyDelete(final UUID storeId, final List<Object> keys) {
        return keys.stream().map(key -> new BulkRejection(key.toString(),
                "ledger entries must be reversed, not deleted")).toList();
    }
}
