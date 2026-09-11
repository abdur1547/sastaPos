package com.sastapos.sasta_pos.sale;

import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;


public interface SaleRepository extends JpaRepository<Sale, UUID> {

    Sale findFirstByUserId(UUID id);

    Sale findFirstByStoreId(UUID id);

}
