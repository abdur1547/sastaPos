package com.sastapos.sasta_pos.bulk;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import java.util.stream.IntStream;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.core.namedparam.SqlParameterSource;
import org.springframework.stereotype.Component;


/**
 * Generates and runs set-based SQL for a {@link BulkTable}: one JDBC batch per call instead of a
 * load-then-save round trip per row. Callers pass already coerced values (see
 * {@link AbstractBulkEntityService}) and must run inside a transaction.
 */
@Component
@RequiredArgsConstructor
public class BulkWriter {

    private static final int DELETE_CHUNK_SIZE = 500;

    /** Key (typed) and column values (typed) of one row. */
    public record TypedRow(Object key, Map<String, Object> values) {
    }

    private final NamedParameterJdbcTemplate jdbc;

    public NamedParameterJdbcTemplate jdbc() {
        return jdbc;
    }

    /**
     * Insert-or-update by key. Returns keys of rows that were not written because they exist
     * outside the caller's store or reference rows of another store.
     */
    public List<Object> upsert(final BulkTable table, final UUID storeId, final List<TypedRow> rows) {
        if (rows.isEmpty()) {
            return List.of();
        }
        final SqlParameterSource[] params = rows.stream().map(row -> {
            final MapSqlParameterSource source = new MapSqlParameterSource("id", row.key());
            for (final BulkColumn column : table.columns()) {
                source.addValue(column.name(), row.values().get(column.name()));
            }
            return source.addValue(table.storeParam(), storeId);
        }).toArray(SqlParameterSource[]::new);
        return notApplied(rows, jdbc.batchUpdate(upsertSql(table), params));
    }

    /** Updates only the columns present in each row. Returns keys of rows that matched nothing. */
    public List<Object> patch(final BulkTable table, final UUID storeId, final List<TypedRow> rows) {
        if (rows.isEmpty()) {
            return List.of();
        }
        final SqlParameterSource[] params = rows.stream().map(row -> {
            final MapSqlParameterSource source = new MapSqlParameterSource("id", row.key());
            for (final BulkColumn column : table.updatableColumns()) {
                source.addValue("has_" + column.name(), row.values().containsKey(column.name()));
                source.addValue(column.name(), row.values().get(column.name()));
            }
            return source.addValue(table.storeParam(), storeId);
        }).toArray(SqlParameterSource[]::new);
        return notApplied(rows, jdbc.batchUpdate(patchSql(table), params));
    }

    /** Deletes rows of the store by key, in chunks. Returns the number of deleted rows. */
    public int delete(final BulkTable table, final UUID storeId, final Collection<?> keys) {
        final String sql = "DELETE FROM " + table.name() + " WHERE id IN (:keys) AND " + table.scopeCondition();
        final List<Object> all = new ArrayList<>(keys);
        int deleted = 0;
        for (int from = 0; from < all.size(); from += DELETE_CHUNK_SIZE) {
            final List<Object> chunk = all.subList(from, Math.min(all.size(), from + DELETE_CHUNK_SIZE));
            deleted += jdbc.update(sql, new MapSqlParameterSource("keys", chunk).addValue(table.storeParam(), storeId));
        }
        return deleted;
    }

    private static List<Object> notApplied(final List<TypedRow> rows, final int[] counts) {
        return IntStream.range(0, rows.size())
                .filter(i -> counts[i] == 0)
                .mapToObj(i -> rows.get(i).key())
                .toList();
    }

    String upsertSql(final BulkTable table) {
        final List<String> names = new ArrayList<>();
        final List<String> values = new ArrayList<>();
        names.add("id");
        values.add(cast("id", table.keyType()));
        for (final BulkColumn column : table.columns()) {
            names.add(column.name());
            values.add(cast(column.name(), column.type()));
        }
        if (table.ownsStoreColumn()) {
            names.add(table.storeParam());
            values.add(cast(table.storeParam(), ColumnType.UUID));
        }
        final String updates = table.updatableColumns().stream()
                .map(column -> column.name() + " = " + updateValue(table, column, "EXCLUDED." + column.name()))
                .collect(Collectors.joining(", "));
        final String conflict = (updates.isEmpty() ? "id = " + table.name() + ".id" : updates);
        final String guard = " WHERE " + table.scopeCondition();
        return "INSERT INTO " + table.name() + " (" + String.join(", ", names) + ") SELECT "
                + String.join(", ", values) + " WHERE TRUE" + referenceChecks(table, false)
                + " ON CONFLICT (id) DO UPDATE SET " + conflict + guard;
    }

    String patchSql(final BulkTable table) {
        final String assignments = table.updatableColumns().stream()
                .map(column -> column.name() + " = CASE WHEN :has_" + column.name() + " THEN "
                        + updateValue(table, column, cast(column.name(), column.type()))
                        + " ELSE " + table.name() + "." + column.name() + " END")
                .collect(Collectors.joining(", "));
        return "UPDATE " + table.name() + " SET " + assignments + " WHERE " + table.name() + ".id = "
                + cast("id", table.keyType()) + " AND " + table.scopeCondition() + referenceChecks(table, true);
    }

    private static String referenceChecks(final BulkTable table, final boolean onlyWhenPatched) {
        return table.referencingColumns().filter(column -> !onlyWhenPatched || !column.isImmutable()).map(column -> {
            final String exists = "EXISTS (SELECT 1 FROM " + column.storeRefTable() + " ref WHERE ref.id = "
                    + cast(column.name(), column.type()) + " AND " + column.storeRefCondition() + ")";
            final String allowed = column.isRequired() ? exists
                    : "(" + cast(column.name(), column.type()) + " IS NULL OR " + exists + ")";
            return onlyWhenPatched
                    ? " AND (NOT :has_" + column.name() + " OR " + allowed + ")"
                    : " AND " + allowed;
        }).collect(Collectors.joining());
    }

    private static String updateValue(final BulkTable table, final BulkColumn column, final String value) {
        return column.isIncreasing()
                ? "GREATEST(" + table.name() + "." + column.name() + ", " + value + ")"
                : value;
    }

    private static String cast(final String param, final ColumnType type) {
        return "CAST(:" + param + " AS " + type.sqlType() + ")";
    }

}
