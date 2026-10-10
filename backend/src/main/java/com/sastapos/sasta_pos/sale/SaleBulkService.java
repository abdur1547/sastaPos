package com.sastapos.sasta_pos.sale;

import com.sastapos.sasta_pos.bulk.AbstractBulkEntityService;
import com.sastapos.sasta_pos.bulk.BulkColumn;
import com.sastapos.sasta_pos.bulk.BulkRejection;
import com.sastapos.sasta_pos.bulk.BulkTable;
import com.sastapos.sasta_pos.bulk.BulkValidationException;
import com.sastapos.sasta_pos.bulk.BulkWriter;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;


/** Persists offline sale snapshots without generating a second invoice, stock movement, or ledger. */
@Service
public class SaleBulkService extends AbstractBulkEntityService {

    private static final BulkTable TABLE = BulkTable.storeScoped("sales",
            BulkColumn.text("invoice_number").required(),
            BulkColumn.text("sale_type").required().oneOf(SaleType.class),
            BulkColumn.numeric("subtotal", 2).required().nonNegative(),
            BulkColumn.numeric("discount_amount", 2).required().nonNegative(),
            BulkColumn.numeric("taxable_amount", 2).required().nonNegative(),
            BulkColumn.numeric("tax_amount", 2).required().nonNegative(),
            BulkColumn.numeric("total_amount", 2).required().nonNegative(),
            BulkColumn.text("currency_code").required().defaultTo("PKR"),
            BulkColumn.timestamp("sold_at").required(),
            BulkColumn.text("status").required().oneOf(SaleStatus.class),
            BulkColumn.numeric("total_paid", 2).required().nonNegative(),
            BulkColumn.numeric("remaining", 2).required().nonNegative(),
            BulkColumn.text("description"),
            BulkColumn.text("void_reason"),
            BulkColumn.timestamp("voided_at"),
            BulkColumn.uuid("voided_by").refersToStoreRow("users"),
            BulkColumn.uuid("customer_id").refersToStoreRow("customers"),
            BulkColumn.uuid("user_id").required().immutable().refersToStoreRow("users"),
            BulkColumn.timestamp("date_created").required().immutable().defaultToNow(),
            BulkColumn.timestamp("last_updated").required().defaultToNow());

    public SaleBulkService(final BulkWriter writer, final PlatformTransactionManager transactionManager) {
        super(TABLE, writer, transactionManager);
    }

    @Override
    protected void normalize(final Map<String, Object> values, final boolean insert) {
        if (!insert) {
            return;
        }
        final BigDecimal subtotal = (BigDecimal) values.get("subtotal");
        final BigDecimal discount = (BigDecimal) values.get("discount_amount");
        final BigDecimal taxable = (BigDecimal) values.get("taxable_amount");
        final BigDecimal tax = (BigDecimal) values.get("tax_amount");
        final BigDecimal total = (BigDecimal) values.get("total_amount");
        final BigDecimal paid = (BigDecimal) values.get("total_paid");
        final BigDecimal remaining = (BigDecimal) values.get("remaining");
        if (subtotal.subtract(discount).compareTo(taxable) != 0
                || taxable.add(tax).compareTo(total) != 0
                || total.subtract(paid).compareTo(remaining) != 0) {
            throw new BulkValidationException("sale totals are inconsistent");
        }
        if (SaleType.CREDIT.name().equals(values.get("sale_type")) && values.get("customer_id") == null) {
            throw new BulkValidationException("credit sales require a customer");
        }
        if (SaleStatus.VOIDED.name().equals(values.get("status")) && values.get("void_reason") == null) {
            throw new BulkValidationException("void_reason is required for a voided sale");
        }
    }

    @Override
    protected List<BulkRejection> applyDelete(final UUID storeId, final List<Object> keys) {
        return keys.stream().map(key -> new BulkRejection(key.toString(), "sales must be voided, not deleted")).toList();
    }
}
