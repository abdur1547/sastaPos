package com.sastapos.sasta_pos.ledger_entry;

import com.sastapos.sasta_pos.customer.Customer;
import com.sastapos.sasta_pos.payment.Payment;
import com.sastapos.sasta_pos.sale.Sale;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

/** Writes the customer ledger entries that a sale (or its void) produces. */
@Service
@RequiredArgsConstructor
public class LedgerEntryService {

    private final LedgerEntryRepository ledgerEntryRepository;

    /** One SALE debit for the total plus one PAYMENT credit per payment. */
    public List<LedgerEntry> recordSale(final Customer customer, final Sale sale) {
        final List<LedgerEntry> entries = new ArrayList<>();
        entries.add(newEntry(customer, LedgerDirection.DEBIT, LedgerEntryType.SALE, sale.getTotalAmount(),
                sale.getInvoiceNumber(), sale, "Sale " + sale.getInvoiceNumber()));
        for (final Payment payment : sale.getPayments()) {
            entries.add(newEntry(customer, LedgerDirection.CREDIT, LedgerEntryType.PAYMENT, payment.getAmount(),
                    sale.getInvoiceNumber(), null, payment.getDescription()));
        }
        return ledgerEntryRepository.saveAll(entries);
    }

    /** Reverses {@link #recordSale}: credits the total back and debits whatever was paid. */
    public List<LedgerEntry> recordSaleReversal(final Customer customer, final Sale sale, final String reason) {
        final List<LedgerEntry> entries = new ArrayList<>();
        entries.add(newEntry(customer, LedgerDirection.CREDIT, LedgerEntryType.ADJUSTMENT,
                sale.getTotalAmount(), sale.getInvoiceNumber(), null,
                "Reversal of SALE debit for voided sale " + sale.getInvoiceNumber() + ": " + reason));
        final BigDecimal paid = sale.getTotalPaid();
        if (paid.signum() > 0) {
            entries.add(newEntry(customer, LedgerDirection.DEBIT, LedgerEntryType.ADJUSTMENT, paid,
                    sale.getInvoiceNumber(), null, "Reversal of PAYMENT credit(s) for voided sale "
                            + sale.getInvoiceNumber() + ": " + reason));
        }
        return ledgerEntryRepository.saveAll(entries);
    }

    private static LedgerEntry newEntry(final Customer customer, final LedgerDirection direction,
            final LedgerEntryType type, final BigDecimal amount, final String reference, final Sale sale,
            final String description) {
        final LedgerEntry entry = new LedgerEntry();
        entry.setCustomer(customer);
        entry.setDirection(direction);
        entry.setType(type);
        entry.setAmount(amount);
        entry.setReferenceNumber(reference);
        entry.setSale(sale);
        entry.setDescription(description);
        return entry;
    }
}
