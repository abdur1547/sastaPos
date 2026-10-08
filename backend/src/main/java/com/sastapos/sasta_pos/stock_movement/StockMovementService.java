package com.sastapos.sasta_pos.stock_movement;

import com.sastapos.sasta_pos.events.BeforeDeleteStore;
import com.sastapos.sasta_pos.product.Product;
import com.sastapos.sasta_pos.sale.Sale;
import com.sastapos.sasta_pos.sale_item.SaleItem;
import com.sastapos.sasta_pos.store.Store;
import com.sastapos.sasta_pos.util.BadRequestException;
import com.sastapos.sasta_pos.util.MoneyLimits;
import java.math.BigDecimal;
import com.sastapos.sasta_pos.util.ReferencedException;
import lombok.RequiredArgsConstructor;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;


@Service
@RequiredArgsConstructor
public class StockMovementService {

    private final StockMovementRepository stockMovementRepository;

    /** Takes the sold quantity out of stock; the caller has already verified availability. */
    public StockMovement recordSale(final Store store, final Product product, final BigDecimal quantity,
            final Sale sale, final SaleItem item) {
        final BigDecimal before = product.getStockQuantity();
        return apply(store, product, StockMovementType.SALE, quantity, before, before.subtract(quantity),
                "Sale " + sale.getInvoiceNumber(), sale, item);
    }

    /** Puts the quantity of a voided sale line back into stock. */
    public StockMovement recordVoidReturn(final Store store, final Product product, final BigDecimal quantity,
            final Sale sale, final SaleItem item, final String reason) {
        final BigDecimal before = product.getStockQuantity();
        final BigDecimal after = before.add(quantity);
        if (after.compareTo(MoneyLimits.MAX_AMOUNT) > 0) {
            throw new BadRequestException("Resulting stock quantity of product '" + product.getName()
                    + "' is too large");
        }
        return apply(store, product, StockMovementType.ADJUSTMENT_IN, quantity, before, after,
                "Void of sale " + sale.getInvoiceNumber() + ": " + reason, sale, item);
    }

    private StockMovement apply(final Store store, final Product product, final StockMovementType type,
            final BigDecimal quantity, final BigDecimal before, final BigDecimal after, final String description,
            final Sale sale, final SaleItem item) {
        final StockMovement movement = new StockMovement();
        movement.setType(type);
        movement.setQuantity(quantity);
        movement.setQuantityBefore(before);
        movement.setQuantityAfter(after);
        movement.setDescription(description);
        movement.setProduct(product);
        movement.setStore(store);
        movement.setSale(sale);
        movement.setSaleItem(item);
        product.setStockQuantity(after);
        return stockMovementRepository.save(movement);
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
