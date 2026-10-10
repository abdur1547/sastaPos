package com.sastapos.sasta_pos.sync.dto;

import java.util.List;


/**
 * The upload succeeded as a whole when the response is 200; {@code rejected} lists individual
 * changes that can never be applied (validation or integrity rules) so clients can drop them
 * instead of retrying forever.
 */
public record SyncUploadResponse(int applied, List<SyncRejectionDTO> rejected) {
}
