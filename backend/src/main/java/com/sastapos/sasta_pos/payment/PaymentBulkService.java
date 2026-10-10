package com.sastapos.sasta_pos.payment;

import com.sastapos.sasta_pos.bulk.AbstractBulkEntityService;
import com.sastapos.sasta_pos.bulk.BulkColumn;
import com.sastapos.sasta_pos.bulk.BulkTable;
import com.sastapos.sasta_pos.bulk.BulkWriter;
import java.util.Set;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;


@Service
public class PaymentBulkService extends AbstractBulkEntityService {

    private static final BulkTable TABLE = BulkTable.scopedBy("payments",
            "payments.sale_id IN (SELECT id FROM sales WHERE store_id = CAST(:store_id AS uuid))",
            BulkColumn.numeric("amount", 2).required().nonNegative(),
            BulkColumn.text("method").required().oneOf(Set.of(PaymentMethod.CASH.name(), PaymentMethod.BANK.name())),
            BulkColumn.text("reference_number"),
            BulkColumn.text("description"),
            BulkColumn.uuid("sale_id").required().immutable().refersToStoreRow("sales"),
            BulkColumn.timestamp("date_created").required().immutable().defaultToNow(),
            BulkColumn.timestamp("last_updated").required().defaultToNow());

    public PaymentBulkService(final BulkWriter writer, final PlatformTransactionManager transactionManager) {
        super(TABLE, writer, transactionManager);
    }
}
