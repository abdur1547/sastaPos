package com.sastapos.sasta_pos.product;

import com.sastapos.sasta_pos.events.BeforeDeleteStore;
import com.sastapos.sasta_pos.product.dto.CreateProductRequestDTO;
import com.sastapos.sasta_pos.product.dto.CreateStockMovementRequestDTO;
import com.sastapos.sasta_pos.product.dto.CreateStockMovementResponse;
import com.sastapos.sasta_pos.product.dto.DeleteProductResponse;
import com.sastapos.sasta_pos.product.dto.PageResponse;
import com.sastapos.sasta_pos.product.dto.ProductDTO;
import com.sastapos.sasta_pos.product.dto.StockMovementResponseDTO;
import com.sastapos.sasta_pos.product.dto.UpdateProductRequestDTO;
import com.sastapos.sasta_pos.sale_item.SaleItemRepository;
import com.sastapos.sasta_pos.stock_movement.StockMovement;
import com.sastapos.sasta_pos.stock_movement.StockMovementRepository;
import com.sastapos.sasta_pos.stock_movement.StockMovementType;
import com.sastapos.sasta_pos.store.RowStatus;
import com.sastapos.sasta_pos.store.StoreRepository;
import com.sastapos.sasta_pos.tax_category.TaxCategory;
import com.sastapos.sasta_pos.tax_category.TaxCategoryRepository;
import com.sastapos.sasta_pos.units_of_measure.UnitsOfMeasure;
import com.sastapos.sasta_pos.units_of_measure.UnitsOfMeasureRepository;
import com.sastapos.sasta_pos.user.User;
import com.sastapos.sasta_pos.util.BadRequestException;
import com.sastapos.sasta_pos.util.ConflictException;
import com.sastapos.sasta_pos.util.NotFoundException;
import com.sastapos.sasta_pos.util.ReferencedException;
import jakarta.persistence.criteria.Predicate;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.context.event.EventListener;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;


/** Every operation is scoped to the authenticated user's store; foreign products look like 404s. */
@Service
@RequiredArgsConstructor
public class ProductService {

    static final int MAX_PAGE_SIZE = 100;
    private static final BigDecimal MAX_STOCK_MOVEMENT_RESULT = new BigDecimal("9999999999999999.99");
    private static final Map<String, String> SORTABLE_FIELDS = Map.of(
            "name", "name",
            "stockQuantity", "stockQuantity",
            "unitPrice", "unitPrice",
            "createdAt", "dateCreated");

    private final ProductRepository productRepository;
    private final UnitsOfMeasureRepository unitsOfMeasureRepository;
    private final TaxCategoryRepository taxCategoryRepository;
    private final StoreRepository storeRepository;
    private final StockMovementRepository stockMovementRepository;
    private final SaleItemRepository saleItemRepository;

    public record ProductFilter(String search, RowStatus status, UUID unitOfMeasureId, UUID taxCategoryId,
                                BigDecimal minStock, BigDecimal maxStock, BigDecimal minPrice,
                                BigDecimal maxPrice) {
    }

    @Transactional(readOnly = true)
    public PageResponse<ProductDTO> findAll(final User user, final ProductFilter filter, final int page,
            final int size, final String sortBy, final String sortDir) {
        final UUID storeId = requireStoreId(user);
        validateRange("minStock", filter.minStock(), "maxStock", filter.maxStock());
        validateRange("minPrice", filter.minPrice(), "maxPrice", filter.maxPrice());
        if (page < 0) {
            throw new BadRequestException("page must be >= 0");
        }
        if (size < 1) {
            throw new BadRequestException("size must be >= 1");
        }
        final String sortField = SORTABLE_FIELDS.get(sortBy);
        if (sortField == null) {
            throw new BadRequestException("sortBy must be one of " + SORTABLE_FIELDS.keySet().stream().sorted().toList());
        }
        final Sort.Direction direction = switch (sortDir.toLowerCase(Locale.ROOT)) {
            case "asc" -> Sort.Direction.ASC;
            case "desc" -> Sort.Direction.DESC;
            default -> throw new BadRequestException("sortDir must be 'asc' or 'desc'");
        };

        final PageRequest pageable = PageRequest.of(page, Math.min(size, MAX_PAGE_SIZE),
                Sort.by(direction, sortField).and(Sort.by("id")));
        final Page<ProductDTO> result = productRepository.findAll(buildSpecification(storeId, filter), pageable)
                .map(this::mapToDTO);
        return PageResponse.of(result);
    }

    @Transactional(readOnly = true)
    public ProductDTO get(final User user, final UUID id) {
        return mapToDTO(requireProduct(id, requireStoreId(user)));
    }

