package com.sastapos.sasta_pos.sale_item;

import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;


public interface SaleItemRepository extends JpaRepository<SaleItem, UUID> {

    SaleItem findFirstBySaleId(UUID id);

    SaleItem findFirstByProductId(UUID id);

}
