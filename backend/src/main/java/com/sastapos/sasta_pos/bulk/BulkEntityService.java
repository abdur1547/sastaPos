package com.sastapos.sasta_pos.bulk;

import java.util.List;
import java.util.UUID;


/**
 * Set-based writes for one entity type, scoped to a store. Implementations own the entity's
 * business rules; callers (e.g. the sync upload) stay free of them. All operations are
 * idempotent so a retried batch is safe.
 */
public interface BulkEntityService {

    /** Insert or replace rows by id. Columns missing from a row are treated as null/default. */
    BulkResult upsertAll(UUID storeId, List<BulkRow> rows);

    /** Update only the columns present in each row; rows that do not exist are rejected. */
    BulkResult patchAll(UUID storeId, List<BulkRow> rows);

    /** Delete (or deactivate, per the entity's rules) rows by id. Unknown ids are ignored. */
    BulkResult deleteAll(UUID storeId, List<String> ids);

}
