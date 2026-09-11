package com.sastapos.sasta_pos.sale;

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
@RequestMapping(value = "/api/sales", produces = MediaType.APPLICATION_JSON_VALUE)
public class SaleResource {

    private final SaleService saleService;

    public SaleResource(final SaleService saleService) {
        this.saleService = saleService;
    }

    @GetMapping
    public ResponseEntity<List<SaleDTO>> getAllSales() {
        return ResponseEntity.ok(saleService.findAll());
    }

    @GetMapping("/{id}")
    public ResponseEntity<SaleDTO> getSale(@PathVariable(name = "id") final UUID id) {
        return ResponseEntity.ok(saleService.get(id));
    }

    @PostMapping
    @ApiResponse(responseCode = "201")
    public ResponseEntity<UUID> createSale(@RequestBody @Valid final SaleDTO saleDTO) {
        final UUID createdId = saleService.create(saleDTO);
        return new ResponseEntity<>(createdId, HttpStatus.CREATED);
    }

    @PutMapping("/{id}")
    public ResponseEntity<UUID> updateSale(@PathVariable(name = "id") final UUID id,
            @RequestBody @Valid final SaleDTO saleDTO) {
        saleService.update(id, saleDTO);
        return ResponseEntity.ok(id);
    }

    @DeleteMapping("/{id}")
    @ApiResponse(responseCode = "204")
    public ResponseEntity<Void> deleteSale(@PathVariable(name = "id") final UUID id) {
        saleService.delete(id);
        return ResponseEntity.noContent().build();
    }

}
