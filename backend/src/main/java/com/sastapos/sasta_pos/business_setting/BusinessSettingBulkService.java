package com.sastapos.sasta_pos.business_setting;

import com.sastapos.sasta_pos.bulk.AbstractBulkEntityService;
import com.sastapos.sasta_pos.bulk.BulkColumn;
import com.sastapos.sasta_pos.bulk.BulkRejection;
import com.sastapos.sasta_pos.bulk.BulkResult;
import com.sastapos.sasta_pos.bulk.BulkRow;
import com.sastapos.sasta_pos.bulk.BulkTable;
import com.sastapos.sasta_pos.bulk.BulkValidationException;
import com.sastapos.sasta_pos.bulk.BulkWriter;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;


/** Devices may advance their store's invoice counter; configuration stays owned by the store API. */
@Service
public class BusinessSettingBulkService extends AbstractBulkEntityService {

    private static final BulkTable TABLE = BulkTable.scopedBy("business_settings",
            "business_settings.id IN (SELECT store_settings_id FROM stores WHERE id = CAST(:store_id AS uuid))",
            BulkColumn.integer("next_invoice_number").required().increasing(),
            BulkColumn.timestamp("last_updated").required().increasing().defaultToNow());

    public BusinessSettingBulkService(final BulkWriter writer, final PlatformTransactionManager transactionManager) {
        super(TABLE, writer, transactionManager);
    }

    @Override
    public BulkResult upsertAll(final UUID storeId, final List<BulkRow> rows) {
        return patchAll(storeId, rows);
    }

    @Override
    protected void normalize(final Map<String, Object> values, final boolean insert) {
        if (values.containsKey("next_invoice_number") && (Integer) values.get("next_invoice_number") < 1) {
            throw new BulkValidationException("next_invoice_number must be >= 1");
        }
    }

    @Override
    protected List<BulkRejection> applyDelete(final UUID storeId, final List<Object> keys) {
        return keys.stream().map(key -> new BulkRejection(key.toString(), "store settings cannot be deleted")).toList();
    }
}
