package com.sastapos.sasta_pos.units_of_measure;

import com.sastapos.sasta_pos.product.dto.PageResponse;
import com.sastapos.sasta_pos.units_of_measure.dto.UnitsOfMeasureDTO;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.time.OffsetDateTime;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@RequestMapping(value = "/api/units-of-measure", produces = MediaType.APPLICATION_JSON_VALUE)
@Tag(name = "Units of measure", description = "Read-only catalog of units of measure, available to any authenticated user")
@SecurityRequirement(name = "bearerAuth")
public class UnitsOfMeasureResource {

    private final UnitsOfMeasureService unitsOfMeasureService;

    @GetMapping
    @Operation(summary = "List units of measure (search by name or code, filters, pagination, sorting)")
    public ResponseEntity<PageResponse<UnitsOfMeasureDTO>> getAllUnitsOfMeasure(
            @RequestParam(required = false) final String search,
            @RequestParam(required = false) final String name,
            @RequestParam(required = false) final String code,
            @RequestParam(required = false) final Boolean isActive,
            @RequestParam(required = false) final Boolean allowsFraction,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) final OffsetDateTime createdFrom,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) final OffsetDateTime createdTo,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) final OffsetDateTime updatedFrom,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) final OffsetDateTime updatedTo,
            @RequestParam(defaultValue = "0") final int page,
            @RequestParam(defaultValue = "20") final int size,
            @RequestParam(defaultValue = "name") final String sortBy,
            @RequestParam(defaultValue = "asc") final String sortDir) {
        final UnitsOfMeasureService.UnitsOfMeasureFilter filter = new UnitsOfMeasureService.UnitsOfMeasureFilter(
                search, name, code, isActive, allowsFraction, createdFrom, createdTo, updatedFrom, updatedTo);
        return ResponseEntity.ok(unitsOfMeasureService.findAll(filter, page, size, sortBy, sortDir));
    }

}
