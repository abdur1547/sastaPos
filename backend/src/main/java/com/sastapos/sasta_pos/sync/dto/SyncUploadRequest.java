package com.sastapos.sasta_pos.sync.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;


public record SyncUploadRequest(
        @NotNull @Size(max = SyncUploadRequest.MAX_OPERATIONS) List<@NotNull @Valid SyncOperationDTO> operations) {

    public static final int MAX_OPERATIONS = 1000;

}
