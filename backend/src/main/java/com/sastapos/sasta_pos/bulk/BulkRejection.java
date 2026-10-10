package com.sastapos.sasta_pos.bulk;


/** A row that was not applied, with a human-readable reason. */
public record BulkRejection(String id, String reason) {
}
