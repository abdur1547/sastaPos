package com.sastapos.sasta_pos.product;

import com.sastapos.sasta_pos.bulk.AbstractBulkEntityService;
import com.sastapos.sasta_pos.bulk.BulkColumn;
import com.sastapos.sasta_pos.bulk.BulkRejection;
import com.sastapos.sasta_pos.bulk.BulkTable;
import com.sastapos.sasta_pos.bulk.BulkWriter;
import com.sastapos.sasta_pos.store.RowStatus;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;


/**
 * Bulk writes for products. Same rules as {@link ProductService#delete}: a product with sale
 * history is deactivated, never deleted.
 */
@Service
public class ProductBulkService extends AbstractBulkEntityService {

    static final BulkTable TABLE = BulkTable.storeScoped("products",
            BulkColumn.text("name").required(),
            BulkColumn.text("sku"),
            BulkColumn.text("barcode"),
            BulkColumn.text("pct_code").required(),
            BulkColumn.text("description"),
            BulkColumn.numeric("unit_price", 2).required().nonNegative(),
            BulkColumn.numeric("stock_quantity", 2).required().nonNegative().defaultTo(0),
            BulkColumn.text("status").required().oneOf(RowStatus.class).defaultTo(RowStatus.ACTIVE.name()),
            BulkColumn.uuid("units_of_measure_id").required(),
            BulkColumn.timestamp("date_created").required().immutable().defaultToNow(),
            BulkColumn.timestamp("last_updated").required().defaultToNow());

    public ProductBulkService(final BulkWriter writer, final PlatformTransactionManager transactionManager) {
        super(TABLE, writer, transactionManager);
    }

    @Override
    protected List<BulkRejection> applyDelete(final UUID storeId, final List<Object> keys) {
        final var jdbc = writer.jdbc();
        final var params = new MapSqlParameterSource("keys", keys).addValue("storeId", storeId);
        final List<UUID> existing = jdbc.queryForList(
                "SELECT id FROM products WHERE store_id = :storeId AND id IN (:keys)", params, UUID.class);
        if (existing.isEmpty()) {
            return List.of();
        }
        final var existingParams = new MapSqlParameterSource("ids", existing);
        final Set<UUID> sold = new HashSet<>(jdbc.queryForList(
                "SELECT DISTINCT product_id FROM sale_items WHERE product_id IN (:ids)", existingParams, UUID.class));

        if (!sold.isEmpty()) {
            jdbc.update("UPDATE products SET status = 'INACTIVE', last_updated = now() WHERE id IN (:ids)",
                    new MapSqlParameterSource("ids", sold));
        }
        final List<UUID> deletable = existing.stream().filter(id -> !sold.contains(id)).toList();
        if (!deletable.isEmpty()) {
            final var deletableParams = new MapSqlParameterSource("ids", deletable);
            jdbc.update("DELETE FROM stock_movements WHERE product_id IN (:ids)", deletableParams);
            jdbc.update("DELETE FROM product_tax_categories WHERE product_id IN (:ids)", deletableParams);
            writer.delete(TABLE, storeId, deletable);
        }
        return List.of();
    }

}
