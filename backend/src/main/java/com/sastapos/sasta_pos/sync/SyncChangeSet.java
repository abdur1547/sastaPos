package com.sastapos.sasta_pos.sync;

import com.sastapos.sasta_pos.bulk.BulkRow;
import com.sastapos.sasta_pos.sync.dto.SyncOperationDTO;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;


/**
 * Collapses the ordered operations of one table into at most one pending change per row, so each
 * row is written once: PUT then PATCH is a PUT with the merged columns, anything then DELETE is a
 * DELETE, DELETE then PUT is a PUT (the row is re-created), PATCH after DELETE is dropped.
 */
final class SyncChangeSet {

    private final Map<String, SyncOperationType> kinds = new LinkedHashMap<>();
    private final Map<String, Map<String, Object>> values = new HashMap<>();

    void add(final SyncOperationDTO operation) {
        final String id = operation.id();
        final SyncOperationType previous = kinds.get(id);
        final Map<String, Object> data = operation.data() == null ? Map.of() : operation.data();
        switch (operation.op()) {
            case PUT -> {
                kinds.put(id, SyncOperationType.PUT);
                values.put(id, new HashMap<>(data));
            }
            case PATCH -> {
                if (previous == SyncOperationType.DELETE) {
                    return;
                }
                kinds.putIfAbsent(id, SyncOperationType.PATCH);
                values.computeIfAbsent(id, key -> new HashMap<>()).putAll(data);
            }
            case DELETE -> {
                kinds.put(id, SyncOperationType.DELETE);
                values.remove(id);
            }
        }
    }

    List<BulkRow> puts() {
        return rowsOf(SyncOperationType.PUT);
    }

    List<BulkRow> patches() {
        return rowsOf(SyncOperationType.PATCH);
    }

    List<String> deletes() {
        return kinds.entrySet().stream()
                .filter(entry -> entry.getValue() == SyncOperationType.DELETE)
                .map(Map.Entry::getKey)
                .toList();
    }

    private List<BulkRow> rowsOf(final SyncOperationType kind) {
        final List<BulkRow> rows = new ArrayList<>();
        kinds.forEach((id, type) -> {
            if (type == kind) {
                rows.add(new BulkRow(id, values.get(id)));
            }
        });
        return rows;
    }

}
