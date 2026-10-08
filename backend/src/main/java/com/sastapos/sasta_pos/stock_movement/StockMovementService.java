package com.sastapos.sasta_pos.stock_movement;

import com.sastapos.sasta_pos.events.BeforeDeleteStore;
import com.sastapos.sasta_pos.util.ReferencedException;
import lombok.RequiredArgsConstructor;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;


@Service
@RequiredArgsConstructor
public class StockMovementService {

    private final StockMovementRepository stockMovementRepository;

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
