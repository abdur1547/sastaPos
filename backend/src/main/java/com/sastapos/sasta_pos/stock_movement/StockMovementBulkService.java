package com.sastapos.sasta_pos.stock_movement;

import com.sastapos.sasta_pos.bulk.AbstractBulkEntityService;
import com.sastapos.sasta_pos.bulk.BulkColumn;
import com.sastapos.sasta_pos.bulk.BulkRejection;
import com.sastapos.sasta_pos.bulk.BulkTable;
import com.sastapos.sasta_pos.bulk.BulkValidationException;
import com.sastapos.sasta_pos.bulk.BulkWriter;
import com.sastapos.sasta_pos.bulk.BulkWriter.TypedRow;
import java.util.List;
import java.util.Map;
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
            BulkColumn.uuid("sale_id").immutable().refersToStoreRow("sales"),
            BulkColumn.uuid("sale_item_id").immutable().refersToStoreRow("sale_items",
                    "ref.sale_id = CAST(:sale_id AS uuid) AND ref.product_id = CAST(:product_id AS uuid) "
                            + "AND ref.sale_id IN (SELECT id FROM sales WHERE store_id = CAST(:store_id AS uuid))"),
            BulkColumn.timestamp("date_created").required().immutable().defaultToNow(),
            BulkColumn.timestamp("last_updated").required().immutable().defaultToNow());

    public StockMovementBulkService(final BulkWriter writer, final PlatformTransactionManager transactionManager) {
        super(TABLE, writer, transactionManager);
    }

    @Override
    protected void normalize(final Map<String, Object> values, final boolean insert) {
        if (insert && StockMovementType.SALE.name().equals(values.get("type"))
                && (values.get("sale_id") == null || values.get("sale_item_id") == null)) {
            throw new BulkValidationException("SALE stock movements require sale_id and sale_item_id");
        }
    }

    @Override
    protected void afterWrite(final UUID storeId, final List<TypedRow> rows, final List<Object> refused) {
        for (final TypedRow row : rows) {
            if (!refused.contains(row.key()) && row.values().get("sale_item_id") != null) {
                // Earlier clients uploaded these audit rows without their sale links.
                writer.jdbc().update(
                        "UPDATE stock_movements SET sale_id = :saleId, sale_item_id = :itemId "
                                + "WHERE id = :id AND store_id = :storeId AND product_id = :productId "
                                + "AND sale_id IS NULL AND sale_item_id IS NULL",
                        new MapSqlParameterSource("id", row.key()).addValue("storeId", storeId)
                                .addValue("productId", row.values().get("product_id"))
                                .addValue("saleId", row.values().get("sale_id"))
                                .addValue("itemId", row.values().get("sale_item_id")));
            }
        }
    }

    @Override
    protected List<BulkRejection> applyDelete(final UUID storeId, final List<Object> keys) {
        writer.jdbc().update("DELETE FROM stock_movements WHERE id IN (:keys) AND store_id = :storeId "
                + "AND sale_id IS NULL", new MapSqlParameterSource("keys", keys).addValue("storeId", storeId));
        return List.of();
    }

}
