package com.sastapos.sasta_pos.stock_movement;

import com.sastapos.sasta_pos.bulk.AbstractBulkEntityService;
import com.sastapos.sasta_pos.bulk.BulkColumn;
import com.sastapos.sasta_pos.bulk.BulkRejection;
import com.sastapos.sasta_pos.bulk.BulkTable;
import com.sastapos.sasta_pos.bulk.BulkWriter;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;


/** Bulk writes for the stock movement audit log: rows are immutable and sale-linked rows are kept. */
@Service
public class StockMovementBulkService extends AbstractBulkEntityService {

    static final BulkTable TABLE = BulkTable.storeScoped("stock_movements",
            BulkColumn.text("type").required().immutable().oneOf(StockMovementType.class),
            BulkColumn.numeric("quantity", 2).required().immutable().nonNegative(),
            BulkColumn.numeric("quantity_before", 2).required().immutable().nonNegative(),
            BulkColumn.numeric("quantity_after", 2).required().immutable().nonNegative(),
            BulkColumn.text("description").required().immutable(),
            BulkColumn.uuid("product_id").required().immutable().refersToStoreRow("products"),
            BulkColumn.timestamp("date_created").required().immutable().defaultToNow(),
            BulkColumn.timestamp("last_updated").required().immutable().defaultToNow());

    public StockMovementBulkService(final BulkWriter writer, final PlatformTransactionManager transactionManager) {
        super(TABLE, writer, transactionManager);
    }

    @Override
    protected List<BulkRejection> applyDelete(final UUID storeId, final List<Object> keys) {
        writer.jdbc().update("DELETE FROM stock_movements WHERE id IN (:keys) AND store_id = :storeId "
                + "AND sale_id IS NULL", new MapSqlParameterSource("keys", keys).addValue("storeId", storeId));
        return List.of();
    }

}
