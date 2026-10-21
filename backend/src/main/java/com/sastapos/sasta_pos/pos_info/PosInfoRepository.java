package com.sastapos.sasta_pos.pos_info;

import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PosInfoRepository extends JpaRepository<PosInfo, UUID> {

    Optional<PosInfo> findFirstByOrderByDateCreatedAsc();

}
