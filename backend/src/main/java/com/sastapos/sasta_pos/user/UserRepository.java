package com.sastapos.sasta_pos.user;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.repository.JpaRepository;


public interface UserRepository extends JpaRepository<User, UUID> {

    User findFirstByStoreId(UUID id);
    Optional<User> findByIdAndStoreId(UUID id, UUID storeId);

    List<User> findAllByStoreId(UUID storeId, Sort sort);

    boolean existsByEmailIgnoreCaseAndIdNot(String email, UUID id);

    Optional<User> findByEmailIgnoreCase(String email);

    boolean existsByEmailIgnoreCase(String email);

}
