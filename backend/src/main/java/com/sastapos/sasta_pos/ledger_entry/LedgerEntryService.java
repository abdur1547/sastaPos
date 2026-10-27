package com.sastapos.sasta_pos.ledger_entry;

import com.sastapos.sasta_pos.customer.Customer;
import com.sastapos.sasta_pos.customer.CustomerRepository;
import com.sastapos.sasta_pos.customer.dto.LedgerEntryDTO;
import com.sastapos.sasta_pos.ledger_entry.dto.LedgerSummaryDTO;
import com.sastapos.sasta_pos.payment.Payment;
import com.sastapos.sasta_pos.product.dto.PageResponse;
import com.sastapos.sasta_pos.sale.Sale;
import com.sastapos.sasta_pos.user.User;
import com.sastapos.sasta_pos.util.BadRequestException;
import com.sastapos.sasta_pos.util.NotFoundException;
import com.sastapos.sasta_pos.vendor.Vendor;
import com.sastapos.sasta_pos.vendor.VendorRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.criteria.Predicate;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

/** Manages ledger entries and queries for customers and vendors. */
@Service
@RequiredArgsConstructor
public class LedgerEntryService {

    private static final Set<String> ALLOWED_SORT_FIELDS = Set.of("occurredAt", "dateCreated", "amount", "type", "referenceNumber");
    private static final Map<String, String> SORT_FIELD_MAPPING = Map.of(
            "occurredAt", "dateCreated",
            "dateCreated", "dateCreated",
            "amount", "amount",
            "type", "type",
            "referenceNumber", "referenceNumber");

    private final LedgerEntryRepository ledgerEntryRepository;
    private final CustomerRepository customerRepository;
    private final VendorRepository vendorRepository;
    private final LedgerEntryMapper ledgerEntryMapper;
    private final EntityManager entityManager;

    public record LedgerFilter(
            OffsetDateTime from,
            OffsetDateTime to,
            LedgerDirection direction,
            List<LedgerEntryType> types,
            UUID saleId,
            UUID paymentId,
            Boolean voided,
            Boolean isReversal,
            String referenceNumber,
            String search,
            BigDecimal minAmount,
            BigDecimal maxAmount) {
    }

    /** One SALE debit for the total plus one PAYMENT credit per payment. */
    public List<LedgerEntry> recordSale(final Customer customer, final Sale sale) {
        final List<LedgerEntry> entries = new ArrayList<>();
        entries.add(newEntry(customer, LedgerDirection.DEBIT, LedgerEntryType.SALE, sale.getTotalAmount(),
                sale.getInvoiceNumber(), sale, "Sale " + sale.getInvoiceNumber()));
        for (final Payment payment : sale.getPayments()) {
            entries.add(newEntry(customer, LedgerDirection.CREDIT, LedgerEntryType.PAYMENT, payment.getAmount(),
                    sale.getInvoiceNumber(), sale, payment.getDescription()));
        }
        return ledgerEntryRepository.saveAll(entries);
    }

