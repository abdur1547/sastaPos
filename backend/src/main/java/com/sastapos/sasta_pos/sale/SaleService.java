package com.sastapos.sasta_pos.sale;

import com.sastapos.sasta_pos.business_setting.BusinessSetting;
import com.sastapos.sasta_pos.customer.Customer;
import com.sastapos.sasta_pos.customer.CustomerService;
import com.sastapos.sasta_pos.events.BeforeDeleteStore;
import com.sastapos.sasta_pos.events.BeforeDeleteUser;
import com.sastapos.sasta_pos.ledger_entry.LedgerEntry;
import com.sastapos.sasta_pos.ledger_entry.LedgerEntryMapper;
import com.sastapos.sasta_pos.ledger_entry.LedgerEntryService;
import com.sastapos.sasta_pos.payment.Payment;
import com.sastapos.sasta_pos.payment.PaymentMethod;
import com.sastapos.sasta_pos.product.Product;
import com.sastapos.sasta_pos.product.ProductService;
import com.sastapos.sasta_pos.product.dto.PageResponse;
import com.sastapos.sasta_pos.sale.dto.CreateSaleRequestDTO;
import com.sastapos.sasta_pos.sale.dto.SaleDTO;
import com.sastapos.sasta_pos.sale.dto.SaleItemRequestDTO;
import com.sastapos.sasta_pos.sale.dto.SaleSummaryDTO;
import com.sastapos.sasta_pos.sale.dto.SalePaymentRequestDTO;
import com.sastapos.sasta_pos.sale.dto.UpdateSaleRequestDTO;
import com.sastapos.sasta_pos.sale.dto.VoidSaleRequestDTO;
import com.sastapos.sasta_pos.sale.dto.VoidSaleResponse;
import com.sastapos.sasta_pos.sale_item.SaleItem;
import com.sastapos.sasta_pos.stock_movement.StockMovement;
import com.sastapos.sasta_pos.stock_movement.StockMovementService;
import com.sastapos.sasta_pos.store.Store;
import com.sastapos.sasta_pos.store.StoreRepository;
import com.sastapos.sasta_pos.user.User;
import com.sastapos.sasta_pos.user.UserRepository;
import com.sastapos.sasta_pos.user.UserRole;
import com.sastapos.sasta_pos.util.BadRequestException;
import com.sastapos.sasta_pos.util.ConflictException;
import com.sastapos.sasta_pos.util.ForbiddenException;
import com.sastapos.sasta_pos.util.NotFoundException;
import com.sastapos.sasta_pos.util.ReferencedException;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import com.sastapos.sasta_pos.sale.SaleCalculator.Line;
import com.sastapos.sasta_pos.sale.SaleCalculator.Totals;
import lombok.RequiredArgsConstructor;
import org.springframework.context.event.EventListener;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Sales (use cases 5-5c). Every operation is scoped to the authenticated user's store; foreign
 * sales look like 404s. Completing a sale is all-or-nothing: invoice number, stock, payments,
 * ledger and customer balance are written in one transaction. Locks are always taken in the order
 * sale, customer, store settings, products (by id) so concurrent requests cannot deadlock.
 */
@Service
@RequiredArgsConstructor
public class SaleService {

    static final int MAX_PAGE_SIZE = 100;
    private static final Map<String, String> SORTABLE_FIELDS = Map.of(
            "soldAt", "soldAt",
            "totalAmount", "totalAmount",
            "remaining", "remaining",
            "invoiceNumber", "invoiceNumber");

    private final SaleRepository saleRepository;
    private final UserRepository userRepository;
    private final StoreRepository storeRepository;
    private final CustomerService customerService;
    private final ProductService productService;
    private final StockMovementService stockMovementService;
    private final LedgerEntryService ledgerEntryService;
    private final LedgerEntryMapper ledgerEntryMapper;
    private final SaleMapper saleMapper;
    private final SaleSummaryQuery saleSummaryQuery;
    private final EntityManager entityManager;

