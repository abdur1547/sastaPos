package com.sastapos.sasta_pos.sync.dto;


/** A change that was not applied. It is permanent: retrying the same change will not succeed. */
public record SyncRejectionDTO(String table, String id, String reason) {
}
