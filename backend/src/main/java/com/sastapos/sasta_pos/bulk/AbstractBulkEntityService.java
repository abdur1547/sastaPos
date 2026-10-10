package com.sastapos.sasta_pos.bulk;

import com.sastapos.sasta_pos.bulk.BulkWriter.TypedRow;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;


/**
 * Template for table-backed bulk services: coerces and validates rows against the {@link BulkTable}
 * spec, writes the valid ones in one batch inside a transaction and, if the database rejects the
 * batch on an integrity rule (e.g. a uniqueness index), retries row by row so that only the
 * offending rows are rejected. Subclasses add entity rules via {@link #normalize} and
 * {@link #applyDelete}.
 */
public abstract class AbstractBulkEntityService implements BulkEntityService {

    protected final BulkTable table;
    protected final BulkWriter writer;
    private final TransactionTemplate transactions;

    protected AbstractBulkEntityService(final BulkTable table, final BulkWriter writer,
            final PlatformTransactionManager transactionManager) {
        this.table = table;
        this.writer = writer;
        this.transactions = new TransactionTemplate(transactionManager);
    }

    @Override
    public BulkResult upsertAll(final UUID storeId, final List<BulkRow> rows) {
        final BulkResult result = new BulkResult();
        final List<TypedRow> prepared = prepare(rows, true, result);
        applyIsolated(prepared, TypedRow::key, batch -> {
            final List<Object> refused = writer.upsert(table, storeId, batch);
            afterWrite(storeId, batch, refused);
            return rejected(refused, "id belongs to another store or references a row outside the store");
        }, result);
        return result;
    }

    @Override
    public BulkResult patchAll(final UUID storeId, final List<BulkRow> rows) {
        final BulkResult result = new BulkResult();
        final List<TypedRow> prepared = prepare(rows, false, result);
        applyIsolated(prepared, TypedRow::key, batch -> {
            final List<Object> refused = writer.patch(table, storeId, batch);
            afterWrite(storeId, batch, refused);
            return rejected(refused, "row not found in the store or references a row outside the store");
        }, result);
        return result;
    }

    @Override
    public BulkResult deleteAll(final UUID storeId, final List<String> ids) {
        final BulkResult result = new BulkResult();
        final List<Object> keys = new ArrayList<>();
        for (final String id : ids) {
            try {
                keys.add(table.keyType().coerce("id", id));
            } catch (final BulkValidationException e) {
                result.reject(id, e.getMessage());
            }
        }
        applyIsolated(keys, Function.identity(), batch -> applyDelete(storeId, batch), result);
        return result;
    }

    /** Cross-field rules on coerced values; throw {@link BulkValidationException} to reject the row. */
    protected void normalize(final Map<String, Object> values, final boolean insert) {
    }

    /** Runs inside the write transaction, including each isolated retry. */
    protected void afterWrite(final UUID storeId, final List<TypedRow> rows, final List<Object> refused) {
    }

    /** Deletes rows; override to deactivate instead or to refuse. Returns the rows that were refused. */
    protected List<BulkRejection> applyDelete(final UUID storeId, final List<Object> keys) {
        writer.delete(table, storeId, keys);
        return List.of();
    }

    private List<TypedRow> prepare(final List<BulkRow> rows, final boolean insert, final BulkResult result) {
        final List<TypedRow> prepared = new ArrayList<>(rows.size());
        for (final BulkRow row : rows) {
            try {
                final TypedRow typed = prepare(row, insert);
                if (insert || !typed.values().isEmpty()) {
                    prepared.add(typed);
                }
            } catch (final BulkValidationException e) {
                result.reject(row.id(), e.getMessage());
            }
        }
        return prepared;
    }

    private TypedRow prepare(final BulkRow row, final boolean insert) {
        final Object key = table.keyType().coerce("id", row.id());
        if (key == null) {
            throw new BulkValidationException("id is required");
        }
        final Map<String, Object> typed = new LinkedHashMap<>();
        for (final BulkColumn column : table.columns()) {
            final String name = column.name();
            if (insert) {
                if (column.isServerOwned()) {
                    typed.put(name, column.coerce(column.defaultValue()));
                    continue;
                }
                Object raw = row.values().get(name);
                if (raw == null && column.hasDefault()) {
                    raw = column.defaultValue();
                }
                typed.put(name, column.coerce(raw));
            } else if (row.values().containsKey(name) && !column.isImmutable()) {
                typed.put(name, column.coerce(row.values().get(name)));
            }
        }
        normalize(typed, insert);
        return new TypedRow(key, typed);
    }

    private <T> void applyIsolated(final List<T> items, final Function<T, Object> keyOf,
            final Function<List<T>, List<BulkRejection>> operation, final BulkResult result) {
        if (items.isEmpty()) {
            return;
        }
        try {
            final List<BulkRejection> rejections = transactions.execute(status -> operation.apply(items));
            result.addApplied(items.size() - rejections.size());
            rejections.forEach(rejection -> result.reject(rejection.id(), rejection.reason()));
        } catch (final DataIntegrityViolationException e) {
            if (items.size() > 1) {
                items.forEach(item -> applyIsolated(List.of(item), keyOf, operation, result));
            } else {
                result.reject(String.valueOf(keyOf.apply(items.get(0))), describe(e));
            }
        }
    }

    private static List<BulkRejection> rejected(final List<Object> keys, final String reason) {
        return keys.stream().map(key -> new BulkRejection(String.valueOf(key), reason)).toList();
    }

    private static String describe(final DataIntegrityViolationException e) {
        return e instanceof DuplicateKeyException || String.valueOf(e.getMessage()).contains("unique")
                ? "violates a uniqueness rule (duplicate value)"
                : "violates a data integrity rule (invalid reference or value)";
    }

}
