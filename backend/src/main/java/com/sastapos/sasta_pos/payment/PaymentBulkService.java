package com.sastapos.sasta_pos.payment;

import com.sastapos.sasta_pos.bulk.AbstractBulkEntityService;
import com.sastapos.sasta_pos.bulk.BulkColumn;
import com.sastapos.sasta_pos.bulk.BulkResult;
import com.sastapos.sasta_pos.bulk.BulkRow;
import com.sastapos.sasta_pos.bulk.BulkTable;
import com.sastapos.sasta_pos.bulk.BulkWriter;
import com.sastapos.sasta_pos.customer.CustomerPaymentBulkService;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;


@Service
public class PaymentBulkService extends AbstractBulkEntityService {

    private static final BulkTable TABLE = BulkTable.scopedBy("payments",
            "payments.sale_id IN (SELECT id FROM sales WHERE store_id = CAST(:store_id AS uuid))",
            BulkColumn.numeric("amount", 2).required().nonNegative(),
            BulkColumn.text("method").required().oneOf(Set.of(PaymentMethod.CASH.name(), PaymentMethod.BANK.name())),
            BulkColumn.text("reference_number"),
            BulkColumn.text("description"),
            BulkColumn.uuid("sale_id").required().immutable().refersToStoreRow("sales"),
            BulkColumn.timestamp("date_created").required().immutable().defaultToNow(),
            BulkColumn.timestamp("last_updated").required().defaultToNow());

    private final CustomerPaymentBulkService customerPayments;

    public PaymentBulkService(final BulkWriter writer, final PlatformTransactionManager transactionManager,
            final CustomerPaymentBulkService customerPayments) {
        super(TABLE, writer, transactionManager);
        this.customerPayments = customerPayments;
    }

    @Override
    public BulkResult upsertAll(final UUID storeId, final List<BulkRow> rows) {
        final BulkResult result = super.upsertAll(storeId,
                rows.stream().filter(row -> row.values().get("sale_id") != null).toList());
        result.merge(customerPayments.upsertAll(storeId,
                rows.stream().filter(row -> row.values().get("sale_id") == null).toList()));
        return result;
    }

    @Override
    public BulkResult patchAll(final UUID storeId, final List<BulkRow> rows) {
        final Set<String> accountIds = accountPaymentIds(storeId, rows.stream().map(BulkRow::id).toList());
        final BulkResult result = super.patchAll(storeId,
                rows.stream().filter(row -> !accountIds.contains(row.id())).toList());
        result.merge(customerPayments.patchAll(storeId,
                rows.stream().filter(row -> accountIds.contains(row.id())).toList()));
        return result;
    }

    @Override
    public BulkResult deleteAll(final UUID storeId, final List<String> ids) {
        final Set<String> accountIds = accountPaymentIds(storeId, ids);
        final BulkResult result = super.deleteAll(storeId, ids.stream().filter(id -> !accountIds.contains(id)).toList());
        result.merge(customerPayments.deleteAll(storeId, ids.stream().filter(accountIds::contains).toList()));
        return result;
    }

    private Set<String> accountPaymentIds(final UUID storeId, final List<String> ids) {
        if (ids.isEmpty()) {
            return Set.of();
        }
        return new HashSet<>(writer.jdbc().queryForList("""
                SELECT id::text FROM payments WHERE store_id = :storeId AND sale_id IS NULL AND id::text IN (:ids)
                """, new MapSqlParameterSource("storeId", storeId).addValue("ids", ids), String.class));
    }
}
