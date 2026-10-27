package com.sastapos.sasta_pos.customer;

import com.sastapos.sasta_pos.bulk.AbstractBulkEntityService;
import com.sastapos.sasta_pos.bulk.BulkColumn;
import com.sastapos.sasta_pos.bulk.BulkTable;
import com.sastapos.sasta_pos.bulk.BulkWriter;
import java.util.Set;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;


/** Acknowledges the client's copy of a posting already created atomically by the payment upload. */
@Service
public class CustomerPaymentLedgerBulkService extends AbstractBulkEntityService {

    private static final BulkTable TABLE = BulkTable.scopedBy("ledger_entries",
            "ledger_entries.store_id = CAST(:store_id AS uuid) AND ledger_entries.payment_id = ledger_entries.id",
            BulkColumn.text("direction").required().immutable().oneOf(Set.of("CREDIT", "DEBIT")),
            BulkColumn.text("type").required().immutable().oneOf(Set.of("PAYMENT")),
            BulkColumn.numeric("amount", 2).required().immutable().nonNegative(),
            BulkColumn.uuid("customer_id").immutable().refersToStoreRow("customers"),
            BulkColumn.uuid("vendor_id").immutable().refersToStoreRow("vendors"),
            BulkColumn.uuid("payment_id").required().immutable().refersToStoreRow("payments",
                    "ref.store_id = CAST(:store_id AS uuid) "
                    + "AND ref.id = CAST(:id AS uuid) AND ref.sale_id IS NULL AND ref.amount = CAST(:amount AS numeric) "
                    + "AND EXISTS (SELECT 1 FROM ledger_entries l WHERE l.id = ref.id AND l.payment_id = ref.id)"),
            BulkColumn.bool("voided").serverOwned(false),
            BulkColumn.timestamp("date_created").required().immutable().defaultToNow(),
            BulkColumn.timestamp("last_updated").required().immutable().defaultToNow());

    public CustomerPaymentLedgerBulkService(final BulkWriter writer,
            final PlatformTransactionManager transactionManager) {
        super(TABLE, writer, transactionManager);
    }
}
