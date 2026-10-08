package com.sastapos.sasta_pos.product;

import jakarta.persistence.LockModeType;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;


public interface ProductRepository extends JpaRepository<Product, UUID>,
        JpaSpecificationExecutor<Product> {

    Product findFirstByStoreId(UUID id);

    Optional<Product> findByIdAndStoreId(UUID id, UUID storeId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from Product p where p.id = :id and p.store.id = :storeId")
    Optional<Product> findByIdAndStoreIdForUpdate(@Param("id") UUID id, @Param("storeId") UUID storeId);

    /** Locks in id order so concurrent sales touching the same products cannot deadlock. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from Product p where p.id in :ids and p.store.id = :storeId order by p.id")
    List<Product> findAllByIdInAndStoreIdForUpdate(@Param("ids") Collection<UUID> ids,
            @Param("storeId") UUID storeId);

    @Query("select p from Product p where p.id in :ids and p.store.id = :storeId")
    List<Product> findAllByIdInAndStoreId(@Param("ids") Collection<UUID> ids, @Param("storeId") UUID storeId);

    boolean existsByStoreIdAndSkuIgnoreCase(UUID storeId, String sku);

    boolean existsByStoreIdAndBarcodeIgnoreCase(UUID storeId, String barcode);

    boolean existsByStoreIdAndPctCodeIgnoreCase(UUID storeId, String pctCode);

    boolean existsByStoreIdAndSkuIgnoreCaseAndIdNot(UUID storeId, String sku, UUID id);

    boolean existsByStoreIdAndBarcodeIgnoreCaseAndIdNot(UUID storeId, String barcode, UUID id);

    boolean existsByStoreIdAndPctCodeIgnoreCaseAndIdNot(UUID storeId, String pctCode, UUID id);

}