    @Transactional
    public ProductDTO create(final User user, final CreateProductRequestDTO request) {
        final UUID storeId = requireStoreId(user);
        final String sku = trimToNull(request.getSku());
        final String barcode = trimToNull(request.getBarCode());
        final String pctCode = request.getPctCode().trim();

        if (sku != null && productRepository.existsByStoreIdAndSkuIgnoreCase(storeId, sku)) {
            throw new ConflictException("A product with this sku already exists");
        }
        if (barcode != null && productRepository.existsByStoreIdAndBarcodeIgnoreCase(storeId, barcode)) {
            throw new ConflictException("A product with this barCode already exists");
        }
        if (productRepository.existsByStoreIdAndPctCodeIgnoreCase(storeId, pctCode)) {
            throw new ConflictException("A product with this pctCode already exists");
        }

        final UnitsOfMeasure unit = requireActiveUnit(request.getUnitOfMeasureId());
        final BigDecimal stock = request.getStockQuantity() == null
                ? BigDecimal.ZERO : request.getStockQuantity();
        requireQuantityAllowedFor(unit, stock, "stockQuantity");

        final Product product = new Product();
        product.setName(request.getName().trim());
        product.setSku(sku);
        product.setBarcode(barcode);
        product.setPctCode(pctCode);
        product.setDescription(request.getDescription());
        product.setUnitPrice(request.getUnitPrice().setScale(2));
        product.setStockQuantity(stock.setScale(2));
        product.setStatus(RowStatus.ACTIVE);
        product.setUnitsOfMeasure(unit);
        product.setTaxCategories(resolveTaxCategories(request.getTaxCategoryIds(), storeId));
        product.setStore(storeRepository.getReferenceById(storeId));
        productRepository.saveAndFlush(product);

        if (stock.signum() > 0) {
            recordMovement(product, StockMovementType.ADJUSTMENT_IN, stock, BigDecimal.ZERO.setScale(2),
                    "Initial stock");
        }
        return mapToDTO(product);
    }

    @Transactional
    public ProductDTO update(final User user, final UUID id, final UpdateProductRequestDTO request) {
        final UUID storeId = requireStoreId(user);
        final Product product = requireProduct(id, storeId);

        if (request.getName() != null) {
            product.setName(request.getName().trim());
        }
        if (request.getSku() != null) {
            final String sku = request.getSku().trim();
            if (productRepository.existsByStoreIdAndSkuIgnoreCaseAndIdNot(storeId, sku, id)) {
                throw new ConflictException("A product with this sku already exists");
            }
            product.setSku(sku);
        }
        if (request.getBarCode() != null) {
            final String barcode = request.getBarCode().trim();
            if (productRepository.existsByStoreIdAndBarcodeIgnoreCaseAndIdNot(storeId, barcode, id)) {
                throw new ConflictException("A product with this barCode already exists");
            }
            product.setBarcode(barcode);
        }
        if (request.getPctCode() != null) {
            final String pctCode = request.getPctCode().trim();
            if (productRepository.existsByStoreIdAndPctCodeIgnoreCaseAndIdNot(storeId, pctCode, id)) {
                throw new ConflictException("A product with this pctCode already exists");
            }
            product.setPctCode(pctCode);
        }
        if (request.getDescription() != null) {
            product.setDescription(request.getDescription());
        }
        if (request.getUnitPrice() != null) {
            product.setUnitPrice(request.getUnitPrice().setScale(2));
        }
        if (request.getUnitOfMeasureId() != null
                && !request.getUnitOfMeasureId().equals(product.getUnitsOfMeasure().getId())) {
            final UnitsOfMeasure unit = requireActiveUnit(request.getUnitOfMeasureId());
            requireQuantityAllowedFor(unit, product.getStockQuantity(), "stockQuantity");
            product.setUnitsOfMeasure(unit);
        }
        if (request.getTaxCategoryIds() != null) {
            product.setTaxCategories(resolveTaxCategories(request.getTaxCategoryIds(), storeId));
        }
        if (request.getStatus() != null) {
            product.setStatus(request.getStatus());
        }
        productRepository.saveAndFlush(product);
        return mapToDTO(product);
    }

    /**
     * Hard-deletes a product that was never sold; otherwise deactivates it so historical sale
     * items keep a valid reference. Returns {@code null} for a hard delete.
     */
    @Transactional
    public DeleteProductResponse delete(final User user, final UUID id) {
        final Product product = requireProduct(id, requireStoreId(user));
        if (saleItemRepository.findFirstByProductId(id) != null) {
            product.setStatus(RowStatus.INACTIVE);
            productRepository.saveAndFlush(product);
            return new DeleteProductResponse(
                    "Product has sale history and was deactivated instead of deleted", mapToDTO(product));
        }
        stockMovementRepository.deleteByProductId(id);
        productRepository.delete(product);
        return null;
    }

