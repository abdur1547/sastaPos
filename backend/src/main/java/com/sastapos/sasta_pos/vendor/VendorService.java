package com.sastapos.sasta_pos.vendor;

import com.sastapos.sasta_pos.customer.dto.LedgerEntryDTO;
import com.sastapos.sasta_pos.ledger_entry.LedgerDirection;
import com.sastapos.sasta_pos.ledger_entry.LedgerEntry;
import com.sastapos.sasta_pos.ledger_entry.LedgerEntryMapper;
import com.sastapos.sasta_pos.ledger_entry.LedgerEntryRepository;
import com.sastapos.sasta_pos.ledger_entry.LedgerEntryType;
import com.sastapos.sasta_pos.payment.Payment;
import com.sastapos.sasta_pos.payment.PaymentDirection;
import com.sastapos.sasta_pos.payment.PaymentMapper;
import com.sastapos.sasta_pos.payment.PaymentRepository;
import com.sastapos.sasta_pos.product.dto.PageResponse;
import com.sastapos.sasta_pos.store.RowStatus;
import com.sastapos.sasta_pos.user.User;
import com.sastapos.sasta_pos.util.BadRequestException;
import com.sastapos.sasta_pos.util.ConflictException;
import com.sastapos.sasta_pos.util.NotFoundException;
import com.sastapos.sasta_pos.vendor.dto.CreateVendorRequestDTO;
import com.sastapos.sasta_pos.vendor.dto.DeleteVendorResponse;
import com.sastapos.sasta_pos.vendor.dto.RecordSettlementRequestDTO;
import com.sastapos.sasta_pos.vendor.dto.SettlementResponse;
import com.sastapos.sasta_pos.vendor.dto.UpdateVendorRequestDTO;
import com.sastapos.sasta_pos.vendor.dto.VendorDTO;
import com.sastapos.sasta_pos.vendor.dto.VendorDetailDTO;
import jakarta.persistence.criteria.Predicate;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
@RequiredArgsConstructor
public class VendorService {

    public static final BigDecimal MAX_BALANCE = new BigDecimal("9999999999999999.99");
    private static final Set<String> ALLOWED_SORT_FIELDS = Set.of("name", "accountBalance", "createdAt");
    private static final Map<String, String> SORT_FIELD_MAPPING = Map.of(
            "name", "name",
            "accountBalance", "accountBalance",
            "createdAt", "dateCreated");

    private final VendorRepository vendorRepository;
    private final PaymentRepository paymentRepository;
    private final LedgerEntryRepository ledgerEntryRepository;
    private final LedgerEntryMapper ledgerEntryMapper;
    private final PaymentMapper paymentMapper;
    private final com.sastapos.sasta_pos.customer.CustomerPaymentPosting paymentPosting;
    private final jakarta.persistence.EntityManager entityManager;

    public record VendorFilter(
            String search,
            RowStatus status,
            TaxRegistrationStatus salesTaxRegistrationStatus,
            Boolean hasBalance,
            BalanceState balanceState,
            BigDecimal minBalance,
            BigDecimal maxBalance) {
    }

    public PageResponse<VendorDTO> findAll(final User user, final VendorFilter filter,
            final int page, final int size, final String sortBy, final String sortDir) {
        final UUID storeId = requireStoreId(user);
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
        if (filter.minBalance() != null && filter.maxBalance() != null
                && filter.minBalance().compareTo(filter.maxBalance()) > 0) {
            throw new BadRequestException("minBalance cannot be greater than maxBalance");
        }

        final Sort.Direction direction = "desc".equalsIgnoreCase(sortDir) ? Sort.Direction.DESC : Sort.Direction.ASC;
        final String entityProperty = SORT_FIELD_MAPPING.get(sortBy);
        final Sort sort = Sort.by(direction, entityProperty).and(Sort.by(direction, "id"));
        final PageRequest pageRequest = PageRequest.of(page, size, sort);

        final Page<Vendor> result = vendorRepository.findAll(buildSpecification(storeId, filter), pageRequest);
        return PageResponse.of(result.map(this::mapToDTO));
    }

    public VendorDetailDTO get(final User user, final UUID id) {
        final UUID storeId = requireStoreId(user);
        final Vendor vendor = requireVendor(id, storeId);
        final VendorDetailDTO detail = new VendorDetailDTO();
        populateDTO(vendor, detail);
        detail.setPaymentCount(paymentRepository.countByVendorId(id));
        detail.setPurchaseCount(0);
        detail.setReturnCount(0);
        return detail;
    }

