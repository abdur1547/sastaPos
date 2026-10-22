package com.sastapos.sasta_pos.customer;

import com.sastapos.sasta_pos.bulk.AbstractBulkEntityService;
import com.sastapos.sasta_pos.bulk.BulkColumn;
import com.sastapos.sasta_pos.bulk.BulkRejection;
import com.sastapos.sasta_pos.bulk.BulkTable;
import com.sastapos.sasta_pos.bulk.BulkValidationException;
import com.sastapos.sasta_pos.bulk.BulkWriter;
import com.sastapos.sasta_pos.payment.PaymentMethod;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;


@Service
public class CustomerPaymentBulkService extends AbstractBulkEntityService {

    private static final BulkTable TABLE = BulkTable.scopedBy("payments",
            "payments.store_id = CAST(:store_id AS uuid) AND payments.sale_id IS NULL",
            BulkColumn.numeric("amount", 2).required().immutable().nonNegative(),
            BulkColumn.text("method").required().immutable().oneOf(Set.of(PaymentMethod.CASH.name(), PaymentMethod.BANK.name())),
            BulkColumn.text("reference_number").immutable(),
            BulkColumn.text("description").immutable(),
            BulkColumn.text("direction").required().immutable().defaultTo("INCOMING").oneOf(Set.of("INCOMING")),
            BulkColumn.uuid("sale_id").immutable().refersToStoreRow("sales"),
            BulkColumn.uuid("customer_id").required().immutable().refersToStoreRow("customers"),
            BulkColumn.uuid("store_id").required().immutable().refersToStoreRow("stores", "ref.id = CAST(:store_id AS uuid)"),
            BulkColumn.uuid("user_id").required().immutable().refersToStoreRow("users"),
            BulkColumn.timestamp("date_created").required().immutable().defaultToNow(),
            BulkColumn.timestamp("last_updated").required().defaultToNow());

    private final CustomerPaymentPosting posting;

    public CustomerPaymentBulkService(final BulkWriter writer, final PlatformTransactionManager transactionManager,
            final CustomerPaymentPosting posting) {
        super(TABLE, writer, transactionManager);
        this.posting = posting;
    }

    @Override
    protected void normalize(final Map<String, Object> values, final boolean insert) {
        if (!insert) {
            return;
        }
        if (values.get("sale_id") != null) {
            throw new BulkValidationException("A customer account payment cannot be allocated to a sale");
        }
        if (((BigDecimal) values.get("amount")).signum() <= 0) {
            throw new BulkValidationException("amount must be > 0");
        }
        for (final var limit : Map.of("reference_number", 255, "description", 1000).entrySet()) {
            if (values.get(limit.getKey()) instanceof String text && text.length() > limit.getValue()) {
                throw new BulkValidationException(limit.getKey() + " is too long");
            }
        }
    }

    @Override
    protected void afterWrite(final UUID storeId, final List<BulkWriter.TypedRow> rows, final List<Object> refused) {
        posting.post(storeId, rows.stream().filter(row -> !refused.contains(row.key()))
                .map(row -> (UUID) row.key()).toList());
    }

    @Override
    protected List<BulkRejection> applyDelete(final UUID storeId, final List<Object> keys) {
        return keys.stream().map(key -> new BulkRejection(key.toString(),
                "payments must be reversed, not deleted")).toList();
    }
}
