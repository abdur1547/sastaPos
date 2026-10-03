package com.sastapos.sasta_pos.store;

import com.sastapos.sasta_pos.auth.AuthService;
import com.sastapos.sasta_pos.business_setting.BusinessSetting;
import com.sastapos.sasta_pos.business_setting.BusinessSettingRepository;
import com.sastapos.sasta_pos.sale.SaleRepository;
import com.sastapos.sasta_pos.store.dto.*;
import com.sastapos.sasta_pos.user.User;
import com.sastapos.sasta_pos.user.UserRepository;
import com.sastapos.sasta_pos.user.UserRole;
import com.sastapos.sasta_pos.util.BadRequestException;
import com.sastapos.sasta_pos.util.ConflictException;
import com.sastapos.sasta_pos.util.ForbiddenException;
import com.sastapos.sasta_pos.util.NotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;


/**
 * Every store is resolved from the authenticated user (one store per user) — there is no
 * list/index endpoint and no arbitrary store id in the URL.
 */
@Service
@RequiredArgsConstructor
public class StoreService {

    @Value("${app.store.default-currency-code}")
    private String defaultCurrencyCode;
    @Value("${app.store.default-timezone}")
    private String defaultTimezone;

    private final StoreRepository storeRepository;
    private final UserRepository userRepository;
    private final SaleRepository saleRepository;
    private final AuthService authService;

    @Transactional
    public CreateStoreResponse createStore(final User user, final CreateStoreRequest request) {
        if (user.getStore() != null) {
            throw new ConflictException("You already have a store");
        }
        if (storeRepository.existsByNtnIgnoreCase(request.getNtn())) {
            throw new ConflictException("A store with this NTN already exists");
        }

        final BusinessSetting storeSettings = new BusinessSetting();
        storeSettings.setInvoicePrefix("");
        storeSettings.setInvoiceNumberStart(1);
        storeSettings.setNextInvoiceNumber(1);
        storeSettings.setReceiptFooter("");

        final Store store = new Store();
        store.setName(request.getName());
        store.setNtn(request.getNtn());
        store.setAddress(request.getAddress());
        store.setCurrencyCode(StringUtils.hasText(request.getCurrencyCode())
                ? request.getCurrencyCode() : defaultCurrencyCode);
        store.setTimezone(StringUtils.hasText(request.getTimezone())
                ? request.getTimezone() : defaultTimezone);
        store.setStatus(RowStatus.ACTIVE);
        store.setStoreSettings(storeSettings);
        storeRepository.save(store);

        user.setStore(store);
        user.setRole(UserRole.OWNER);
        userRepository.save(user);

        return new CreateStoreResponse(mapToDTO(store), authService.getCurrentUser(user));
    }

    public StoreDTO getStoreForCurrentUser(final User user) {
        return mapToDTO(requireStore(user));
    }

    @Transactional
    public StoreDTO updateStore(final User user, final UpdateStoreRequest request) {
        final Store store = requireOwnedStore(user);

        if (request.getName() != null) {
            if (!StringUtils.hasText(request.getName())) {
                throw new BadRequestException("name must not be blank");
            }
            store.setName(request.getName());
        }
        if (request.getNtn() != null) {
            if (!StringUtils.hasText(request.getNtn())) {
                throw new BadRequestException("ntn must not be blank");
            }
            if (storeRepository.existsByNtnIgnoreCaseAndIdNot(request.getNtn(), store.getId())) {
                throw new ConflictException("A store with this NTN already exists");
            }
            store.setNtn(request.getNtn());
        }
        if (request.getAddress() != null) {
            store.setAddress(request.getAddress());
        }
        if (request.getCurrencyCode() != null) {
            store.setCurrencyCode(request.getCurrencyCode());
        }
        if (request.getTimezone() != null) {
            store.setTimezone(request.getTimezone());
        }
        if (request.getStatus() != null) {
            store.setStatus(request.getStatus());
        }

//        storeRepository.save(store);
        return mapToDTO(store);
    }

    @Transactional
    public StoreSettingsDTO updateStoreSettings(final User user, final UpdateStoreSettingsRequest request) {
        final Store store = requireOwnedStore(user);
        final BusinessSetting settings = store.getStoreSettings();

        if (request.getInvoicePrefix() != null) {
            settings.setInvoicePrefix(request.getInvoicePrefix());
        }
        if (request.getInvoiceNumberStart() != null) {
            if (saleRepository.findFirstByStoreId(store.getId()) != null) {
                throw new ConflictException(
                        "invoiceNumberStart cannot be changed once the store has sales");
            }
            settings.setInvoiceNumberStart(request.getInvoiceNumberStart());
            settings.setNextInvoiceNumber(request.getInvoiceNumberStart());
        }
        if (request.getReceiptFooter() != null) {
            settings.setReceiptFooter(request.getReceiptFooter());
        }

        return mapSettingsToDTO(settings);
    }

    @Transactional
    public StoreDTO deactivateStore(final User user) {
        final Store store = requireOwnedStore(user);
        if (store.getStatus() == RowStatus.INACTIVE) {
            throw new ConflictException("Store is already deactivated");
        }
        store.setStatus(RowStatus.INACTIVE);
        return mapToDTO(store);
    }

    private Store requireStore(final User user) {
        if (user.getStore() == null) {
            throw new NotFoundException("You don't have a store yet");
        }
        return storeRepository.findById(user.getStore().getId())
                .orElseThrow(() -> new NotFoundException("You don't have a store yet"));
    }

    private Store requireOwnedStore(final User user) {
        final Store store = requireStore(user);
        if (user.getRole() != UserRole.OWNER) {
            throw new ForbiddenException("Only the store owner can perform this action");
        }
        return store;
    }

    private StoreDTO mapToDTO(final Store store) {
        final StoreDTO dto = new StoreDTO();
        dto.setId(store.getId());
        dto.setName(store.getName());
        dto.setNtn(store.getNtn());
        dto.setAddress(store.getAddress());
        dto.setCurrencyCode(store.getCurrencyCode());
        dto.setTimezone(store.getTimezone());
        dto.setStatus(store.getStatus());
        dto.setStoreSettings(mapSettingsToDTO(store.getStoreSettings()));
        return dto;
    }

    private StoreSettingsDTO mapSettingsToDTO(final BusinessSetting settings) {
        final StoreSettingsDTO dto = new StoreSettingsDTO();
        dto.setId(settings.getId());
        dto.setInvoicePrefix(settings.getInvoicePrefix());
        dto.setInvoiceNumberStart(settings.getInvoiceNumberStart());
        dto.setNextInvoiceNumber(settings.getNextInvoiceNumber());
        dto.setReceiptFooter(settings.getReceiptFooter());
        return dto;
    }

}
