package com.sastapos.sasta_pos.product;

import com.sastapos.sasta_pos.product.dto.CreateProductRequestDTO;
import com.sastapos.sasta_pos.product.dto.CreateStockMovementRequestDTO;
import com.sastapos.sasta_pos.product.dto.CreateStockMovementResponse;
import com.sastapos.sasta_pos.product.dto.DeleteProductResponse;
import com.sastapos.sasta_pos.product.dto.PageResponse;
import com.sastapos.sasta_pos.product.dto.ProductDTO;
import com.sastapos.sasta_pos.product.dto.UpdateProductRequestDTO;
import com.sastapos.sasta_pos.store.RowStatus;
import com.sastapos.sasta_pos.user.User;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.math.BigDecimal;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;


@RestController
@RequiredArgsConstructor
@RequestMapping(value = "/api/products", produces = MediaType.APPLICATION_JSON_VALUE)
@Tag(name = "Product", description = "Manage the products and stock of the authenticated user's store")
@SecurityRequirement(name = "bearerAuth")
public class ProductResource {

    private final ProductService productService;

    @GetMapping
    @Operation(summary = "List products of the user's store (filters, pagination, sorting)")
    public ResponseEntity<PageResponse<ProductDTO>> getAllProducts(
            @AuthenticationPrincipal final User user,
            @RequestParam(required = false) final String search,
            @RequestParam(required = false) final RowStatus status,
            @RequestParam(required = false) final UUID unitOfMeasureId,
            @RequestParam(required = false) final UUID taxCategoryId,
            @RequestParam(required = false) final BigDecimal minStock,
            @RequestParam(required = false) final BigDecimal maxStock,
            @RequestParam(required = false) final BigDecimal minPrice,
            @RequestParam(required = false) final BigDecimal maxPrice,
            @RequestParam(defaultValue = "0") final int page,
            @RequestParam(defaultValue = "20") final int size,
            @RequestParam(defaultValue = "name") final String sortBy,
            @RequestParam(defaultValue = "asc") final String sortDir) {
        final ProductService.ProductFilter filter = new ProductService.ProductFilter(search, status,
                unitOfMeasureId, taxCategoryId, minStock, maxStock, minPrice, maxPrice);
        return ResponseEntity.ok(productService.findAll(user, filter, page, size, sortBy, sortDir));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ProductDTO> getProduct(@AuthenticationPrincipal final User user,
            @PathVariable(name = "id") final UUID id) {
        return ResponseEntity.ok(productService.get(user, id));
    }

    @PostMapping
    @ApiResponse(responseCode = "201")
    @Operation(summary = "Add a product (an initial ADJUSTMENT_IN movement is recorded when stockQuantity > 0)")
    public ResponseEntity<ProductDTO> createProduct(@AuthenticationPrincipal final User user,
            @RequestBody @Valid final CreateProductRequestDTO request) {
        return new ResponseEntity<>(productService.create(user, request), HttpStatus.CREATED);
    }

    @PatchMapping("/{id}")
    @Operation(summary = "Partially update a product (stockQuantity is not editable here)")
    public ResponseEntity<ProductDTO> updateProduct(@AuthenticationPrincipal final User user,
            @PathVariable(name = "id") final UUID id,
            @RequestBody @Valid final UpdateProductRequestDTO request) {
        return ResponseEntity.ok(productService.update(user, id, request));
    }

    @DeleteMapping("/{id}")
    @ApiResponse(responseCode = "204", description = "Hard-deleted (never sold)")
    @ApiResponse(responseCode = "200", description = "Soft-deleted: product has sale history")
    @Operation(summary = "Delete a product, or deactivate it when it has sale history")
    public ResponseEntity<DeleteProductResponse> deleteProduct(@AuthenticationPrincipal final User user,
            @PathVariable(name = "id") final UUID id) {
        final DeleteProductResponse result = productService.delete(user, id);
        return result == null ? ResponseEntity.noContent().build() : ResponseEntity.ok(result);
    }

    @PostMapping("/{id}/stock-movements")
    @ApiResponse(responseCode = "201")
    @Operation(summary = "Manual stock movement: STOCK_IN, ADJUSTMENT_IN or ADJUSTMENT_OUT")
    public ResponseEntity<CreateStockMovementResponse> addStockMovement(
            @AuthenticationPrincipal final User user, @PathVariable(name = "id") final UUID id,
            @RequestBody @Valid final CreateStockMovementRequestDTO request) {
        return new ResponseEntity<>(productService.addStockMovement(user, id, request), HttpStatus.CREATED);
    }

}
