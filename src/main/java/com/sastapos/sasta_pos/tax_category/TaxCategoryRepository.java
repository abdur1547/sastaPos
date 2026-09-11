package com.sastapos.sasta_pos.tax_category;

import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;


public interface TaxCategoryRepository extends JpaRepository<TaxCategory, UUID> {

    TaxCategory findFirstByStoreId(UUID id);

}
