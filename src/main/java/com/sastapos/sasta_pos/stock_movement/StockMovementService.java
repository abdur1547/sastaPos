package com.sastapos.sasta_pos.stock_movement;

import com.sastapos.sasta_pos.events.BeforeDeleteProduct;
import com.sastapos.sasta_pos.events.BeforeDeleteStore;
import com.sastapos.sasta_pos.product.Product;
import com.sastapos.sasta_pos.product.ProductRepository;
import com.sastapos.sasta_pos.store.Store;
import com.sastapos.sasta_pos.store.StoreRepository;
import com.sastapos.sasta_pos.util.NotFoundException;
import com.sastapos.sasta_pos.util.ReferencedException;
import java.util.List;
import java.util.UUID;
import org.springframework.context.event.EventListener;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;


@Service
public class StockMovementService {

    private final StockMovementRepository stockMovementRepository;
    private final ProductRepository productRepository;
    private final StoreRepository storeRepository;

    public StockMovementService(final StockMovementRepository stockMovementRepository,
            final ProductRepository productRepository, final StoreRepository storeRepository) {
        this.stockMovementRepository = stockMovementRepository;
        this.productRepository = productRepository;
        this.storeRepository = storeRepository;
    }

    public List<StockMovementDTO> findAll() {
        final List<StockMovement> stockMovements = stockMovementRepository.findAll(Sort.by("id"));
        return stockMovements.stream()
                .map(stockMovement -> mapToDTO(stockMovement, new StockMovementDTO()))
                .toList();
    }

    public StockMovementDTO get(final UUID id) {
        return stockMovementRepository.findById(id)
                .map(stockMovement -> mapToDTO(stockMovement, new StockMovementDTO()))
                .orElseThrow(NotFoundException::new);
    }

    public UUID create(final StockMovementDTO stockMovementDTO) {
        final StockMovement stockMovement = new StockMovement();
        mapToEntity(stockMovementDTO, stockMovement);
        return stockMovementRepository.save(stockMovement).getId();
    }

    public void update(final UUID id, final StockMovementDTO stockMovementDTO) {
        final StockMovement stockMovement = stockMovementRepository.findById(id)
                .orElseThrow(NotFoundException::new);
        mapToEntity(stockMovementDTO, stockMovement);
        stockMovementRepository.save(stockMovement);
    }

    public void delete(final UUID id) {
        final StockMovement stockMovement = stockMovementRepository.findById(id)
                .orElseThrow(NotFoundException::new);
        stockMovementRepository.delete(stockMovement);
    }

    private StockMovementDTO mapToDTO(final StockMovement stockMovement,
            final StockMovementDTO stockMovementDTO) {
        stockMovementDTO.setId(stockMovement.getId());
        stockMovementDTO.setType(stockMovement.getType());
        stockMovementDTO.setQuantity(stockMovement.getQuantity());
        stockMovementDTO.setQuantityBefore(stockMovement.getQuantityBefore());
        stockMovementDTO.setQuantityAfter(stockMovement.getQuantityAfter());
        stockMovementDTO.setReferenceType(stockMovement.getReferenceType());
        stockMovementDTO.setReason(stockMovement.getReason());
        stockMovementDTO.setProduct(stockMovement.getProduct() == null ? null : stockMovement.getProduct().getId());
        stockMovementDTO.setStore(stockMovement.getStore() == null ? null : stockMovement.getStore().getId());
        return stockMovementDTO;
    }

    private StockMovement mapToEntity(final StockMovementDTO stockMovementDTO,
            final StockMovement stockMovement) {
        stockMovement.setType(stockMovementDTO.getType());
        stockMovement.setQuantity(stockMovementDTO.getQuantity());
        stockMovement.setQuantityBefore(stockMovementDTO.getQuantityBefore());
        stockMovement.setQuantityAfter(stockMovementDTO.getQuantityAfter());
        stockMovement.setReferenceType(stockMovementDTO.getReferenceType());
        stockMovement.setReason(stockMovementDTO.getReason());
        final Product product = stockMovementDTO.getProduct() == null ? null : productRepository.findById(stockMovementDTO.getProduct())
                .orElseThrow(() -> new NotFoundException("product not found"));
        stockMovement.setProduct(product);
        final Store store = stockMovementDTO.getStore() == null ? null : storeRepository.findById(stockMovementDTO.getStore())
                .orElseThrow(() -> new NotFoundException("store not found"));
        stockMovement.setStore(store);
        return stockMovement;
    }

    @EventListener(BeforeDeleteProduct.class)
    public void on(final BeforeDeleteProduct event) {
        final ReferencedException referencedException = new ReferencedException();
        final StockMovement productStockMovement = stockMovementRepository.findFirstByProductId(event.getId());
        if (productStockMovement != null) {
            referencedException.setKey("product.stockMovement.product.referenced");
            referencedException.addParam(productStockMovement.getId());
            throw referencedException;
        }
    }

    @EventListener(BeforeDeleteStore.class)
    public void on(final BeforeDeleteStore event) {
        final ReferencedException referencedException = new ReferencedException();
        final StockMovement storeStockMovement = stockMovementRepository.findFirstByStoreId(event.getId());
        if (storeStockMovement != null) {
            referencedException.setKey("store.stockMovement.store.referenced");
            referencedException.addParam(storeStockMovement.getId());
            throw referencedException;
        }
    }

}
