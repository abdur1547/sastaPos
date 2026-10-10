package com.sastapos.sasta_pos.bulk;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.OffsetDateTime;
import java.util.Set;
import java.util.function.Supplier;


/** Declarative description of one column; built once per table and shared by every bulk statement. */
public final class BulkColumn {

    private static final int MAX_NUMERIC_PRECISION = 18;

    private final String name;
    private final ColumnType type;
    private boolean required;
    private boolean immutable;
    private boolean serverOwned;
    private boolean nonNegative;
    private Integer scale;
    private Set<String> allowedValues;
    private String storeRefTable;
    private String storeRefCondition;
    private boolean increasing;
    private Supplier<Object> defaultValue;

    private BulkColumn(final String name, final ColumnType type) {
        this.name = name;
        this.type = type;
    }

    public static BulkColumn uuid(final String name) {
        return new BulkColumn(name, ColumnType.UUID);
    }

    public static BulkColumn text(final String name) {
        return new BulkColumn(name, ColumnType.TEXT);
    }

    public static BulkColumn numeric(final String name, final int scale) {
        final BulkColumn column = new BulkColumn(name, ColumnType.NUMERIC);
        column.scale = scale;
        return column;
    }

    public static BulkColumn timestamp(final String name) {
        return new BulkColumn(name, ColumnType.TIMESTAMPTZ);
    }

    public static BulkColumn integer(final String name) {
        return new BulkColumn(name, ColumnType.INTEGER);
    }

    public static BulkColumn bool(final String name) {
        return new BulkColumn(name, ColumnType.BOOLEAN);
    }

    /** Counter updates never move backwards when an offline batch is retried. */
    public BulkColumn increasing() {
        this.increasing = true;
        return this;
    }

    public boolean isIncreasing() {
        return increasing;
    }

    /** NOT NULL in the database: a missing or null value rejects the row. */
    public BulkColumn required() {
        this.required = true;
        return this;
    }

    /** Written on insert only; later upserts and patches leave the stored value alone. */
    public BulkColumn immutable() {
        this.immutable = true;
        return this;
    }

    /** Never taken from the client: inserts get {@code value}, updates never touch the column. */
    public BulkColumn serverOwned(final Object value) {
        this.serverOwned = true;
        this.immutable = true;
        this.defaultValue = () -> value;
        return this;
    }

    public BulkColumn nonNegative() {
        this.nonNegative = true;
        return this;
    }

    public BulkColumn oneOf(final Set<String> values) {
        this.allowedValues = values;
        return this;
    }

    public BulkColumn oneOf(final Class<? extends Enum<?>> enumType) {
        return oneOf(java.util.Arrays.stream(enumType.getEnumConstants()).map(Enum::name)
                .collect(java.util.stream.Collectors.toSet()));
    }

    public BulkColumn defaultTo(final Object value) {
        this.defaultValue = () -> value;
        return this;
    }

    public BulkColumn defaultToNow() {
        this.defaultValue = OffsetDateTime::now;
        return this;
    }

    /** The referenced row must exist in {@code table} within the caller's store (tenant isolation). */
    public BulkColumn refersToStoreRow(final String table) {
        this.storeRefTable = table;
        this.storeRefCondition = "ref.store_id = CAST(:store_id AS uuid)";
        return this;
    }

    /** Custom scope for references to child tables without their own store_id. */
    public BulkColumn refersToStoreRow(final String table, final String condition) {
        this.storeRefTable = table;
        this.storeRefCondition = condition;
        return this;
    }

    public String storeRefCondition() {
        return storeRefCondition;
    }

    public String name() {
        return name;
    }

    public ColumnType type() {
        return type;
    }

    public boolean isImmutable() {
        return immutable;
    }

    public boolean isServerOwned() {
        return serverOwned;
    }

    public boolean isRequired() {
        return required;
    }

    public String storeRefTable() {
        return storeRefTable;
    }

    Object defaultValue() {
        return defaultValue == null ? null : defaultValue.get();
    }

    boolean hasDefault() {
        return defaultValue != null;
    }

    /** Coerces and validates a raw client value for this column. */
    Object coerce(final Object raw) {
        Object value = type.coerce(name, raw);
        if (value instanceof String text) {
            final String trimmed = text.trim();
            value = trimmed.isEmpty() ? null : trimmed;
        }
        if (value instanceof BigDecimal decimal) {
            value = normalize(decimal);
        }
        if (value != null && allowedValues != null && !allowedValues.contains(value.toString())) {
            throw new BulkValidationException(name + " must be one of " + allowedValues.stream().sorted().toList());
        }
        if (value == null && required) {
            throw new BulkValidationException(name + " is required");
        }
        return value;
    }

    private BigDecimal normalize(final BigDecimal decimal) {
        final BigDecimal scaled;
        try {
            scaled = decimal.setScale(scale, RoundingMode.UNNECESSARY);
        } catch (final ArithmeticException e) {
            throw new BulkValidationException(name + " must have at most " + scale + " decimal places");
        }
        if (scaled.precision() > MAX_NUMERIC_PRECISION) {
            throw new BulkValidationException(name + " is too large");
        }
        if (nonNegative && scaled.signum() < 0) {
            throw new BulkValidationException(name + " must be >= 0");
        }
        return scaled;
    }

}
