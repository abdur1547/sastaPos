package com.sastapos.sasta_pos.customer;

import com.sastapos.sasta_pos.customer.dto.CreateCustomerPaymentRequestDTO;
import com.sastapos.sasta_pos.customer.dto.CreateCustomerRequestDTO;
import com.sastapos.sasta_pos.customer.dto.CustomerDTO;
import com.sastapos.sasta_pos.customer.dto.CustomerPaymentResponse;
import com.sastapos.sasta_pos.customer.dto.DeleteCustomerResponse;
import com.sastapos.sasta_pos.customer.dto.LedgerEntryDTO;
import com.sastapos.sasta_pos.customer.dto.UpdateCustomerRequestDTO;
import com.sastapos.sasta_pos.customer.dto.VoidCustomerPaymentRequestDTO;
import com.sastapos.sasta_pos.customer.dto.VoidCustomerPaymentResponse;
import com.sastapos.sasta_pos.events.BeforeDeleteStore;
import com.sastapos.sasta_pos.ledger_entry.LedgerDirection;
import com.sastapos.sasta_pos.ledger_entry.LedgerEntry;
import com.sastapos.sasta_pos.ledger_entry.LedgerEntryMapper;
import com.sastapos.sasta_pos.ledger_entry.LedgerEntryRepository;
import com.sastapos.sasta_pos.ledger_entry.LedgerEntryType;
import com.sastapos.sasta_pos.product.dto.PageResponse;
import com.sastapos.sasta_pos.payment.Payment;
import com.sastapos.sasta_pos.payment.PaymentMethod;
import com.sastapos.sasta_pos.payment.PaymentRepository;
import com.sastapos.sasta_pos.sale.SaleRepository;
import com.sastapos.sasta_pos.store.RowStatus;
import com.sastapos.sasta_pos.store.StoreRepository;
import com.sastapos.sasta_pos.user.User;
import com.sastapos.sasta_pos.user.UserRole;
import com.sastapos.sasta_pos.util.BadRequestException;
import com.sastapos.sasta_pos.util.ConflictException;
import com.sastapos.sasta_pos.util.ForbiddenException;
import com.sastapos.sasta_pos.util.MoneyLimits;
import com.sastapos.sasta_pos.util.NotFoundException;
import com.sastapos.sasta_pos.util.ReferencedException;
import jakarta.persistence.criteria.Predicate;
import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.context.event.EventListener;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;


/**
 * Every operation is scoped to the authenticated user's store; foreign customers look like 404s.
 * {@code accountBalance} only changes through ledger postings (payments and their voids), always
 * under a row lock on the customer so concurrent postings cannot lose updates.
 */
@Service
@RequiredArgsConstructor
public class CustomerService {

    static final int MAX_PAGE_SIZE = 100;
    /** Largest magnitude representable by numeric(18,2). */
    private static final BigDecimal MAX_BALANCE = MoneyLimits.MAX_AMOUNT;
    private static final Map<String, String> SORTABLE_FIELDS = Map.of(
            "name", "name",
            "accountBalance", "accountBalance",
            "createdAt", "dateCreated");

    private final CustomerRepository customerRepository;
    private final StoreRepository storeRepository;
    private final SaleRepository saleRepository;
    private final LedgerEntryRepository ledgerEntryRepository;
    private final LedgerEntryMapper ledgerEntryMapper;
    private final PaymentRepository paymentRepository;
    private final CustomerPaymentPosting paymentPosting;
    private final EntityManager entityManager;

    public record CustomerFilter(String search, RowStatus status, Boolean hasBalance, BigDecimal minBalance,
                                 BigDecimal maxBalance) {
    }

