package com.sastapos.sasta_pos.sync;

import com.sastapos.sasta_pos.customer.CustomerBulkService;
import com.sastapos.sasta_pos.business_setting.BusinessSettingBulkService;
import com.sastapos.sasta_pos.ledger_entry.LedgerEntryBulkService;
import com.sastapos.sasta_pos.payment.PaymentBulkService;
import com.sastapos.sasta_pos.product.ProductBulkService;
import com.sastapos.sasta_pos.product.ProductTaxCategoryBulkService;
import com.sastapos.sasta_pos.stock_movement.StockMovementBulkService;
import com.sastapos.sasta_pos.sale.SaleBulkService;
import com.sastapos.sasta_pos.sale_item.SaleItemBulkService;
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
            final StockMovementBulkService stockMovements, final BusinessSettingBulkService businessSettings,
            final SaleBulkService sales, final SaleItemBulkService saleItems, final PaymentBulkService payments,
            final LedgerEntryBulkService ledgerEntries) {
        return new SyncTableRegistry()
                .register("business_settings", 0, businessSettings)
                .register("customers", 10, customers)
                .register("products", 10, products)
                .register("product_tax_categories", 20, productTaxCategories)
                .register("sales", 20, sales)
                .register("sale_items", 30, saleItems)
                .register("payments", 30, payments)
                .register("ledger_entries", 35, ledgerEntries)
                .register("stock_movements", 40, stockMovements);
    }

}
