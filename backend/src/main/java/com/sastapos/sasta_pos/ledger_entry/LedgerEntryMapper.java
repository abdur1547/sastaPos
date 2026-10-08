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
        dto.setCustomerId(entry.getCustomer().getId());
        dto.setSaleId(entry.getSale() == null ? null : entry.getSale().getId());
        dto.setCreatedAt(entry.getDateCreated());
        return dto;
    }
}