    /** Reverses {@link #recordSale}: credits the total back and debits whatever was paid. */
    public List<LedgerEntry> recordSaleReversal(final Customer customer, final Sale sale, final String reason) {
        final List<LedgerEntry> entries = new ArrayList<>();
        entries.add(newEntry(customer, LedgerDirection.CREDIT, LedgerEntryType.ADJUSTMENT,
                sale.getTotalAmount(), sale.getInvoiceNumber(), sale,
                "Reversal of SALE debit for voided sale " + sale.getInvoiceNumber() + ": " + reason));
        final BigDecimal paid = sale.getTotalPaid();
        if (paid.signum() > 0) {
            entries.add(newEntry(customer, LedgerDirection.DEBIT, LedgerEntryType.ADJUSTMENT, paid,
                    sale.getInvoiceNumber(), sale, "Reversal of PAYMENT credit(s) for voided sale "
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
        entry.setStore(customer.getStore());
        return entry;
    }

    @Transactional(readOnly = true)
    public PageResponse<LedgerEntryDTO> getLedger(final User user, final UUID partyId, final boolean isVendor,
            final LedgerFilter filter, final int page, final int size, final String sortBy, final String sortDir) {
        final UUID storeId = requireStoreId(user);
        validatePartyExists(partyId, isVendor, storeId);
        validatePagingAndSort(page, size, sortBy, sortDir, filter);

        final Sort.Direction direction = "asc".equalsIgnoreCase(sortDir) ? Sort.Direction.ASC : Sort.Direction.DESC;
        final String entityProperty = SORT_FIELD_MAPPING.getOrDefault(sortBy, "dateCreated");
        final Sort sort = Sort.by(direction, entityProperty).and(Sort.by(direction, "id"));
        final PageRequest pageRequest = PageRequest.of(page, size, sort);

        final Specification<LedgerEntry> spec = buildSpecification(storeId, partyId, isVendor, filter);
        final Page<LedgerEntry> result = ledgerEntryRepository.findAll(spec, pageRequest);
        return PageResponse.of(result.map(ledgerEntryMapper::toDTO));
    }

    @Transactional(readOnly = true)
    public LedgerSummaryDTO getLedgerSummary(final User user, final UUID partyId, final boolean isVendor,
            final LedgerFilter filter) {
        final UUID storeId = requireStoreId(user);
        final BigDecimal currentBalance = getPartyBalance(partyId, isVendor, storeId);

        // 1. openingBalance: sum of (DEBIT - CREDIT) for occurredAt < filter.from()
        final BigDecimal openingBalance;
        if (filter.from() != null) {
            openingBalance = computeBalanceUpTo(partyId, isVendor, storeId, filter.from(), false);
        } else {
            openingBalance = BigDecimal.ZERO.setScale(2);
        }

        // 2. closingBalance: sum of (DEBIT - CREDIT) for occurredAt <= filter.to()
        final BigDecimal closingBalance;
        if (filter.to() != null) {
            closingBalance = computeBalanceUpTo(partyId, isVendor, storeId, filter.to(), true);
        } else {
            closingBalance = currentBalance;
        }

        // 3. filtered debit and credit totals
        final List<LedgerEntry> matching = ledgerEntryRepository.findAll(buildSpecification(storeId, partyId, isVendor, filter));
        BigDecimal debitTotal = BigDecimal.ZERO.setScale(2);
        BigDecimal creditTotal = BigDecimal.ZERO.setScale(2);
        for (final LedgerEntry entry : matching) {
            if (entry.getDirection() == LedgerDirection.DEBIT) {
                debitTotal = debitTotal.add(entry.getAmount());
            } else if (entry.getDirection() == LedgerDirection.CREDIT) {
                creditTotal = creditTotal.add(entry.getAmount());
            }
        }
        final BigDecimal netChange = debitTotal.subtract(creditTotal);

        return new LedgerSummaryDTO(currentBalance, openingBalance, closingBalance, debitTotal, creditTotal, netChange);
    }

    private BigDecimal computeBalanceUpTo(final UUID partyId, final boolean isVendor, final UUID storeId,
            final OffsetDateTime boundary, final boolean inclusive) {
        final String column = isVendor ? "vendor_id" : "customer_id";
        final String op = inclusive ? "<=" : "<";
        final String sql = "SELECT COALESCE(SUM(CASE WHEN direction = 'DEBIT' THEN amount ELSE -amount END), 0) "
                + "FROM ledger_entries WHERE store_id = :storeId AND " + column + " = :partyId AND date_created " + op + " :boundary";

        final Object result = entityManager.createNativeQuery(sql)
                .setParameter("storeId", storeId)
                .setParameter("partyId", partyId)
                .setParameter("boundary", boundary)
                .getSingleResult();

        return result == null ? BigDecimal.ZERO.setScale(2) : ((Number) result instanceof BigDecimal bd ? bd.setScale(2) : new BigDecimal(result.toString()).setScale(2));
    }

    private BigDecimal getPartyBalance(final UUID partyId, final boolean isVendor, final UUID storeId) {
        if (isVendor) {
            final Vendor vendor = vendorRepository.findByIdAndStoreId(partyId, storeId)
                    .orElseThrow(() -> new NotFoundException("Vendor not found"));
            return vendor.getAccountBalance();
        } else {
            final Customer customer = customerRepository.findByIdAndStoreId(partyId, storeId)
                    .orElseThrow(() -> new NotFoundException("Customer not found"));
            return customer.getAccountBalance();
        }
    }

    private void validatePartyExists(final UUID partyId, final boolean isVendor, final UUID storeId) {
        if (isVendor) {
            if (!vendorRepository.existsById(partyId)) {
                throw new NotFoundException("Vendor not found");
            }
        } else {
            if (!customerRepository.existsById(partyId)) {
                throw new NotFoundException("Customer not found");
            }
        }
    }

    private void validatePagingAndSort(final int page, final int size, final String sortBy, final String sortDir,
            final LedgerFilter filter) {
        if (page < 0) {
            throw new BadRequestException("page must not be negative");
        }
        if (size <= 0 || size > 100) {
            throw new BadRequestException("size must be between 1 and 100");
        }
        if (!ALLOWED_SORT_FIELDS.contains(sortBy)) {
            throw new BadRequestException("sortBy must be one of: " + ALLOWED_SORT_FIELDS);
        }
        if (!"asc".equalsIgnoreCase(sortDir) && !"desc".equalsIgnoreCase(sortDir)) {
            throw new BadRequestException("sortDir must be 'asc' or 'desc'");
        }
        if (filter.minAmount() != null && filter.maxAmount() != null
                && filter.minAmount().compareTo(filter.maxAmount()) > 0) {
            throw new BadRequestException("minAmount cannot be greater than maxAmount");
        }
        if (filter.from() != null && filter.to() != null && filter.from().isAfter(filter.to())) {
            throw new BadRequestException("from date cannot be after to date");
        }
    }

    private Specification<LedgerEntry> buildSpecification(final UUID storeId, final UUID partyId, final boolean isVendor,
            final LedgerFilter filter) {
        return (root, query, cb) -> {
            final List<Predicate> predicates = new ArrayList<>();
            predicates.add(cb.equal(root.get("store").get("id"), storeId));
            if (isVendor) {
                predicates.add(cb.equal(root.get("vendor").get("id"), partyId));
            } else {
                predicates.add(cb.equal(root.get("customer").get("id"), partyId));
            }

            if (filter.from() != null) {
                predicates.add(cb.greaterThanOrEqualTo(root.get("dateCreated"), filter.from()));
            }
            if (filter.to() != null) {
                predicates.add(cb.lessThanOrEqualTo(root.get("dateCreated"), filter.to()));
            }
            if (filter.direction() != null) {
                predicates.add(cb.equal(root.get("direction"), filter.direction()));
            }
            if (filter.types() != null && !filter.types().isEmpty()) {
                predicates.add(root.get("type").in(filter.types()));
            }
            if (filter.saleId() != null) {
                predicates.add(cb.equal(root.get("sale").get("id"), filter.saleId()));
            }
            if (filter.paymentId() != null) {
                predicates.add(cb.equal(root.get("payment").get("id"), filter.paymentId()));
            }
            if (filter.voided() != null) {
                predicates.add(cb.equal(root.get("voided"), filter.voided()));
            }
            if (filter.isReversal() != null) {
                if (filter.isReversal()) {
                    predicates.add(cb.isNotNull(root.get("reversalOfEntry")));
                } else {
                    predicates.add(cb.isNull(root.get("reversalOfEntry")));
                }
            }
            if (StringUtils.hasText(filter.referenceNumber())) {
                predicates.add(cb.equal(cb.lower(root.get("referenceNumber")), filter.referenceNumber().trim().toLowerCase(Locale.ROOT)));
            }
            if (StringUtils.hasText(filter.search())) {
                final String pattern = "%" + escapeLike(filter.search().trim().toLowerCase(Locale.ROOT)) + "%";
                predicates.add(cb.or(
                        cb.like(cb.lower(root.get("referenceNumber")), pattern, '\\'),
                        cb.like(cb.lower(root.get("description")), pattern, '\\')));
            }
            if (filter.minAmount() != null) {
                predicates.add(cb.greaterThanOrEqualTo(root.get("amount"), filter.minAmount()));
            }
            if (filter.maxAmount() != null) {
                predicates.add(cb.lessThanOrEqualTo(root.get("amount"), filter.maxAmount()));
            }

            return cb.and(predicates.toArray(new Predicate[0]));
        };
    }

    private static String escapeLike(final String value) {
        return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }

    private UUID requireStoreId(final User user) {
        if (user.getStore() == null) {
            throw new NotFoundException("You don't have a store yet");
        }
        return user.getStore().getId();
    }

}
