package com.sastapos.sasta_pos.payment;

import com.sastapos.sasta_pos.customer.Customer;
import com.sastapos.sasta_pos.customer.CustomerRepository;
import com.sastapos.sasta_pos.customer.dto.LedgerEntryDTO;
import com.sastapos.sasta_pos.ledger_entry.LedgerDirection;
import com.sastapos.sasta_pos.ledger_entry.LedgerEntry;
import com.sastapos.sasta_pos.ledger_entry.LedgerEntryMapper;
import com.sastapos.sasta_pos.ledger_entry.LedgerEntryRepository;
import com.sastapos.sasta_pos.ledger_entry.LedgerEntryType;
import com.sastapos.sasta_pos.payment.dto.PaymentDTO;
import com.sastapos.sasta_pos.product.dto.PageResponse;
import com.sastapos.sasta_pos.user.User;
import com.sastapos.sasta_pos.user.UserRole;
import com.sastapos.sasta_pos.util.BadRequestException;
import com.sastapos.sasta_pos.util.ConflictException;
import com.sastapos.sasta_pos.util.ForbiddenException;
import com.sastapos.sasta_pos.util.NotFoundException;
import com.sastapos.sasta_pos.vendor.Vendor;
import com.sastapos.sasta_pos.vendor.VendorRepository;
import com.sastapos.sasta_pos.vendor.VendorService;
import com.sastapos.sasta_pos.vendor.dto.VoidSettlementRequestDTO;
import com.sastapos.sasta_pos.vendor.dto.VoidSettlementResponse;
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

@Service
@RequiredArgsConstructor
public class PaymentService {

    private static final Set<String> ALLOWED_SORT_FIELDS = Set.of("occurredAt", "dateCreated", "amount", "direction", "method");
    private static final Map<String, String> SORT_FIELD_MAPPING = Map.of(
            "occurredAt", "dateCreated",
            "dateCreated", "dateCreated",
            "amount", "amount",
            "direction", "direction",
            "method", "method");

    private final PaymentRepository paymentRepository;
    private final LedgerEntryRepository ledgerEntryRepository;
    private final CustomerRepository customerRepository;
    private final VendorRepository vendorRepository;
    private final PaymentMapper paymentMapper;
    private final LedgerEntryMapper ledgerEntryMapper;
    private final VendorService vendorService;

    public record PaymentFilter(
            OffsetDateTime from,
            OffsetDateTime to,
            UUID customerId,
            UUID vendorId,
            UUID saleId,
            UUID userId,
            PaymentDirection direction,
            PaymentMethod method,
            Boolean voided,
            BigDecimal minAmount,
            BigDecimal maxAmount,
            String search) {
    }

