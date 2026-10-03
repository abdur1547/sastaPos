package com.sastapos.sasta_pos.store.dto;

import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;


/**
 * Partial update of a store's settings (PATCH semantics: only non-null fields are applied).
 * {@code nextInvoiceNumber} is never accepted here — it is strictly system-managed.
 */
@Getter
@Setter
public class UpdateStoreSettingsRequest {

    @Size(max = 50)
    private String invoicePrefix;

    @Positive
    private Integer invoiceNumberStart;

    @Size(max = 1000)
    private String receiptFooter;

}
