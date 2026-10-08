package com.sastapos.sasta_pos.stock_movement;

import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;


public interface StockMovementRepository extends JpaRepository<StockMovement, UUID> {

    void deleteByProductId(UUID productId);

    StockMovement findFirstByStoreId(UUID id);

}
