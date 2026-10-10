package com.sastapos.sasta_pos.sale_item;

import com.sastapos.sasta_pos.bulk.AbstractBulkEntityService;
import com.sastapos.sasta_pos.bulk.BulkColumn;
import com.sastapos.sasta_pos.bulk.BulkTable;
import com.sastapos.sasta_pos.bulk.BulkValidationException;
import com.sastapos.sasta_pos.bulk.BulkWriter;
import java.math.BigDecimal;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;


@Service
public class SaleItemBulkService extends AbstractBulkEntityService {

    private static final BulkTable TABLE = BulkTable.scopedBy("sale_items",
            "sale_items.sale_id IN (SELECT id FROM sales WHERE store_id = CAST(:store_id AS uuid))",
            BulkColumn.text("product_name").required(),
            BulkColumn.text("sku"),
            BulkColumn.numeric("quantity", 2).required().nonNegative(),
            BulkColumn.numeric("unit_price", 2).required().nonNegative(),
            BulkColumn.numeric("tax_rate", 4).required().nonNegative(),
            BulkColumn.numeric("taxable_amount", 2).required().nonNegative(),
            BulkColumn.numeric("line_total", 2).required().nonNegative(),
            BulkColumn.uuid("sale_id").required().immutable().refersToStoreRow("sales"),
            BulkColumn.uuid("product_id").required().immutable().refersToStoreRow("products"),
            BulkColumn.timestamp("date_created").required().immutable().defaultToNow(),
            BulkColumn.timestamp("last_updated").required().defaultToNow());

    public SaleItemBulkService(final BulkWriter writer, final PlatformTransactionManager transactionManager) {
        super(TABLE, writer, transactionManager);
    }

    @Override
    protected void normalize(final Map<String, Object> values, final boolean insert) {
        if (values.containsKey("quantity") && ((BigDecimal) values.get("quantity")).signum() <= 0) {
            throw new BulkValidationException("quantity must be > 0");
        }
    }
}
