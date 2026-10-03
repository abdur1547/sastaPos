package com.sastapos.sasta_pos.store;

import com.sastapos.sasta_pos.store.dto.*;
import com.sastapos.sasta_pos.user.User;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;


/**
 * A user can belong to at most one store, so the store resource is always addressed as
 * {@code /api/store} (singular, no {@code {id}}) and resolved from the authenticated user.
 */
@RestController
@RequestMapping(value = "/api/store", produces = MediaType.APPLICATION_JSON_VALUE)
@Tag(name = "Store", description = "Create and manage the authenticated user's store")
@SecurityRequirement(name = "bearerAuth")
@RequiredArgsConstructor
public class StoreResource {

    private final StoreService storeService;

    @PostMapping
    @ApiResponse(responseCode = "201")
    @Operation(summary = "Create a store for the authenticated user and promote them to OWNER")
    public ResponseEntity<CreateStoreResponse> createStore(@AuthenticationPrincipal final User user,
                                                           @RequestBody @Valid final CreateStoreRequest request) {
        return new ResponseEntity<>(storeService.createStore(user, request), HttpStatus.CREATED);
    }

    @GetMapping
    @Operation(summary = "Get the authenticated user's store")
    public ResponseEntity<StoreDTO> getStore(@AuthenticationPrincipal final User user) {
        return ResponseEntity.ok(storeService.getStoreForCurrentUser(user));
    }

    @PatchMapping
    @Operation(summary = "Update the authenticated user's store profile (OWNER only)")
    public ResponseEntity<StoreDTO> updateStore(@AuthenticationPrincipal final User user,
            @RequestBody @Valid final UpdateStoreRequest request) {
        return ResponseEntity.ok(storeService.updateStore(user, request));
    }

    @PatchMapping("/settings")
    @Operation(summary = "Update the authenticated user's store settings (OWNER only)")
    public ResponseEntity<StoreSettingsDTO> updateStoreSettings(@AuthenticationPrincipal final User user,
                                                                @RequestBody @Valid final UpdateStoreSettingsRequest request) {
        return ResponseEntity.ok(storeService.updateStoreSettings(user, request));
    }

    @DeleteMapping
    @Operation(summary = "Deactivate the authenticated user's store (OWNER only, soft-delete)")
    public ResponseEntity<StoreDTO> deactivateStore(@AuthenticationPrincipal final User user) {
        return ResponseEntity.ok(storeService.deactivateStore(user));
    }

}
