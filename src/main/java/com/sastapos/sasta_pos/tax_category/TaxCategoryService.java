package com.sastapos.sasta_pos.tax_category;

import com.sastapos.sasta_pos.events.BeforeDeleteStore;
import com.sastapos.sasta_pos.util.ReferencedException;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;


@Service
public class TaxCategoryService {

    private final TaxCategoryRepository taxCategoryRepository;

    public TaxCategoryService(final TaxCategoryRepository taxCategoryRepository) {
        this.taxCategoryRepository = taxCategoryRepository;
    }

    @EventListener(BeforeDeleteStore.class)
    public void on(final BeforeDeleteStore event) {
        final ReferencedException referencedException = new ReferencedException();
        final TaxCategory storeTaxCategory = taxCategoryRepository.findFirstByStoreId(event.getId());
        if (storeTaxCategory != null) {
            referencedException.setKey("store.taxCategory.store.referenced");
            referencedException.addParam(storeTaxCategory.getId());
            throw referencedException;
        }
    }

}
