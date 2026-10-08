package com.sastapos.sasta_pos.sale;

import com.sastapos.sasta_pos.sale.dto.SaleDTO;
import com.sastapos.sasta_pos.sale.dto.SaleStockMovementDTO;
import com.sastapos.sasta_pos.stock_movement.StockMovement;
import org.springframework.stereotype.Component;

@Component
public class SaleMapper {

    public SaleDTO toDTO(final Sale sale) {
        final SaleDTO dto = new SaleDTO();
        dto.setId(sale.getId());
        dto.setInvoiceNumber(sale.getInvoiceNumber());
        dto.setSaleType(sale.getSaleType());
        dto.setSaleStatus(sale.getStatus());
        dto.setSubtotal(sale.getSubtotal());
        dto.setDiscountAmount(sale.getDiscountAmount());
        dto.setTaxableAmount(sale.getTaxableAmount());
        dto.setTaxAmount(sale.getTaxAmount());
        dto.setTotalAmount(sale.getTotalAmount());
        dto.setCurrencyCode(sale.getCurrencyCode());
        dto.setSoldAt(sale.getSoldAt());
        dto.setTotalPaid(sale.getTotalPaid());
        dto.setRemaining(sale.getRemaining());
        dto.setDescription(sale.getDescription());
        dto.setVoidReason(sale.getVoidReason());
        dto.setVoidedAt(sale.getVoidedAt());
        dto.setVoidedBy(sale.getVoidedBy() == null ? null : sale.getVoidedBy().getId());
        if (sale.getCustomer() != null) {
            final SaleDTO.SaleCustomerDTO customer = new SaleDTO.SaleCustomerDTO();
            customer.setId(sale.getCustomer().getId());
            customer.setName(sale.getCustomer().getName());
            customer.setAccountBalance(sale.getCustomer().getAccountBalance());
            dto.setCustomer(customer);
        }
        dto.setUserId(sale.getUser() == null ? null : sale.getUser().getId());
        dto.setStoreId(sale.getStore() == null ? null : sale.getStore().getId());
        dto.setSaleItems(sale.getSaleItems().stream().map(item -> {
            final SaleDTO.SaleItemDTO i = new SaleDTO.SaleItemDTO();
            i.setId(item.getId());
            i.setProductId(item.getProduct() == null ? null : item.getProduct().getId());
            i.setProductName(item.getProductName());
            i.setSku(item.getSku());
            i.setQuantity(item.getQuantity());
            i.setUnitPrice(item.getUnitPrice());
            i.setTaxRate(item.getTaxRate());
            i.setTaxableAmount(item.getTaxableAmount());
            i.setLineTotal(item.getLineTotal());
            return i;
        }).toList());
        dto.setPayments(sale.getPayments().stream().map(payment -> {
            final SaleDTO.SalePaymentDTO p = new SaleDTO.SalePaymentDTO();
            p.setId(payment.getId());
            p.setAmount(payment.getAmount());
            p.setMethod(payment.getMethod());
            p.setReferenceNumber(payment.getReferenceNumber());
            p.setDescription(payment.getDescription());
            return p;
        }).toList());
        dto.setCreatedAt(sale.getDateCreated());
        dto.setLastUpdated(sale.getLastUpdated());
        return dto;
    }

    public SaleStockMovementDTO toMovementDTO(final StockMovement movement) {
        final SaleStockMovementDTO dto = new SaleStockMovementDTO();
        dto.setId(movement.getId());
        dto.setType(movement.getType());
        dto.setQuantity(movement.getQuantity());
        dto.setQuantityBefore(movement.getQuantityBefore());
        dto.setQuantityAfter(movement.getQuantityAfter());
        dto.setDescription(movement.getDescription());
        dto.setProductId(movement.getProduct().getId());
        dto.setSaleId(movement.getSale() == null ? null : movement.getSale().getId());
        dto.setSaleItemId(movement.getSaleItem() == null ? null : movement.getSaleItem().getId());
        dto.setCreatedAt(movement.getDateCreated());
        return dto;
    }
}
