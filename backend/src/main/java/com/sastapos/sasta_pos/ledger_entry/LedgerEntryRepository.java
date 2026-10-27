package com.sastapos.sasta_pos.ledger_entry;

import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;


public interface LedgerEntryRepository extends JpaRepository<LedgerEntry, UUID>,
        JpaSpecificationExecutor<LedgerEntry> {

    boolean existsByCustomerId(UUID customerId);

    boolean existsByVendorId(UUID vendorId);

    Optional<LedgerEntry> findByIdAndCustomerId(UUID id, UUID customerId);

    Optional<LedgerEntry> findByIdAndVendorId(UUID id, UUID vendorId);

    Optional<LedgerEntry> findByPaymentIdAndType(UUID paymentId, LedgerEntryType type);

    Optional<LedgerEntry> findByPaymentId(UUID paymentId);

}
