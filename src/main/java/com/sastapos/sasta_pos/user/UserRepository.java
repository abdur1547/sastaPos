package com.sastapos.sasta_pos.user;

import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;


public interface UserRepository extends JpaRepository<User, UUID> {

    User findFirstByStoreId(UUID id);

}
