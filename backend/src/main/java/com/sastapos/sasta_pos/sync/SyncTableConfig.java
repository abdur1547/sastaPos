package com.sastapos.sasta_pos.sync;

import com.sastapos.sasta_pos.customer.CustomerBulkService;
import com.sastapos.sasta_pos.product.ProductBulkService;
import com.sastapos.sasta_pos.product.ProductTaxCategoryBulkService;
import com.sastapos.sasta_pos.stock_movement.StockMovementBulkService;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;


/**
 * The single place that decides which client tables are accepted by the upload endpoint. To sync
 * a new table: add a bulk service in its feature package and register it here (parents get a
 * lower order than the tables that reference them).
 */
@Configuration
public class SyncTableConfig {

    @Bean
    public SyncTableRegistry syncTableRegistry(final ProductBulkService products,
            final CustomerBulkService customers, final ProductTaxCategoryBulkService productTaxCategories,
            final StockMovementBulkService stockMovements) {
        return new SyncTableRegistry()
                .register("customers", 10, customers)
                .register("products", 10, products)
                .register("product_tax_categories", 20, productTaxCategories)
                .register("stock_movements", 20, stockMovements);
    }

}
