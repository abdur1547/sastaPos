package com.sastapos.sasta_pos.payment;

import com.sastapos.sasta_pos.payment.dto.PaymentDTO;
import org.springframework.stereotype.Component;

@Component
public class PaymentMapper {

    public PaymentDTO toDTO(final Payment payment) {
        if (payment == null) {
            return null;
        }
        final PaymentDTO dto = new PaymentDTO();
        dto.setId(payment.getId());
        dto.setAmount(payment.getAmount());
        dto.setMethod(payment.getMethod());
        dto.setDirection(payment.getDirection());
        dto.setReferenceNumber(payment.getReferenceNumber());
        dto.setDescription(payment.getDescription());
        dto.setSaleId(payment.getSale() == null ? null : payment.getSale().getId());
        dto.setCustomerId(payment.getCustomer() == null ? null : payment.getCustomer().getId());
        dto.setVendorId(payment.getVendor() == null ? null : payment.getVendor().getId());
        dto.setStoreId(payment.getStore() == null ? null : payment.getStore().getId());
        dto.setUserId(payment.getUser() == null ? null : payment.getUser().getId());
        dto.setVoided(payment.isVoided());
        dto.setVoidReason(payment.getVoidReason());
        dto.setVoidedAt(payment.getVoidedAt());
        dto.setVoidedBy(payment.getVoidedBy() == null ? null : payment.getVoidedBy().getId());
        dto.setCreatedAt(payment.getDateCreated());
        dto.setLastUpdated(payment.getLastUpdated());
        return dto;
    }
}