    @Transactional(readOnly = true)
    public PageResponse<CustomerDTO> findAll(final User user, final CustomerFilter filter, final int page,
            final int size, final String sortBy, final String sortDir) {
        final UUID storeId = requireStoreId(user);
        if (filter.minBalance() != null && filter.maxBalance() != null
                && filter.minBalance().compareTo(filter.maxBalance()) > 0) {
            throw new BadRequestException("minBalance must be <= maxBalance");
        }
        if (page < 0) {
            throw new BadRequestException("page must be >= 0");
        }
        if (size < 1) {
            throw new BadRequestException("size must be >= 1");
        }
        final String sortField = SORTABLE_FIELDS.get(sortBy);
        if (sortField == null) {
            throw new BadRequestException("sortBy must be one of " + SORTABLE_FIELDS.keySet().stream().sorted().toList());
        }
        final Sort.Direction direction = switch (sortDir.toLowerCase(Locale.ROOT)) {
            case "asc" -> Sort.Direction.ASC;
            case "desc" -> Sort.Direction.DESC;
            default -> throw new BadRequestException("sortDir must be 'asc' or 'desc'");
        };

        final PageRequest pageable = PageRequest.of(page, Math.min(size, MAX_PAGE_SIZE),
                Sort.by(new Sort.Order(direction, sortField).ignoreCase()).and(Sort.by("id")));
        final Page<CustomerDTO> result = customerRepository.findAll(buildSpecification(storeId, filter), pageable)
                .map(this::mapToDTO);
        return PageResponse.of(result);
    }

    @Transactional(readOnly = true)
    public CustomerDTO get(final User user, final UUID id) {
        return mapToDTO(requireCustomer(id, requireStoreId(user)));
    }

    @Transactional
    public CustomerDTO create(final User user, final CreateCustomerRequestDTO request) {
        final UUID storeId = requireStoreId(user);
        final String name = request.getName().trim();
        final String phone = trimToNull(request.getPhoneNumber());

        if (customerRepository.existsByStoreIdAndNameIgnoreCase(storeId, name)) {
            throw new ConflictException("A customer with this name already exists");
        }
        if (phone != null && customerRepository.existsByPhoneNumber(phone)) {
            throw new ConflictException("A customer with this phoneNumber already exists");
        }

        final Customer customer = new Customer();
        customer.setName(name);
        customer.setPhoneNumber(phone);
        customer.setNtn(trimToNull(request.getNtn()));
        customer.setStore(storeRepository.getReferenceById(storeId));
        return mapToDTO(saveUnique(customer));
    }

    @Transactional
    public CustomerDTO update(final User user, final UUID id, final UpdateCustomerRequestDTO request) {
        final UUID storeId = requireStoreId(user);
        final Customer customer = requireCustomer(id, storeId);

        if (request.getName() != null) {
            final String name = request.getName().trim();
            if (customerRepository.existsByStoreIdAndNameIgnoreCaseAndIdNot(storeId, name, id)) {
                throw new ConflictException("A customer with this name already exists");
            }
            customer.setName(name);
        }
        if (request.getPhoneNumber() != null) {
            final String phone = trimToNull(request.getPhoneNumber());
            if (phone != null && customerRepository.existsByPhoneNumberAndIdNot(phone, id)) {
                throw new ConflictException("A customer with this phoneNumber already exists");
            }
            customer.setPhoneNumber(phone);
        }
        if (request.getNtn() != null) {
            customer.setNtn(trimToNull(request.getNtn()));
        }
        if (request.getStatus() != null) {
            customer.setStatus(request.getStatus());
        }
        return mapToDTO(saveUnique(customer));
    }

    /**
     * Hard-deletes a customer with a zero balance and no history; deactivates one that has sales or
     * ledger entries; refuses when a balance is outstanding. Returns {@code null} for a hard delete.
     */
    @Transactional
    public DeleteCustomerResponse delete(final User user, final UUID id) {
        final Customer customer = requireCustomerForUpdate(id, requireStoreId(user));
        if (customer.getAccountBalance().signum() != 0) {
            throw new ConflictException("Customer has an outstanding balance of "
                    + customer.getAccountBalance().toPlainString() + "; settle it before deleting");
        }
        if (saleRepository.existsByCustomerId(id) || ledgerEntryRepository.existsByCustomerId(id)) {
            customer.setStatus(RowStatus.INACTIVE);
            customerRepository.saveAndFlush(customer);
            return new DeleteCustomerResponse(
                    "Customer has sale/ledger history and was deactivated instead of deleted", mapToDTO(customer));
        }
        customerRepository.delete(customer);
        return null;
    }

