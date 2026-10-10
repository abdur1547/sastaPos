package com.sastapos.sasta_pos.sync;

import com.sastapos.sasta_pos.sync.dto.SyncUploadRequest;
import com.sastapos.sasta_pos.sync.dto.SyncUploadResponse;
import com.sastapos.sasta_pos.user.User;
import com.sastapos.sasta_pos.util.NotFoundException;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;


@RestController
@RequiredArgsConstructor
@RequestMapping(value = "/api/sync", produces = MediaType.APPLICATION_JSON_VALUE)
@Tag(name = "Sync", description = "PowerSync write path: the desktop app uploads its queued local changes here")
@SecurityRequirement(name = "bearerAuth")
public class SyncResource {

    private final SyncUploadService syncUploadService;

    @PostMapping("/upload")
    @Operation(summary = "Apply a batch of queued local changes to the user's store",
            description = "Idempotent. Changes are scoped to the caller's store regardless of any store_id "
                    + "sent. Changes that can never succeed are listed in `rejected` (HTTP 200) so the "
                    + "client can drop them; 4xx/5xx means nothing should be considered uploaded.")
    public SyncUploadResponse upload(@AuthenticationPrincipal final User user,
            @RequestBody @Valid final SyncUploadRequest request) {
        if (user.getStore() == null) {
            throw new NotFoundException("You don't have a store yet");
        }
        return syncUploadService.upload(user.getStore().getId(), request);
    }

}
