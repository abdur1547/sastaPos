package com.sastapos.sasta_pos.sync.dto;

import com.sastapos.sasta_pos.sync.SyncOperationType;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.util.Map;


@Schema(description = "One queued local change, as produced by the PowerSync client (CrudEntry)")
public record SyncOperationDTO(
        @NotBlank @Schema(description = "Client table name, e.g. products") String table,
        @NotNull @Schema(description = "PUT = insert/replace (all non-null columns), PATCH = changed "
                + "columns only, DELETE") SyncOperationType op,
        @NotBlank @Schema(description = "Primary key of the changed row") String id,
        @Schema(description = "Column values by column name; absent for DELETE") Map<String, Object> data) {
}
