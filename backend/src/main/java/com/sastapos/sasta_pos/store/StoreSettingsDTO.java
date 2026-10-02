package com.sastapos.sasta_pos.store;

import java.util.UUID;
import lombok.Getter;
import lombok.Setter;


/**
 * Read-only view of a store's settings. {@code nextInvoiceNumber} is system-managed and never
 * accepted back from a client.
 */
@Getter
@Setter
public class StoreSettingsDTO {

    private UUID id;

    private String invoicePrefix;

    private Integer invoiceNumberStart;

    private Integer nextInvoiceNumber;

    private String receiptFooter;

}
