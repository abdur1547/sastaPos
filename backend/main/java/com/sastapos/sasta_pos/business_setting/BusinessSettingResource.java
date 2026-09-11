package com.sastapos.sasta_pos.business_setting;

import io.swagger.v3.oas.annotations.responses.ApiResponse;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;


@RestController
@RequestMapping(value = "/api/businessSettings", produces = MediaType.APPLICATION_JSON_VALUE)
public class BusinessSettingResource {

    private final BusinessSettingService businessSettingService;

    public BusinessSettingResource(final BusinessSettingService businessSettingService) {
        this.businessSettingService = businessSettingService;
    }

    @GetMapping
    public ResponseEntity<List<BusinessSettingDTO>> getAllBusinessSettings() {
        return ResponseEntity.ok(businessSettingService.findAll());
    }

    @GetMapping("/{id}")
    public ResponseEntity<BusinessSettingDTO> getBusinessSetting(
            @PathVariable(name = "id") final UUID id) {
        return ResponseEntity.ok(businessSettingService.get(id));
    }

    @PostMapping
    @ApiResponse(responseCode = "201")
    public ResponseEntity<UUID> createBusinessSetting(
            @RequestBody @Valid final BusinessSettingDTO businessSettingDTO) {
        final UUID createdId = businessSettingService.create(businessSettingDTO);
        return new ResponseEntity<>(createdId, HttpStatus.CREATED);
    }

    @PutMapping("/{id}")
    public ResponseEntity<UUID> updateBusinessSetting(@PathVariable(name = "id") final UUID id,
            @RequestBody @Valid final BusinessSettingDTO businessSettingDTO) {
        businessSettingService.update(id, businessSettingDTO);
        return ResponseEntity.ok(id);
    }

    @DeleteMapping("/{id}")
    @ApiResponse(responseCode = "204")
    public ResponseEntity<Void> deleteBusinessSetting(@PathVariable(name = "id") final UUID id) {
        businessSettingService.delete(id);
        return ResponseEntity.noContent().build();
    }

}
