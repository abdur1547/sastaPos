package com.sastapos.sasta_pos.customer;

import com.sastapos.sasta_pos.bulk.AbstractBulkEntityService;
import com.sastapos.sasta_pos.bulk.BulkColumn;
import com.sastapos.sasta_pos.bulk.BulkRejection;
import com.sastapos.sasta_pos.bulk.BulkTable;
import com.sastapos.sasta_pos.bulk.BulkWriter;
import com.sastapos.sasta_pos.store.RowStatus;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;


/**
 * Bulk writes for customers. The account balance is owned by the ledger on the server: devices
 * can never set it. Deletion follows {@link CustomerService#delete}: refused while a balance is
 * outstanding, deactivated when the customer has sale/ledger history.
 */
@Service
public class CustomerBulkService extends AbstractBulkEntityService {

    static final BulkTable TABLE = BulkTable.storeScoped("customers",
            BulkColumn.text("name").required(),
            BulkColumn.text("phone_number"),
            BulkColumn.text("ntn"),
            BulkColumn.numeric("account_balance", 2).serverOwned(BigDecimal.ZERO),
            BulkColumn.text("status").required().oneOf(RowStatus.class).defaultTo(RowStatus.ACTIVE.name()),
            BulkColumn.timestamp("date_created").required().immutable().defaultToNow(),
            BulkColumn.timestamp("last_updated").required().defaultToNow());

    public CustomerBulkService(final BulkWriter writer, final PlatformTransactionManager transactionManager) {
        super(TABLE, writer, transactionManager);
    }

    @Override
    protected List<BulkRejection> applyDelete(final UUID storeId, final List<Object> keys) {
        final var jdbc = writer.jdbc();
        final var rows = jdbc.queryForList(
                "SELECT id, account_balance FROM customers WHERE store_id = :storeId AND id IN (:keys) FOR UPDATE",
                new MapSqlParameterSource("keys", keys).addValue("storeId", storeId));

        final List<BulkRejection> rejections = new ArrayList<>();
        final List<UUID> allowed = new ArrayList<>();
        for (final var row : rows) {
            final UUID id = (UUID) row.get("id");
            if (((BigDecimal) row.get("account_balance")).signum() != 0) {
                rejections.add(new BulkRejection(id.toString(), "customer has an outstanding balance"));
            } else {
                allowed.add(id);
            }
        }
        if (allowed.isEmpty()) {
            return rejections;
        }

        final var allowedParams = new MapSqlParameterSource("ids", allowed);
        final Set<UUID> withHistory = new HashSet<>(jdbc.queryForList(
                "SELECT customer_id FROM sales WHERE customer_id IN (:ids) "
                        + "UNION SELECT customer_id FROM ledger_entries WHERE customer_id IN (:ids)",
                allowedParams, UUID.class));
        if (!withHistory.isEmpty()) {
            jdbc.update("UPDATE customers SET status = 'INACTIVE', last_updated = now() WHERE id IN (:ids)",
                    new MapSqlParameterSource("ids", withHistory));
        }
        final List<UUID> deletable = allowed.stream().filter(id -> !withHistory.contains(id)).toList();
        if (!deletable.isEmpty()) {
            writer.delete(TABLE, storeId, deletable);
        }
        return rejections;
    }

}