    @Transactional(readOnly = true)
    public PageResponse<SaleDTO> findAll(final User user, final SaleFilter filter, final int page,
            final int size, final String sortBy, final String sortDir) {
        final UUID storeId = requireStoreId(user);
        validateFilter(filter);
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
                Sort.by(direction, sortField).and(Sort.by(direction, "id")));
        final Page<SaleDTO> result = saleRepository.findAll(SaleSpecifications.forStore(storeId, filter), pageable)
                .map(saleMapper::toDTO);
        return PageResponse.of(result);
    }

    /** Register totals for the same filters as {@link #findAll}; drafts are never included. */
    @Transactional(readOnly = true)
    public SaleSummaryDTO summarize(final User user, final SaleFilter filter) {
        final UUID storeId = requireStoreId(user);
        validateFilter(filter);
        return saleSummaryQuery.summarize(storeId, filter);
    }

    private void validateFilter(final SaleFilter filter) {
        if (filter.from() != null && filter.to() != null && filter.from().isAfter(filter.to())) {
            throw new BadRequestException("from must be <= to");
        }
        validateRange(filter.minTotalAmount(), filter.maxTotalAmount());
    }

    @Transactional(readOnly = true)
    public SaleDTO get(final User user, final UUID id) {
        return saleMapper.toDTO(saleRepository.findByIdAndStoreId(id, requireStoreId(user))
                .orElseThrow(() -> new NotFoundException("Sale not found")));
    }

    @Transactional
    public SaleDTO create(final User user, final CreateSaleRequestDTO request) {
        final Store store = requireStore(user);
        final SaleStatus target = requireTargetStatus(request, SaleStatus.COMPLETED);
        final Sale sale = new Sale();
        sale.setStatus(target);
        sale.setSoldAt(LocalDateTime.now(ZoneOffset.UTC));
        sale.setInvoiceNumber(draftInvoiceNumber());
        sale.setUser(userRepository.getReferenceById(user.getId()));
        sale.setStore(store);
        applyRequest(sale, store, request, target);
        return saleMapper.toDTO(sale);
    }

    /** Full replace of a draft, optionally finalising it; completed sales are immutable. */
    @Transactional
    public SaleDTO update(final User user, final UUID id, final CreateSaleRequestDTO request) {
        final Store store = requireStore(user);
        final Sale sale = saleRepository.findByIdAndStoreIdForUpdate(id, store.getId())
                .orElseThrow(() -> new NotFoundException("Sale not found"));
        requireNotVoided(sale);
        if (sale.getStatus() == SaleStatus.COMPLETED) {
            throw new ConflictException("A COMPLETED sale is financially immutable: void it "
                    + "(POST /api/sales/{id}/void) and create a new sale instead, or PATCH its "
                    + "description and payment references");
        }
        final SaleStatus target = requireTargetStatus(request, SaleStatus.IN_PROGRESS);
        if (target == SaleStatus.COMPLETED) {
            sale.setSoldAt(LocalDateTime.now(ZoneOffset.UTC));
        }
        applyRequest(sale, store, request, target);
        return saleMapper.toDTO(sale);
    }

    /** Non-financial edit: sale description and payment reference/description only. */
    @Transactional
    public SaleDTO patch(final User user, final UUID id, final UpdateSaleRequestDTO request) {
        final Sale sale = saleRepository.findByIdAndStoreIdForUpdate(id, requireStoreId(user))
                .orElseThrow(() -> new NotFoundException("Sale not found"));
        requireNotVoided(sale);
        if (request.hasFinancialChange()) {
            throw new ConflictException("Items, discount, customer, sale type, status and payment "
                    + "amount/method cannot be edited: void the sale and create a new one instead");
        }
        if (request.getDescription() != null) {
            sale.setDescription(trimToNull(request.getDescription()));
        }
        if (request.getPayments() != null) {
            final Map<UUID, Payment> byId = sale.getPayments().stream()
                    .collect(Collectors.toMap(Payment::getId, p -> p));
            final Set<UUID> seen = new HashSet<>();
            for (final UpdateSaleRequestDTO.PaymentMetadataDTO change : request.getPayments()) {
                if (!seen.add(change.getId())) {
                    throw new BadRequestException("Duplicate payment id " + change.getId());
                }
                final Payment payment = byId.get(change.getId());
                if (payment == null) {
                    throw new NotFoundException("Payment not found: " + change.getId());
                }
                if (change.getReferenceNumber() != null) {
                    payment.setReferenceNumber(trimToNull(change.getReferenceNumber()));
                }
                if (change.getDescription() != null) {
                    payment.setDescription(trimToNull(change.getDescription()));
                }
            }
        }
        saleRepository.saveAndFlush(sale);
        return saleMapper.toDTO(sale);
    }

    /**
     * Soft-delete: marks the sale VOIDED and, for a completed sale, appends reversing stock
     * movements and ledger entries. Original rows are never edited or removed.
     */
    @Transactional
    public VoidSaleResponse voidSale(final User user, final UUID id, final VoidSaleRequestDTO request) {
        final Store store = requireStore(user);
        final Sale sale = saleRepository.findByIdAndStoreIdForUpdate(id, store.getId())
                .orElseThrow(() -> new NotFoundException("Sale not found"));
        requireVoidPermission(user, sale, store);
        if (sale.getStatus() == SaleStatus.VOIDED) {
            throw new ConflictException("Sale is already voided");
        }
        final String reason = request.getVoidReason().trim();
        if (reason.isEmpty()) {
            throw new BadRequestException("voidReason must not be blank");
        }
        final List<StockMovement> movements = new ArrayList<>();
        final List<LedgerEntry> entries = new ArrayList<>();
        if (sale.getStatus() == SaleStatus.COMPLETED) {
            reverseSideEffects(sale, store, reason, movements, entries);
        }

        sale.setStatus(SaleStatus.VOIDED);
        sale.setVoidReason(reason);
        sale.setVoidedAt(OffsetDateTime.now());
        sale.setVoidedBy(userRepository.getReferenceById(user.getId()));
        saleRepository.saveAndFlush(sale);
        return new VoidSaleResponse(saleMapper.toDTO(sale), movements.stream().map(saleMapper::toMovementDTO).toList(),
                entries.stream().map(ledgerEntryMapper::toDTO).toList());
    }

    private void reverseSideEffects(final Sale sale, final Store store, final String reason,
            final List<StockMovement> movements, final List<LedgerEntry> entries) {
        final Customer customer = sale.getCustomer() == null ? null
                : customerService.lockForUpdate(sale.getCustomer().getId(), store.getId());
        final List<UUID> productIds = sale.getSaleItems().stream()
                .map(i -> i.getProduct().getId()).distinct().toList();
        final Map<UUID, Product> products = productService.lockAll(productIds, store.getId()).stream()
                .collect(Collectors.toMap(Product::getId, p -> p));
        for (final SaleItem item : sale.getSaleItems()) {
            movements.add(stockMovementService.recordVoidReturn(store, products.get(item.getProduct().getId()),
                    item.getQuantity(), sale, item, reason));
        }
        if (customer != null) {
            customerService.adjustBalance(customer, sale.getTotalAmount().subtract(sale.getTotalPaid()).negate());
            entries.addAll(ledgerEntryService.recordSaleReversal(customer, sale, reason));
        }
    }

    // ---------- create / replace core ----------

    private SaleStatus requireTargetStatus(final CreateSaleRequestDTO request, final SaleStatus fallback) {
        final SaleStatus status = request.getSaleStatus() == null ? fallback : request.getSaleStatus();
        if (status == SaleStatus.VOIDED) {
            throw new BadRequestException("saleStatus must be COMPLETED or IN_PROGRESS; use "
                    + "POST /api/sales/{id}/void to void a sale");
        }
        return status;
    }

    private void applyRequest(final Sale sale, final Store store, final CreateSaleRequestDTO request,
            final SaleStatus target) {
        final boolean completing = target == SaleStatus.COMPLETED;
        final List<SaleItemRequestDTO> itemRequests = request.getSaleItems();
        final List<SalePaymentRequestDTO> paymentRequests =
                request.getPayments() == null ? List.of() : request.getPayments();

        if (request.getTotalItems() != itemRequests.size()) {
            throw new BadRequestException("totalItems (" + request.getTotalItems()
                    + ") must equal the number of saleItems (" + itemRequests.size() + ")");
        }
        final Set<UUID> productIds = new HashSet<>();
        for (final SaleItemRequestDTO item : itemRequests) {
            if (!productIds.add(item.getProductId())) {
                throw new BadRequestException("Product " + item.getProductId()
                        + " appears more than once; each product may only be listed once per sale");
            }
        }
        if (request.getSaleType() == SaleType.CREDIT && request.getCustomerId() == null) {
            throw new BadRequestException("customerId is required for a CREDIT sale");
        }

        final Customer customer = request.getCustomerId() == null ? null
                : customerService.findActiveForSale(request.getCustomerId(), store.getId(), completing);
        final BusinessSetting settings = store.getStoreSettings();
        if (completing) {
            entityManager.refresh(settings, LockModeType.PESSIMISTIC_WRITE);
        }
        final Map<UUID, Product> products = productService.findActiveForSale(productIds, store.getId(), completing);
        final Totals totals = SaleCalculator.computeTotals(request, itemRequests, paymentRequests, products);
        SaleCalculator.validateAgainstClient(request, totals, completing);
        if (completing) {
            SaleCalculator.requireStock(totals.lines());
        }

        sale.setSaleType(request.getSaleType());
        sale.setCustomer(customer);
        sale.setCurrencyCode(store.getCurrencyCode());
        sale.setDescription(trimToNull(request.getDescription()));
        sale.setStatus(target);
        applyTotals(sale, totals);

        sale.getSaleItems().clear();
        sale.getPayments().clear();
        saleRepository.flush();
        totals.lines().forEach(line -> sale.getSaleItems().add(newItem(sale, line)));
        paymentRequests.forEach(p -> sale.getPayments().add(newPayment(sale, p)));
        if (completing) {
            sale.setInvoiceNumber(settings.getInvoicePrefix() + settings.getNextInvoiceNumber());
            settings.setNextInvoiceNumber(settings.getNextInvoiceNumber() + 1);
        }
        saleRepository.saveAndFlush(sale);
        if (completing) {
            commitSideEffects(sale, store, customer, totals);
        }
    }

    private static void applyTotals(final Sale sale, final Totals totals) {
        sale.setSubtotal(totals.subtotal());
        sale.setDiscountAmount(totals.discount());
        sale.setTaxableAmount(totals.taxable());
        sale.setTaxAmount(totals.tax());
        sale.setTotalAmount(totals.total());
        sale.setTotalPaid(totals.paid());
        sale.setRemaining(totals.total().subtract(totals.paid()));
    }

    private static SaleItem newItem(final Sale sale, final Line line) {
        final SaleItem item = new SaleItem();
        item.setSale(sale);
        item.setProduct(line.product());
        item.setProductName(line.product().getName());
        item.setSku(line.product().getSku());
        item.setQuantity(line.quantity());
        item.setUnitPrice(line.unitPrice());
        item.setTaxRate(line.taxRate());
        item.setTaxableAmount(line.taxable());
        item.setLineTotal(line.taxable().add(line.tax()));
        return item;
    }

    private static Payment newPayment(final Sale sale, final SalePaymentRequestDTO request) {
        final Payment payment = new Payment();
        payment.setSale(sale);
        payment.setAmount(request.getAmount().setScale(2, RoundingMode.HALF_UP));
        payment.setMethod(request.getMethod() == null ? PaymentMethod.CASH : request.getMethod());
        payment.setReferenceNumber(trimToNull(request.getReferenceNumber()));
        payment.setDescription(trimToNull(request.getDescription()));
        return payment;
    }

    private void commitSideEffects(final Sale sale, final Store store, final Customer customer,
            final Totals totals) {
        for (int i = 0; i < totals.lines().size(); i++) {
            final Line line = totals.lines().get(i);
            stockMovementService.recordSale(store, line.product(), line.quantity(), sale,
                    sale.getSaleItems().get(i));
        }
        if (customer != null) {
            customerService.adjustBalance(customer, sale.getRemaining());
            ledgerEntryService.recordSale(customer, sale);
        }
        saleRepository.flush();
    }

    private void requireVoidPermission(final User user, final Sale sale, final Store store) {
        if (user.getRole() == UserRole.OWNER) {
            return;
        }
        final ZoneId zone = ZoneId.of(store.getTimezone());
        final boolean ownSaleToday = user.getRole() == UserRole.CASHIER && sale.getUser() != null
                && sale.getUser().getId().equals(user.getId())
                && sale.getSoldAt().atOffset(ZoneOffset.UTC).atZoneSameInstant(zone).toLocalDate()
                        .equals(LocalDateTime.now(zone).toLocalDate());
        if (!ownSaleToday) {
            throw new ForbiddenException("Only the store owner, or the cashier who made the sale on the "
                    + "same day, can void a sale");
        }
    }

    private void requireNotVoided(final Sale sale) {
        if (sale.getStatus() == SaleStatus.VOIDED) {
            throw new ConflictException("A VOIDED sale is read-only");
        }
    }

    private static String draftInvoiceNumber() {
        return "DRAFT-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase(Locale.ROOT);
    }

    private static String trimToNull(final String value) {
        if (value == null) {
            return null;
        }
        final String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private UUID requireStoreId(final User user) {
        if (user.getStore() == null) {
            throw new NotFoundException("You don't have a store yet");
        }
        return user.getStore().getId();
    }

    private Store requireStore(final User user) {
        return storeRepository.findById(requireStoreId(user))
                .orElseThrow(() -> new NotFoundException("You don't have a store yet"));
    }

    private static void validateRange(final BigDecimal min, final BigDecimal max) {
        if (min != null && min.signum() < 0) {
            throw new BadRequestException("minTotalAmount must be >= 0");
        }
        if (max != null && max.signum() < 0) {
            throw new BadRequestException("maxTotalAmount must be >= 0");
        }
        if (min != null && max != null && min.compareTo(max) > 0) {
            throw new BadRequestException("minTotalAmount must be <= maxTotalAmount");
        }
    }

    @EventListener(BeforeDeleteUser.class)
    public void on(final BeforeDeleteUser event) {
        final ReferencedException referencedException = new ReferencedException();
        final Sale userSale = saleRepository.findFirstByUserId(event.getId());
        if (userSale != null) {
            referencedException.setKey("user.sale.user.referenced");
            referencedException.addParam(userSale.getId());
            throw referencedException;
        }
    }

    @EventListener(BeforeDeleteStore.class)
    public void on(final BeforeDeleteStore event) {
        final ReferencedException referencedException = new ReferencedException();
        final Sale storeSale = saleRepository.findFirstByStoreId(event.getId());
        if (storeSale != null) {
            referencedException.setKey("store.sale.store.referenced");
            referencedException.addParam(storeSale.getId());
            throw referencedException;
        }
    }

}