    @Transactional
    public CreateStockMovementResponse addStockMovement(final User user, final UUID id,
            final CreateStockMovementRequestDTO request) {
        final UUID storeId = requireStoreId(user);
        final Product product = productRepository.findByIdAndStoreIdForUpdate(id, storeId)
                .orElseThrow(() -> new NotFoundException("Product not found"));

        if (request.getType() == StockMovementType.SALE) {
            throw new BadRequestException("type must be one of STOCK_IN, ADJUSTMENT_IN, ADJUSTMENT_OUT");
        }
        final BigDecimal quantity = request.getQuantity().setScale(2);
        requireQuantityAllowedFor(product.getUnitsOfMeasure(), quantity, "quantity");

        final BigDecimal before = product.getStockQuantity();
        final BigDecimal after;
        if (request.getType() == StockMovementType.ADJUSTMENT_OUT) {
            if (before.compareTo(quantity) < 0) {
                throw new ConflictException("Insufficient stock: available " + before.toPlainString()
                        + ", requested " + quantity.toPlainString());
            }
            after = before.subtract(quantity);
        } else {
            after = before.add(quantity);
            if (after.compareTo(MAX_STOCK_MOVEMENT_RESULT) > 0) {
                throw new BadRequestException("Resulting stock quantity is too large");
            }
        }

        final StockMovement movement = recordMovement(product, request.getType(), quantity, before,
                request.getDescription().trim());
        product.setStockQuantity(after);
        productRepository.saveAndFlush(product);
        return new CreateStockMovementResponse(mapMovement(movement), mapToDTO(product));
    }

    private StockMovement recordMovement(final Product product, final StockMovementType type,
            final BigDecimal quantity, final BigDecimal before, final String description) {
        final StockMovement movement = new StockMovement();
        movement.setType(type);
        movement.setQuantity(quantity);
        movement.setQuantityBefore(before);
        movement.setQuantityAfter(type == StockMovementType.ADJUSTMENT_OUT
                ? before.subtract(quantity) : before.add(quantity));
        movement.setDescription(description);
        movement.setProduct(product);
        movement.setStore(product.getStore());
        return stockMovementRepository.saveAndFlush(movement);
    }

    private Specification<Product> buildSpecification(final UUID storeId, final ProductFilter filter) {
        return (root, query, cb) -> {
            final List<Predicate> predicates = new ArrayList<>();
            predicates.add(cb.equal(root.get("store").get("id"), storeId));
            predicates.add(cb.equal(root.get("status"),
                    filter.status() == null ? RowStatus.ACTIVE : filter.status()));
            if (StringUtils.hasText(filter.search())) {
                final String pattern = "%" + escapeLike(filter.search().trim().toLowerCase(Locale.ROOT)) + "%";
                predicates.add(cb.or(
                        cb.like(cb.lower(root.get("name")), pattern, '\\'),
                        cb.like(cb.lower(root.get("sku")), pattern, '\\'),
                        cb.like(cb.lower(root.get("barcode")), pattern, '\\'),
                        cb.like(cb.lower(root.get("pctCode")), pattern, '\\')));
            }
            if (filter.unitOfMeasureId() != null) {
                predicates.add(cb.equal(root.get("unitsOfMeasure").get("id"), filter.unitOfMeasureId()));
            }
            if (filter.taxCategoryId() != null) {
                predicates.add(cb.equal(root.join("taxCategories").get("id"), filter.taxCategoryId()));
            }
            if (filter.minStock() != null) {
                predicates.add(cb.greaterThanOrEqualTo(root.get("stockQuantity"), filter.minStock()));
            }
            if (filter.maxStock() != null) {
                predicates.add(cb.lessThanOrEqualTo(root.get("stockQuantity"), filter.maxStock()));
            }
            if (filter.minPrice() != null) {
                predicates.add(cb.greaterThanOrEqualTo(root.get("unitPrice"), filter.minPrice()));
            }
            if (filter.maxPrice() != null) {
                predicates.add(cb.lessThanOrEqualTo(root.get("unitPrice"), filter.maxPrice()));
            }
            return cb.and(predicates.toArray(new Predicate[0]));
        };
    }

    private static String escapeLike(final String value) {
        return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }

    private static void validateRange(final String minName, final BigDecimal min, final String maxName,
            final BigDecimal max) {
        if (min != null && min.signum() < 0) {
            throw new BadRequestException(minName + " must be >= 0");
        }
        if (max != null && max.signum() < 0) {
            throw new BadRequestException(maxName + " must be >= 0");
        }
        if (min != null && max != null && min.compareTo(max) > 0) {
            throw new BadRequestException(minName + " must be <= " + maxName);
        }
    }

    private UUID requireStoreId(final User user) {
        if (user.getStore() == null) {
            throw new NotFoundException("You don't have a store yet");
        }
        return user.getStore().getId();
    }

