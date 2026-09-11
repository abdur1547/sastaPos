package com.sastapos.sasta_pos.sale_item;

import com.sastapos.sasta_pos.events.BeforeDeleteProduct;
import com.sastapos.sasta_pos.events.BeforeDeleteSale;
import com.sastapos.sasta_pos.util.ReferencedException;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;


@Service
public class SaleItemService {

    private final SaleItemRepository saleItemRepository;

    public SaleItemService(final SaleItemRepository saleItemRepository) {
        this.saleItemRepository = saleItemRepository;
    }

    @EventListener(BeforeDeleteSale.class)
    public void on(final BeforeDeleteSale event) {
        final ReferencedException referencedException = new ReferencedException();
        final SaleItem saleSaleItem = saleItemRepository.findFirstBySaleId(event.getId());
        if (saleSaleItem != null) {
            referencedException.setKey("sale.saleItem.sale.referenced");
            referencedException.addParam(saleSaleItem.getId());
            throw referencedException;
        }
    }

    @EventListener(BeforeDeleteProduct.class)
    public void on(final BeforeDeleteProduct event) {
        final ReferencedException referencedException = new ReferencedException();
        final SaleItem productSaleItem = saleItemRepository.findFirstByProductId(event.getId());
        if (productSaleItem != null) {
            referencedException.setKey("product.saleItem.product.referenced");
            referencedException.addParam(productSaleItem.getId());
            throw referencedException;
        }
    }

}
