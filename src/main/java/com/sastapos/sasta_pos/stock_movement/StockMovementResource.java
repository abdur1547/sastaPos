package com.sastapos.sasta_pos.stock_movement;

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
@RequestMapping(value = "/api/stockMovements", produces = MediaType.APPLICATION_JSON_VALUE)
public class StockMovementResource {

    private final StockMovementService stockMovementService;

    public StockMovementResource(final StockMovementService stockMovementService) {
        this.stockMovementService = stockMovementService;
    }

    @GetMapping
    public ResponseEntity<List<StockMovementDTO>> getAllStockMovements() {
        return ResponseEntity.ok(stockMovementService.findAll());
    }

    @GetMapping("/{id}")
    public ResponseEntity<StockMovementDTO> getStockMovement(
            @PathVariable(name = "id") final UUID id) {
        return ResponseEntity.ok(stockMovementService.get(id));
    }

    @PostMapping
    @ApiResponse(responseCode = "201")
    public ResponseEntity<UUID> createStockMovement(
            @RequestBody @Valid final StockMovementDTO stockMovementDTO) {
        final UUID createdId = stockMovementService.create(stockMovementDTO);
        return new ResponseEntity<>(createdId, HttpStatus.CREATED);
    }

    @PutMapping("/{id}")
    public ResponseEntity<UUID> updateStockMovement(@PathVariable(name = "id") final UUID id,
            @RequestBody @Valid final StockMovementDTO stockMovementDTO) {
        stockMovementService.update(id, stockMovementDTO);
        return ResponseEntity.ok(id);
    }

    @DeleteMapping("/{id}")
    @ApiResponse(responseCode = "204")
    public ResponseEntity<Void> deleteStockMovement(@PathVariable(name = "id") final UUID id) {
        stockMovementService.delete(id);
        return ResponseEntity.noContent().build();
    }

}