    private Product requireProduct(final UUID id, final UUID storeId) {
        return productRepository.findByIdAndStoreId(id, storeId)
                .orElseThrow(() -> new NotFoundException("Product not found"));
    }

    private UnitsOfMeasure requireActiveUnit(final UUID unitId) {
        final UnitsOfMeasure unit = unitsOfMeasureRepository.findById(unitId)
                .orElseThrow(() -> new NotFoundException("Unit of measure not found"));
        if (!Boolean.TRUE.equals(unit.getIsActive())) {
            throw new BadRequestException("Unit of measure is not active");
        }
        return unit;
    }

    private Set<TaxCategory> resolveTaxCategories(final Set<UUID> ids, final UUID storeId) {
        if (ids == null || ids.isEmpty()) {
            return new HashSet<>();
        }
        final List<TaxCategory> found = taxCategoryRepository.findAllById(ids);
        final Set<UUID> usable = found.stream()
                .filter(c -> Boolean.TRUE.equals(c.getIsActive())
                        && (c.getStore() == null || storeId.equals(c.getStore().getId())))
                .map(TaxCategory::getId)
                .collect(Collectors.toSet());
        if (!usable.containsAll(ids)) {
            throw new NotFoundException("Tax category not found");
        }
        return new HashSet<>(found);
    }

    private static void requireQuantityAllowedFor(final UnitsOfMeasure unit, final BigDecimal quantity,
            final String field) {
        final boolean whole = quantity.stripTrailingZeros().scale() <= 0;
        if (!Boolean.TRUE.equals(unit.getAllowsFraction()) && !whole) {
            throw new BadRequestException(field + " must be a whole number for unit of measure '"
                    + unit.getName() + "'");
        }
    }

    private static String trimToNull(final String value) {
        return value == null ? null : value.trim();
    }

    private ProductDTO mapToDTO(final Product product) {
        final ProductDTO dto = new ProductDTO();
        dto.setId(product.getId());
        dto.setName(product.getName());
        dto.setSku(product.getSku());
        dto.setBarCode(product.getBarcode());
        dto.setPctCode(product.getPctCode());
        dto.setDescription(product.getDescription());
        dto.setUnitPrice(product.getUnitPrice());
        dto.setStockQuantity(product.getStockQuantity());
        dto.setStatus(product.getStatus());
        dto.setUnitOfMeasureId(product.getUnitsOfMeasure().getId());
        dto.setTaxCategoryIds(product.getTaxCategories().stream().map(TaxCategory::getId)
                .collect(Collectors.toCollection(java.util.TreeSet::new)));
        dto.setStoreId(product.getStore().getId());
        dto.setCreatedAt(product.getDateCreated());
        dto.setLastUpdated(product.getLastUpdated());
        return dto;
    }

    private StockMovementResponseDTO mapMovement(final StockMovement movement) {
        final StockMovementResponseDTO dto = new StockMovementResponseDTO();
        dto.setId(movement.getId());
        dto.setType(movement.getType());
        dto.setQuantity(movement.getQuantity());
        dto.setQuantityBefore(movement.getQuantityBefore());
        dto.setQuantityAfter(movement.getQuantityAfter());
        dto.setDescription(movement.getDescription());
        dto.setProductId(movement.getProduct().getId());
        dto.setStoreId(movement.getStore().getId());
        dto.setCreatedAt(movement.getDateCreated());
        return dto;
    }

    @EventListener(BeforeDeleteStore.class)
    public void on(final BeforeDeleteStore event) {
        final ReferencedException referencedException = new ReferencedException();
        final Product storeProduct = productRepository.findFirstByStoreId(event.getId());
        if (storeProduct != null) {
            referencedException.setKey("store.product.store.referenced");
            referencedException.addParam(storeProduct.getId());
            throw referencedException;
        }
    }

    /**
     * Loads the ACTIVE products of the store a sale refers to (optionally row-locked, ordered by id to
     * avoid deadlocks); any missing or foreign id is a 404.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public Map<UUID, Product> findActiveForSale(final Set<UUID> ids, final UUID storeId, final boolean lock) {
        final List<Product> found = lock ? lockAll(ids, storeId)
                : productRepository.findAllByIdInAndStoreId(ids, storeId);
        final Map<UUID, Product> byId = found.stream().collect(Collectors.toMap(Product::getId, p -> p));
        for (final UUID id : ids) {
            if (!byId.containsKey(id)) {
                throw new NotFoundException("Product not found: " + id);
            }
        }
        for (final Product product : found) {
            if (product.getStatus() != RowStatus.ACTIVE) {
                throw new BadRequestException("Product '" + product.getName() + "' is not active");
            }
        }
        return byId;
    }

    public List<Product> lockAll(final Collection<UUID> ids, final UUID storeId) {
        return productRepository.findAllByIdInAndStoreIdForUpdate(ids, storeId);
    }

}
