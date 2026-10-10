package com.sastapos.sasta_pos.sync;

import com.sastapos.sasta_pos.bulk.BulkEntityService;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;


/**
 * Maps client table names to the bulk service that owns their business rules. The dependency
 * order makes parents be written before children and deleted after them.
 */
public final class SyncTableRegistry {

    public record Entry(String table, int dependencyOrder, BulkEntityService service) {
    }

    private final Map<String, Entry> entries = new LinkedHashMap<>();

    public SyncTableRegistry register(final String table, final int dependencyOrder,
            final BulkEntityService service) {
        if (entries.putIfAbsent(table, new Entry(table, dependencyOrder, service)) != null) {
            throw new IllegalStateException("Sync table registered twice: " + table);
        }
        return this;
    }

    public Optional<Entry> find(final String table) {
        return Optional.ofNullable(entries.get(table));
    }

    public Comparator<Entry> parentsFirst() {
        return Comparator.comparingInt(Entry::dependencyOrder).thenComparing(Entry::table);
    }

    public List<String> tables() {
        return List.copyOf(entries.keySet());
    }

}
