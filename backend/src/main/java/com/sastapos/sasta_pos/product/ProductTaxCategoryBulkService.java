package com.sastapos.sasta_pos.product;

import com.sastapos.sasta_pos.bulk.AbstractBulkEntityService;
import com.sastapos.sasta_pos.bulk.BulkColumn;
import com.sastapos.sasta_pos.bulk.BulkTable;
import com.sastapos.sasta_pos.bulk.BulkWriter;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;


/**
 * Bulk writes for the product / tax category links. The row id is the composite key encoded as
 * {@code ["productId","taxCategoryId"]}, which {@link ProductTaxCategory} assigns on insert;
 * links are immutable, so an edit is a delete plus a new link.
 */
@Service
public class ProductTaxCategoryBulkService extends AbstractBulkEntityService {

    static final BulkTable TABLE = BulkTable.scopedBy("product_tax_categories",
            "product_tax_categories.product_id IN (SELECT id FROM products WHERE store_id = CAST(:store_id AS uuid))",
            BulkColumn.uuid("product_id").required().immutable().refersToStoreRow("products"),
            BulkColumn.uuid("tax_category_id").required().immutable()).withTextKey();

    public ProductTaxCategoryBulkService(final BulkWriter writer,
            final PlatformTransactionManager transactionManager) {
        super(TABLE, writer, transactionManager);
    }

}
