package com.sastapos.sasta_pos.bulk;

import java.util.List;
import java.util.stream.Stream;


/**
 * Table spec used to generate the bulk statements. The key column is named {@code id} and is a
 * uuid unless {@link #withTextKey()} is used. A table is tenant-scoped either through its own
 * {@code store_id} column or through a custom SQL condition (for child tables without one).
 */
public final class BulkTable {

    private static final String STORE_COLUMN = "store_id";

    private final String name;
    private final List<BulkColumn> columns;
    private final String scopeCondition;
    private final boolean ownsStoreColumn;
    private ColumnType keyType = ColumnType.UUID;

    private BulkTable(final String name, final String scopeCondition, final boolean ownsStoreColumn,
            final List<BulkColumn> columns) {
        this.name = name;
        this.scopeCondition = scopeCondition;
        this.ownsStoreColumn = ownsStoreColumn;
        this.columns = columns;
    }

    /** The table has a {@code store_id} column that is always set from the authenticated user. */
    public static BulkTable storeScoped(final String name, final BulkColumn... columns) {
        return new BulkTable(name, name + "." + STORE_COLUMN + " = CAST(:" + STORE_COLUMN + " AS uuid)", true,
                List.of(columns));
    }

    /** No {@code store_id} column; {@code condition} may use {@code :store_id} to scope rows to the store. */
    public static BulkTable scopedBy(final String name, final String condition, final BulkColumn... columns) {
        return new BulkTable(name, condition, false, List.of(columns));
    }

    public BulkTable withTextKey() {
        this.keyType = ColumnType.TEXT;
        return this;
    }

    public String name() {
        return name;
    }

    public List<BulkColumn> columns() {
        return columns;
    }

    public ColumnType keyType() {
        return keyType;
    }

    public String scopeCondition() {
        return scopeCondition;
    }

    public boolean ownsStoreColumn() {
        return ownsStoreColumn;
    }

    public String storeParam() {
        return STORE_COLUMN;
    }

    public List<BulkColumn> updatableColumns() {
        return columns.stream().filter(column -> !column.isImmutable()).toList();
    }

    public Stream<BulkColumn> referencingColumns() {
        return columns.stream().filter(column -> column.storeRefTable() != null);
    }

    public BulkColumn column(final String columnName) {
        return columns.stream().filter(column -> column.name().equals(columnName)).findFirst().orElse(null);
    }

}