    @Transactional
    public CustomerPaymentResponse takePayment(final User user, final UUID customerId,
            final CreateCustomerPaymentRequestDTO request) {
        final Customer customer = requireCustomerForUpdate(customerId, requireStoreId(user));
        final BigDecimal amount = request.getAmount().setScale(2);
        final BigDecimal newBalance = customer.getAccountBalance().subtract(amount);
        requireBalanceInRange(newBalance);

        final Payment payment = new Payment();
        payment.setAmount(amount);
        payment.setMethod(PaymentMethod.valueOf(request.getMethod().name()));
        payment.setReferenceNumber(trimToNull(request.getReferenceNumber()));
        payment.setDescription(trimToNull(request.getDescription()));
        payment.setCustomer(customer);
        payment.setStore(user.getStore());
        payment.setUser(user);
        paymentRepository.saveAndFlush(payment);
        paymentPosting.post(requireStoreId(user), List.of(payment.getId()));
        entityManager.refresh(customer);
        final LedgerEntry entry = ledgerEntryRepository.findById(payment.getId()).orElseThrow();
        return new CustomerPaymentResponse(mapEntry(entry), mapToDTO(customer));
    }

    /** Voids a payment by flagging it and posting an offsetting DEBIT/ADJUSTMENT entry; nothing is deleted. */
    @Transactional
    public VoidCustomerPaymentResponse voidPayment(final User user, final UUID customerId,
            final UUID ledgerEntryId, final VoidCustomerPaymentRequestDTO request) {
        final UUID storeId = requireStoreId(user);
        if (user.getRole() != UserRole.OWNER) {
            throw new ForbiddenException("Only the store owner can void a payment");
        }
        final Customer customer = requireCustomerForUpdate(customerId, storeId);
        final LedgerEntry original = ledgerEntryRepository.findByIdAndCustomerId(ledgerEntryId, customerId)
                .orElseThrow(() -> new NotFoundException("Payment not found"));
        if (original.getType() != LedgerEntryType.PAYMENT) {
            throw new BadRequestException("Only PAYMENT ledger entries can be voided");
        }
        if (original.isVoided()) {
            throw new ConflictException("Payment is already voided");
        }
        final BigDecimal newBalance = customer.getAccountBalance().add(original.getAmount());
        requireBalanceInRange(newBalance);

        final String reason = request.getVoidReason().trim();
        original.setVoided(true);
        original.setVoidReason(reason);
        original.setVoidedAt(OffsetDateTime.now());
        original.setVoidedBy(user);
        ledgerEntryRepository.saveAndFlush(original);

        final LedgerEntry reversal = new LedgerEntry();
        reversal.setDirection(LedgerDirection.DEBIT);
        reversal.setType(LedgerEntryType.ADJUSTMENT);
        reversal.setAmount(original.getAmount());
        reversal.setReferenceNumber(original.getReferenceNumber());
        reversal.setDescription("Reversal of PAYMENT voided: " + reason);
        reversal.setCustomer(customer);
        reversal.setSale(original.getSale());
        reversal.setStore(user.getStore());
        reversal.setUser(user);
        reversal.setReversalOfEntry(original);
        ledgerEntryRepository.saveAndFlush(reversal);

        customer.setAccountBalance(newBalance);
        customerRepository.saveAndFlush(customer);
        return new VoidCustomerPaymentResponse(mapEntry(original), mapEntry(reversal), mapToDTO(customer));
    }

    private Specification<Customer> buildSpecification(final UUID storeId, final CustomerFilter filter) {
        return (root, query, cb) -> {
            final List<Predicate> predicates = new ArrayList<>();
            predicates.add(cb.equal(root.get("store").get("id"), storeId));
            predicates.add(cb.equal(root.get("status"),
                    filter.status() == null ? RowStatus.ACTIVE : filter.status()));
            if (StringUtils.hasText(filter.search())) {
                final String pattern = "%" + escapeLike(filter.search().trim().toLowerCase(Locale.ROOT)) + "%";
                predicates.add(cb.or(
                        cb.like(cb.lower(root.get("name")), pattern, '\\'),
                        cb.like(cb.lower(root.get("phoneNumber")), pattern, '\\'),
                        cb.like(cb.lower(root.get("ntn")), pattern, '\\')));
            }
            if (filter.hasBalance() != null) {
                predicates.add(filter.hasBalance()
                        ? cb.notEqual(root.<BigDecimal>get("accountBalance"), BigDecimal.ZERO)
                        : cb.equal(root.<BigDecimal>get("accountBalance"), BigDecimal.ZERO));
            }
            if (filter.minBalance() != null) {
                predicates.add(cb.greaterThanOrEqualTo(root.get("accountBalance"), filter.minBalance()));
            }
            if (filter.maxBalance() != null) {
                predicates.add(cb.lessThanOrEqualTo(root.get("accountBalance"), filter.maxBalance()));
            }
            return cb.and(predicates.toArray(new Predicate[0]));
        };
    }