    @Transactional
    public VendorDTO create(final User user, final CreateVendorRequestDTO request) {
        final UUID storeId = requireStoreId(user);
        final String name = request.getName() != null ? request.getName().trim() : null;
        if (!StringUtils.hasText(name)) {
            throw new BadRequestException("name cannot be blank");
        }

        if (vendorRepository.existsByStoreIdAndNameIgnoreCase(storeId, name)) {
            throw new ConflictException("A vendor with this name already exists in your store");
        }

        final String phone = trimToNull(request.getPhoneNumber());
        if (phone != null && vendorRepository.existsByPhoneNumber(phone)) {
            throw new ConflictException("A vendor with this phone number already exists");
        }

        final TaxRegistrationStatus regStatus = request.getSalesTaxRegistrationStatus() != null
                ? request.getSalesTaxRegistrationStatus()
                : TaxRegistrationStatus.UNREGISTERED;

        final String strn = trimToNull(request.getStrn());
        if (regStatus == TaxRegistrationStatus.REGISTERED && !StringUtils.hasText(strn)) {
            throw new BadRequestException("STRN is required when salesTaxRegistrationStatus is REGISTERED");
        }

        final Vendor vendor = new Vendor();
        vendor.setName(name);
        vendor.setPhoneNumber(phone);
        vendor.setNtn(trimToNull(request.getNtn()));
        vendor.setStrn(strn);
        vendor.setSalesTaxRegistrationStatus(regStatus);
        vendor.setAddress(trimToNull(request.getAddress()));
        vendor.setAccountBalance(BigDecimal.ZERO.setScale(2));
        vendor.setStatus(RowStatus.ACTIVE);
        vendor.setStore(user.getStore());

        return mapToDTO(saveUnique(vendor));
    }

    @Transactional
    public VendorDTO update(final User user, final UUID id, final UpdateVendorRequestDTO request) {
        final UUID storeId = requireStoreId(user);
        final Vendor vendor = requireVendor(id, storeId);

        if (request.getName() != null) {
            final String name = request.getName().trim();
            if (!StringUtils.hasText(name)) {
                throw new BadRequestException("name cannot be blank");
            }
            if (vendorRepository.existsByStoreIdAndNameIgnoreCaseAndIdNot(storeId, name, id)) {
                throw new ConflictException("A vendor with this name already exists in your store");
            }
            vendor.setName(name);
        }

        if (request.getPhoneNumber() != null) {
            final String phone = trimToNull(request.getPhoneNumber());
            if (phone != null && vendorRepository.existsByPhoneNumberAndIdNot(phone, id)) {
                throw new ConflictException("A vendor with this phone number already exists");
            }
            vendor.setPhoneNumber(phone);
        }

        if (request.getNtn() != null) {
            vendor.setNtn(trimToNull(request.getNtn()));
        }

        final TaxRegistrationStatus targetRegStatus = request.getSalesTaxRegistrationStatus() != null
                ? request.getSalesTaxRegistrationStatus()
                : vendor.getSalesTaxRegistrationStatus();

        final String targetStrn = request.getStrn() != null ? trimToNull(request.getStrn()) : vendor.getStrn();

        if (targetRegStatus == TaxRegistrationStatus.REGISTERED && !StringUtils.hasText(targetStrn)) {
            throw new BadRequestException("STRN is required when salesTaxRegistrationStatus is REGISTERED");
        }

        if (request.getSalesTaxRegistrationStatus() != null) {
            vendor.setSalesTaxRegistrationStatus(targetRegStatus);
        }
        if (request.getStrn() != null) {
            vendor.setStrn(targetStrn);
        }

        if (request.getAddress() != null) {
            vendor.setAddress(trimToNull(request.getAddress()));
        }

        if (request.getStatus() != null) {
            vendor.setStatus(request.getStatus());
        }

        return mapToDTO(saveUnique(vendor));
    }

    @Transactional
    public DeleteVendorResponse delete(final User user, final UUID id) {
        final UUID storeId = requireStoreId(user);
        final Vendor vendor = requireVendor(id, storeId);

        if (vendor.getAccountBalance().signum() != 0) {
            final String whoOwes = vendor.getAccountBalance().signum() > 0
                    ? "vendor owes the store Rs " + vendor.getAccountBalance().abs().setScale(2)
                    : "store owes the vendor Rs " + vendor.getAccountBalance().abs().setScale(2);
            throw new ConflictException("Vendor has an outstanding balance: " + whoOwes);
        }

        final boolean hasHistory = paymentRepository.existsByVendorId(id)
                || ledgerEntryRepository.existsByVendorId(id);

        if (hasHistory) {
            vendor.setStatus(RowStatus.INACTIVE);
            vendorRepository.saveAndFlush(vendor);
            return new DeleteVendorResponse(mapToDTO(vendor), "Vendor deactivated because payment/ledger history exists");
        }

        vendorRepository.delete(vendor);
        vendorRepository.flush();
        return null;
    }

