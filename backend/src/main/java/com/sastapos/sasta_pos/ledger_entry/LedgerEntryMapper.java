package com.sastapos.sasta_pos.ledger_entry;

import com.sastapos.sasta_pos.customer.dto.LedgerEntryDTO;
import org.springframework.stereotype.Component;

@Component
public class LedgerEntryMapper {

    public LedgerEntryDTO toDTO(final LedgerEntry entry) {
        final LedgerEntryDTO dto = new LedgerEntryDTO();
        dto.setId(entry.getId());
        dto.setDirection(entry.getDirection());
        dto.setType(entry.getType());
        dto.setAmount(entry.getAmount());
        dto.setReferenceNumber(entry.getReferenceNumber());
        dto.setDescription(entry.getDescription());
        dto.setVoided(entry.isVoided());
        dto.setVoidReason(entry.getVoidReason());
        dto.setVoidedAt(entry.getVoidedAt());
        dto.setVoidedBy(entry.getVoidedBy() == null ? null : entry.getVoidedBy().getId());
        dto.setCustomerId(entry.getCustomer() == null ? null : entry.getCustomer().getId());
        dto.setVendorId(entry.getVendor() == null ? null : entry.getVendor().getId());
        dto.setSaleId(entry.getSale() == null ? null : entry.getSale().getId());
        dto.setPaymentId(entry.getPayment() == null ? null : entry.getPayment().getId());
        dto.setReversalOfEntryId(entry.getReversalOfEntry() == null ? null : entry.getReversalOfEntry().getId());
        dto.setReversal(entry.getReversalOfEntry() != null);
        dto.setStoreId(entry.getStore() == null ? null : entry.getStore().getId());
        dto.setUserId(entry.getUser() == null ? null : entry.getUser().getId());
        dto.setCreatedAt(entry.getDateCreated());
        dto.setLastUpdated(entry.getLastUpdated());
        return dto;
    }
}
