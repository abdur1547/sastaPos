package com.sastapos.sasta_pos.store;

import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;


public interface StoreRepository extends JpaRepository<Store, UUID> {

    Store findFirstByBusinessSettingId(UUID id);

    boolean existsByBusinessSettingId(UUID id);

}
