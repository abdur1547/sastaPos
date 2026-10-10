package com.sastapos.sasta_pos.bulk;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.UUID;


/** Supported column types: the SQL cast used in statements and how raw values are coerced. */
public enum ColumnType {

    UUID("uuid"),
    TEXT("text"),
    NUMERIC("numeric"),
    INTEGER("integer"),
    BOOLEAN("boolean"),
    TIMESTAMPTZ("timestamptz");

    private final String sqlType;

    ColumnType(final String sqlType) {
        this.sqlType = sqlType;
    }

    public String sqlType() {
        return sqlType;
    }

    Object coerce(final String column, final Object raw) {
        if (raw == null) {
            return null;
        }
        try {
            return switch (this) {
                case UUID -> raw instanceof UUID uuid ? uuid : java.util.UUID.fromString(raw.toString().trim());
                case TEXT -> raw.toString();
                case NUMERIC -> raw instanceof BigDecimal decimal ? decimal : new BigDecimal(raw.toString().trim());
                case INTEGER -> toInteger(raw);
                case BOOLEAN -> toBoolean(raw);
                case TIMESTAMPTZ -> raw instanceof OffsetDateTime time ? time : toTimestamp(raw.toString().trim());
            };
        } catch (final IllegalArgumentException | java.time.DateTimeException e) {
            throw new BulkValidationException(column + " is not a valid " + sqlType);
        }
    }

    private static Integer toInteger(final Object raw) {
        try {
            return new BigDecimal(raw.toString().trim()).intValueExact();
        } catch (final ArithmeticException e) {
            throw new IllegalArgumentException("not an integer", e);
        }
    }

    private static Boolean toBoolean(final Object raw) {
        if (raw instanceof Boolean bool) {
            return bool;
        }
        return switch (raw.toString().trim().toLowerCase()) {
            case "1", "true" -> true;
            case "0", "false" -> false;
            default -> throw new IllegalArgumentException("not a boolean");
        };
    }

    private static OffsetDateTime toTimestamp(final String value) {
        try {
            return OffsetDateTime.parse(value);
        } catch (final java.time.DateTimeException e) {
            return Instant.parse(value).atOffset(ZoneOffset.UTC);
        }
    }

}