    private Customer saveUnique(final Customer customer) {
        try {
            return customerRepository.saveAndFlush(customer);
        } catch (final DataIntegrityViolationException e) {
            // lost a race against the unique indexes on name / phoneNumber
            throw new ConflictException("A customer with this name or phoneNumber already exists");
        }
    }

    private static void requireBalanceInRange(final BigDecimal balance) {
        if (balance.abs().compareTo(MAX_BALANCE) > 0) {
            throw new BadRequestException("Resulting account balance is out of range");
        }
    }

    private static String escapeLike(final String value) {
        return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }

    private static String trimToNull(final String value) {
        return StringUtils.hasText(value) ? value.trim() : null;
    }

    private UUID requireStoreId(final User user) {
        if (user.getStore() == null) {
            throw new NotFoundException("You don't have a store yet");
        }
        return user.getStore().getId();
    }

    /** Looks up an ACTIVE customer of the store for a sale, optionally taking a row lock. */
    @Transactional(propagation = Propagation.MANDATORY)
    public Customer findActiveForSale(final UUID id, final UUID storeId, final boolean lock) {
        final Customer customer = lock ? requireCustomerForUpdate(id, storeId) : requireCustomer(id, storeId);
        if (customer.getStatus() != RowStatus.ACTIVE) {
            throw new BadRequestException("Customer is not active");
        }
        return customer;
    }

    public Customer lockForUpdate(final UUID id, final UUID storeId) {
        return requireCustomerForUpdate(id, storeId);
    }

    /** Adds delta (positive = customer owes more) to the balance of an already locked customer. */
    public void adjustBalance(final Customer customer, final BigDecimal delta) {
        final BigDecimal newBalance = customer.getAccountBalance().add(delta);
        requireBalanceInRange(newBalance);
        customer.setAccountBalance(newBalance);
        customerRepository.save(customer);
    }

    private Customer requireCustomer(final UUID id, final UUID storeId) {
        return customerRepository.findByIdAndStoreId(id, storeId)
                .orElseThrow(() -> new NotFoundException("Customer not found"));
    }

    private Customer requireCustomerForUpdate(final UUID id, final UUID storeId) {
        return customerRepository.findByIdAndStoreIdForUpdate(id, storeId)
                .orElseThrow(() -> new NotFoundException("Customer not found"));
    }

    private CustomerDTO mapToDTO(final Customer customer) {
        final CustomerDTO dto = new CustomerDTO();
        dto.setId(customer.getId());
        dto.setName(customer.getName());
        dto.setPhoneNumber(customer.getPhoneNumber());
        dto.setNtn(customer.getNtn());
        dto.setAccountBalance(customer.getAccountBalance());
        dto.setStatus(customer.getStatus());
        dto.setStoreId(customer.getStore().getId());
        dto.setCreatedAt(customer.getDateCreated());
        dto.setLastUpdated(customer.getLastUpdated());
        return dto;
    }

    private LedgerEntryDTO mapEntry(final LedgerEntry entry) {
        return ledgerEntryMapper.toDTO(entry);
    }

    @EventListener(BeforeDeleteStore.class)
    public void on(final BeforeDeleteStore event) {
        final Customer storeCustomer = customerRepository.findFirstByStoreIdOrderByIdAsc(event.getId());
        if (storeCustomer != null) {
            final ReferencedException referencedException = new ReferencedException();
            referencedException.setKey("store.customer.store.referenced");
            referencedException.addParam(storeCustomer.getId());
            throw referencedException;
        }
    }

}
