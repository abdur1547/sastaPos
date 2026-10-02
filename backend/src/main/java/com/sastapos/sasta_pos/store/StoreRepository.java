package com.sastapos.sasta_pos.store;

import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;


public interface StoreRepository extends JpaRepository<Store, UUID> {

    boolean existsByNtnIgnoreCase(String ntn);

    boolean existsByNtnIgnoreCaseAndIdNot(String ntn, UUID id);

}
