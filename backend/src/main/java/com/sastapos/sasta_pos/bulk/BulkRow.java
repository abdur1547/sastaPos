package com.sastapos.sasta_pos.bulk;

import java.util.Map;


/**
 * One row to write, keyed by database column name. Values are raw JSON-ish primitives (strings,
 * numbers, booleans, null); they are coerced and validated against the table's column spec.
 * For patches, only the columns present in {@code values} are changed.
 */
public record BulkRow(String id, Map<String, Object> values) {
}
