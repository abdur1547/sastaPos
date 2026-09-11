package com.sastapos.sasta_pos.product;

import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;


public interface ProductRepository extends JpaRepository<Product, UUID> {

    Product findFirstByStoreId(UUID id);

    boolean existsByNameIgnoreCase(String name);

    boolean existsBySkuIgnoreCase(String sku);

    boolean existsByBarcodeIgnoreCase(String barcode);

}
