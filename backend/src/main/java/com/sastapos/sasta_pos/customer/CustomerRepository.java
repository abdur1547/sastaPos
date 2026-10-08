package com.sastapos.sasta_pos.customer;

import jakarta.persistence.LockModeType;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;


public interface CustomerRepository extends JpaRepository<Customer, UUID>,
        JpaSpecificationExecutor<Customer> {

    Customer findFirstByStoreIdOrderByIdAsc(UUID storeId);

    Optional<Customer> findByIdAndStoreId(UUID id, UUID storeId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select c from Customer c where c.id = :id and c.store.id = :storeId")
    Optional<Customer> findByIdAndStoreIdForUpdate(@Param("id") UUID id, @Param("storeId") UUID storeId);

    boolean existsByStoreIdAndNameIgnoreCase(UUID storeId, String name);

    boolean existsByStoreIdAndNameIgnoreCaseAndIdNot(UUID storeId, String name, UUID id);

    boolean existsByPhoneNumber(String phoneNumber);

    boolean existsByPhoneNumberAndIdNot(String phoneNumber, UUID id);

}