    @Transactional(readOnly = true)
    public PageResponse<PaymentDTO> findAll(final User user, final PaymentFilter filter,
            final int page, final int size, final String sortBy, final String sortDir) {
        final UUID storeId = requireStoreId(user);
        if (page < 0) {
            throw new BadRequestException("page must not be negative");
        }
        if (size <= 0 || size > 100) {
            throw new BadRequestException("size must be between 1 and 100");
        }
        if (filter.customerId() != null && filter.vendorId() != null) {
            throw new BadRequestException("customerId and vendorId are mutually exclusive");
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

        final Sort.Direction direction = "asc".equalsIgnoreCase(sortDir) ? Sort.Direction.ASC : Sort.Direction.DESC;
        final String entityProperty = SORT_FIELD_MAPPING.getOrDefault(sortBy, "dateCreated");
        final Sort sort = Sort.by(direction, entityProperty).and(Sort.by(direction, "id"));
        final PageRequest pageRequest = PageRequest.of(page, size, sort);

        final Specification<Payment> spec = buildSpecification(storeId, filter);
        final Page<Payment> result = paymentRepository.findAll(spec, pageRequest);
        return PageResponse.of(result.map(paymentMapper::toDTO));
    }

    @Transactional(readOnly = true)
    public PaymentDTO get(final User user, final UUID id) {
        final UUID storeId = requireStoreId(user);
        final Payment payment = paymentRepository.findByIdAndStoreId(id, storeId)
                .orElseThrow(() -> new NotFoundException("Payment not found"));
        return paymentMapper.toDTO(payment);
    }

    @Transactional
    public VoidSettlementResponse voidStandalonePayment(final User user, final UUID paymentId,
            final VoidSettlementRequestDTO request) {
        final UUID storeId = requireStoreId(user);
        if (user.getRole() != UserRole.OWNER) {
            throw new ForbiddenException("Only the store owner can void a payment");
        }
        final String voidReason = request.getVoidReason() != null ? request.getVoidReason().trim() : null;
        if (!StringUtils.hasText(voidReason)) {
            throw new BadRequestException("voidReason cannot be blank");
        }

        final Payment payment = paymentRepository.findByIdAndStoreIdForUpdate(paymentId, storeId)
                .orElseThrow(() -> new NotFoundException("Payment not found"));

        if (payment.getSale() != null) {
            throw new BadRequestException("Document-linked payment changes must use the document's void/return workflow");
        }
        if (payment.isVoided()) {
            throw new ConflictException("Payment is already voided");
        }

        final LedgerEntry originalEntry = ledgerEntryRepository.findByPaymentIdAndType(payment.getId(), LedgerEntryType.PAYMENT)
                .orElseThrow(() -> new NotFoundException("Linked PAYMENT ledger entry not found"));

        if (originalEntry.isVoided()) {
            throw new ConflictException("Payment is already voided");
        }

        final OffsetDateTime now = OffsetDateTime.now();
        payment.setVoided(true);
        payment.setVoidReason(voidReason);
        payment.setVoidedAt(now);
        payment.setVoidedBy(user);
        paymentRepository.saveAndFlush(payment);

        originalEntry.setVoided(true);
        originalEntry.setVoidReason(voidReason);
        originalEntry.setVoidedAt(now);
        originalEntry.setVoidedBy(user);
        ledgerEntryRepository.saveAndFlush(originalEntry);

        // Reversal direction is opposite to the original entry's direction
        final LedgerDirection reversalDirection = originalEntry.getDirection() == LedgerDirection.CREDIT
                ? LedgerDirection.DEBIT
                : LedgerDirection.CREDIT;

        final LedgerEntry reversalEntry = new LedgerEntry();
        reversalEntry.setDirection(reversalDirection);
        reversalEntry.setType(LedgerEntryType.ADJUSTMENT);
        reversalEntry.setAmount(originalEntry.getAmount());
        reversalEntry.setReferenceNumber(originalEntry.getReferenceNumber());
        reversalEntry.setDescription("Reversal of PAYMENT voided: " + voidReason);
        reversalEntry.setStore(user.getStore());
        reversalEntry.setUser(user);
        reversalEntry.setReversalOfEntry(originalEntry);

        Vendor updatedVendor = null;
        if (payment.getVendor() != null) {
            final Vendor vendor = vendorRepository.findByIdAndStoreIdForUpdate(payment.getVendor().getId(), storeId)
                    .orElseThrow(() -> new NotFoundException("Vendor not found"));
            reversalEntry.setVendor(vendor);
            // If reversal is DEBIT, balance increases by amount; if CREDIT, balance decreases by amount
            final BigDecimal delta = reversalDirection == LedgerDirection.DEBIT
                    ? originalEntry.getAmount()
                    : originalEntry.getAmount().negate();
            vendor.setAccountBalance(vendor.getAccountBalance().add(delta));
            vendorRepository.saveAndFlush(vendor);
            updatedVendor = vendor;
        } else if (payment.getCustomer() != null) {
            final Customer customer = customerRepository.findByIdAndStoreIdForUpdate(payment.getCustomer().getId(), storeId)
                    .orElseThrow(() -> new NotFoundException("Customer not found"));
            reversalEntry.setCustomer(customer);
            final BigDecimal delta = reversalDirection == LedgerDirection.DEBIT
                    ? originalEntry.getAmount()
                    : originalEntry.getAmount().negate();
            customer.setAccountBalance(customer.getAccountBalance().add(delta));
            customerRepository.saveAndFlush(customer);
        } else {
            throw new BadRequestException("Payment does not belong to a party");
        }

        ledgerEntryRepository.saveAndFlush(reversalEntry);

        return new VoidSettlementResponse(
                paymentMapper.toDTO(payment),
                ledgerEntryMapper.toDTO(originalEntry),
                ledgerEntryMapper.toDTO(reversalEntry),
                updatedVendor != null ? vendorService.mapToDTO(updatedVendor) : null
        );
    }

    private Specification<Payment> buildSpecification(final UUID storeId, final PaymentFilter filter) {
        return (root, query, cb) -> {
            final List<Predicate> predicates = new ArrayList<>();
            predicates.add(cb.equal(root.get("store").get("id"), storeId));

            if (filter.customerId() != null) {
                predicates.add(cb.equal(root.get("customer").get("id"), filter.customerId()));
            }
            if (filter.vendorId() != null) {
                predicates.add(cb.equal(root.get("vendor").get("id"), filter.vendorId()));
            }
            if (filter.saleId() != null) {
                predicates.add(cb.equal(root.get("sale").get("id"), filter.saleId()));
            }
            if (filter.userId() != null) {
                predicates.add(cb.equal(root.get("user").get("id"), filter.userId()));
            }
            if (filter.direction() != null) {
                predicates.add(cb.equal(root.get("direction"), filter.direction()));
            }
            if (filter.method() != null) {
                predicates.add(cb.equal(root.get("method"), filter.method()));
            }
            if (filter.voided() != null) {
                predicates.add(cb.equal(root.get("voided"), filter.voided()));
            }
            if (filter.from() != null) {
                predicates.add(cb.greaterThanOrEqualTo(root.get("dateCreated"), filter.from()));
            }
            if (filter.to() != null) {
                predicates.add(cb.lessThanOrEqualTo(root.get("dateCreated"), filter.to()));
            }
            if (filter.minAmount() != null) {
                predicates.add(cb.greaterThanOrEqualTo(root.get("amount"), filter.minAmount()));
            }
            if (filter.maxAmount() != null) {
                predicates.add(cb.lessThanOrEqualTo(root.get("amount"), filter.maxAmount()));
            }
            if (StringUtils.hasText(filter.search())) {
                final String pattern = "%" + escapeLike(filter.search().trim().toLowerCase(Locale.ROOT)) + "%";
                predicates.add(cb.or(
                        cb.like(cb.lower(root.get("referenceNumber")), pattern, '\\'),
                        cb.like(cb.lower(root.get("description")), pattern, '\\')));
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
