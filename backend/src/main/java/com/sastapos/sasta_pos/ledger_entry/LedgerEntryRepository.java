package com.sastapos.sasta_pos.ledger_entry;

import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;


public interface LedgerEntryRepository extends JpaRepository<LedgerEntry, UUID> {

    boolean existsByCustomerId(UUID customerId);

    Optional<LedgerEntry> findByIdAndCustomerId(UUID id, UUID customerId);

}
