package com.sastapos.sasta_pos.sync;

import com.sastapos.sasta_pos.bulk.BulkResult;
import com.sastapos.sasta_pos.sync.dto.SyncOperationDTO;
import com.sastapos.sasta_pos.sync.dto.SyncRejectionDTO;
import com.sastapos.sasta_pos.sync.dto.SyncUploadRequest;
import com.sastapos.sasta_pos.sync.dto.SyncUploadResponse;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;


/**
 * Routes a batch of client changes to the bulk service of each table. It contains no business
 * rules: grouping, ordering and routing only.
 */
@Service
@RequiredArgsConstructor
public class SyncUploadService {

    private final SyncTableRegistry registry;

    public SyncUploadResponse upload(final UUID storeId, final SyncUploadRequest request) {
        final List<SyncRejectionDTO> rejected = new ArrayList<>();
        final Map<String, SyncChangeSet> changes = new LinkedHashMap<>();
        for (final SyncOperationDTO operation : request.operations()) {
            if (registry.find(operation.table()).isEmpty()) {
                rejected.add(new SyncRejectionDTO(operation.table(), operation.id(),
                        "Table is not accepted for upload"));
                continue;
            }
            changes.computeIfAbsent(operation.table(), table -> new SyncChangeSet()).add(operation);
        }

        final List<SyncTableRegistry.Entry> parentsFirst = changes.keySet().stream()
                .map(table -> registry.find(table).orElseThrow())
                .sorted(registry.parentsFirst())
                .toList();

        int applied = 0;
        for (final SyncTableRegistry.Entry entry : parentsFirst) {
            final SyncChangeSet set = changes.get(entry.table());
            final BulkResult result = new BulkResult();
            if (!set.puts().isEmpty()) {
                result.merge(entry.service().upsertAll(storeId, set.puts()));
            }
            if (!set.patches().isEmpty()) {
                result.merge(entry.service().patchAll(storeId, set.patches()));
            }
            applied += collect(entry.table(), result, rejected);
        }
        for (final SyncTableRegistry.Entry entry : parentsFirst.reversed()) {
            final List<String> ids = changes.get(entry.table()).deletes();
            if (!ids.isEmpty()) {
                applied += collect(entry.table(), entry.service().deleteAll(storeId, ids), rejected);
            }
        }
        return new SyncUploadResponse(applied, rejected);
    }

    private static int collect(final String table, final BulkResult result,
            final List<SyncRejectionDTO> rejected) {
        result.rejections().forEach(r -> rejected.add(new SyncRejectionDTO(table, r.id(), r.reason())));
        return result.applied();
    }

}
