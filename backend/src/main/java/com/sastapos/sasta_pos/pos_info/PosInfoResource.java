package com.sastapos.sasta_pos.pos_info;

import com.sastapos.sasta_pos.pos_info.dto.PosInfoDTO;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@RequestMapping(value = "/api/pos-info", produces = MediaType.APPLICATION_JSON_VALUE)
@Tag(name = "POS info", description = "Read-only POS-level identity data required by FBR, available to any authenticated user")
@SecurityRequirement(name = "bearerAuth")
public class PosInfoResource {

    private final PosInfoService posInfoService;

    @GetMapping
    @Operation(summary = "Get the POS-level info (global, not store scoped)")
    public ResponseEntity<PosInfoDTO> getPosInfo() {
        return ResponseEntity.ok(posInfoService.get());
    }

}