    @Transactional
    public SettlementResponse recordPayment(final User user, final UUID vendorId, final RecordSettlementRequestDTO request) {
        final UUID storeId = requireStoreId(user);
        final Vendor vendor = requireVendorForUpdate(vendorId, storeId);

        final BigDecimal amount = request.getAmount().setScale(2);
        if (amount.signum() <= 0) {
            throw new BadRequestException("amount must be > 0");
        }

        final PaymentDirection direction = request.getDirection() != null ? request.getDirection() : PaymentDirection.OUTGOING;

        // INCOMING: CREDIT, accountBalance decreases
        // OUTGOING: DEBIT, accountBalance increases
        final BigDecimal delta = direction == PaymentDirection.INCOMING ? amount.negate() : amount;
        final BigDecimal newBalance = vendor.getAccountBalance().add(delta);
        requireBalanceInRange(newBalance);

        final Payment payment = new Payment();
        payment.setAmount(amount);
        payment.setMethod(request.getMethod());
        payment.setDirection(direction);
        payment.setReferenceNumber(trimToNull(request.getReferenceNumber()));
        payment.setDescription(trimToNull(request.getDescription()));
        payment.setVendor(vendor);
        payment.setStore(user.getStore());
        payment.setUser(user);
        paymentRepository.saveAndFlush(payment);

        paymentPosting.post(storeId, List.of(payment.getId()));
        entityManager.refresh(vendor);
        final LedgerEntry entry = ledgerEntryRepository.findById(payment.getId()).orElseThrow();

        return new SettlementResponse(paymentMapper.toDTO(payment), ledgerEntryMapper.toDTO(entry), mapToDTO(vendor));
    }

    private Specification<Vendor> buildSpecification(final UUID storeId, final VendorFilter filter) {
        return (root, query, cb) -> {
            final List<Predicate> predicates = new ArrayList<>();
            predicates.add(cb.equal(root.get("store").get("id"), storeId));
            predicates.add(cb.equal(root.get("status"),
                    filter.status() == null ? RowStatus.ACTIVE : filter.status()));

            if (filter.salesTaxRegistrationStatus() != null) {
                predicates.add(cb.equal(root.get("salesTaxRegistrationStatus"), filter.salesTaxRegistrationStatus()));
            }

            if (StringUtils.hasText(filter.search())) {
                final String pattern = "%" + escapeLike(filter.search().trim().toLowerCase(Locale.ROOT)) + "%";
                predicates.add(cb.or(
                        cb.like(cb.lower(root.get("name")), pattern, '\\'),
                        cb.like(cb.lower(root.get("phoneNumber")), pattern, '\\'),
                        cb.like(cb.lower(root.get("ntn")), pattern, '\\'),
                        cb.like(cb.lower(root.get("strn")), pattern, '\\')));
            }

            if (filter.hasBalance() != null) {
                predicates.add(filter.hasBalance()
                        ? cb.notEqual(root.get("accountBalance"), BigDecimal.ZERO)
                        : cb.equal(root.get("accountBalance"), BigDecimal.ZERO));
            }

            if (filter.balanceState() != null) {
                switch (filter.balanceState()) {
                    case PARTY_OWES_STORE -> predicates.add(cb.greaterThan(root.get("accountBalance"), BigDecimal.ZERO));
                    case STORE_OWES_PARTY -> predicates.add(cb.lessThan(root.get("accountBalance"), BigDecimal.ZERO));
                    case SETTLED -> predicates.add(cb.equal(root.get("accountBalance"), BigDecimal.ZERO));
                }
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

    private Vendor saveUnique(final Vendor vendor) {
        try {
            return vendorRepository.saveAndFlush(vendor);
        } catch (final DataIntegrityViolationException e) {
            throw new ConflictException("A vendor with this name or phoneNumber already exists");
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

    private Vendor requireVendor(final UUID id, final UUID storeId) {
        return vendorRepository.findByIdAndStoreId(id, storeId)
                .orElseThrow(() -> new NotFoundException("Vendor not found"));
    }

    private Vendor requireVendorForUpdate(final UUID id, final UUID storeId) {
        return vendorRepository.findByIdAndStoreIdForUpdate(id, storeId)
                .orElseThrow(() -> new NotFoundException("Vendor not found"));
    }

    public VendorDTO mapToDTO(final Vendor vendor) {
        final VendorDTO dto = new VendorDTO();
        populateDTO(vendor, dto);
        return dto;
    }

    private void populateDTO(final Vendor vendor, final VendorDTO dto) {
        dto.setId(vendor.getId());
        dto.setName(vendor.getName());
        dto.setPhoneNumber(vendor.getPhoneNumber());
        dto.setNtn(vendor.getNtn());
        dto.setStrn(vendor.getStrn());
        dto.setSalesTaxRegistrationStatus(vendor.getSalesTaxRegistrationStatus());
        dto.setAddress(vendor.getAddress());
        dto.setAccountBalance(vendor.getAccountBalance());
        dto.setBalanceAmount(vendor.getAccountBalance() == null ? BigDecimal.ZERO.setScale(2) : vendor.getAccountBalance().abs().setScale(2));
        if (vendor.getAccountBalance() == null || vendor.getAccountBalance().signum() == 0) {
            dto.setBalanceState(BalanceState.SETTLED);
        } else if (vendor.getAccountBalance().signum() > 0) {
            dto.setBalanceState(BalanceState.PARTY_OWES_STORE);
        } else {
            dto.setBalanceState(BalanceState.STORE_OWES_PARTY);
        }
        dto.setStatus(vendor.getStatus());
        dto.setStoreId(vendor.getStore().getId());
        dto.setCreatedAt(vendor.getDateCreated());
        dto.setLastUpdated(vendor.getLastUpdated());
    }

}
