package com.sastapos.sasta_pos.store;

import com.sastapos.sasta_pos.business_setting.BusinessSetting;
import com.sastapos.sasta_pos.business_setting.BusinessSettingRepository;
import com.sastapos.sasta_pos.events.BeforeDeleteBusinessSetting;
import com.sastapos.sasta_pos.events.BeforeDeleteStore;
import com.sastapos.sasta_pos.util.NotFoundException;
import com.sastapos.sasta_pos.util.ReferencedException;
import java.util.List;
import java.util.UUID;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.event.EventListener;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;


@Service
public class StoreService {

    private final StoreRepository storeRepository;
    private final BusinessSettingRepository businessSettingRepository;
    private final ApplicationEventPublisher publisher;

    public StoreService(final StoreRepository storeRepository,
            final BusinessSettingRepository businessSettingRepository,
            final ApplicationEventPublisher publisher) {
        this.storeRepository = storeRepository;
        this.businessSettingRepository = businessSettingRepository;
        this.publisher = publisher;
    }

    public List<StoreDTO> findAll() {
        final List<Store> stores = storeRepository.findAll(Sort.by("id"));
        return stores.stream()
                .map(store -> mapToDTO(store, new StoreDTO()))
                .toList();
    }

    public StoreDTO get(final UUID id) {
        return storeRepository.findById(id)
                .map(store -> mapToDTO(store, new StoreDTO()))
                .orElseThrow(NotFoundException::new);
    }

    public UUID create(final StoreDTO storeDTO) {
        final Store store = new Store();
        mapToEntity(storeDTO, store);
        return storeRepository.save(store).getId();
    }

    public void update(final UUID id, final StoreDTO storeDTO) {
        final Store store = storeRepository.findById(id)
                .orElseThrow(NotFoundException::new);
        mapToEntity(storeDTO, store);
        storeRepository.save(store);
    }

    public void delete(final UUID id) {
        final Store store = storeRepository.findById(id)
                .orElseThrow(NotFoundException::new);
        publisher.publishEvent(new BeforeDeleteStore(id));
        storeRepository.delete(store);
    }

    private StoreDTO mapToDTO(final Store store, final StoreDTO storeDTO) {
        storeDTO.setId(store.getId());
        storeDTO.setName(store.getName());
        storeDTO.setCode(store.getCode());
        storeDTO.setAddress(store.getAddress());
        storeDTO.setCurrencyCode(store.getCurrencyCode());
        storeDTO.setTimezone(store.getTimezone());
        storeDTO.setStatus(store.getStatus());
        storeDTO.setBusinessSetting(store.getBusinessSetting() == null ? null : store.getBusinessSetting().getId());
        return storeDTO;
    }

    private Store mapToEntity(final StoreDTO storeDTO, final Store store) {
        store.setName(storeDTO.getName());
        store.setCode(storeDTO.getCode());
        store.setAddress(storeDTO.getAddress());
        store.setCurrencyCode(storeDTO.getCurrencyCode());
        store.setTimezone(storeDTO.getTimezone());
        store.setStatus(storeDTO.getStatus());
        final BusinessSetting businessSetting = storeDTO.getBusinessSetting() == null ? null : businessSettingRepository.findById(storeDTO.getBusinessSetting())
                .orElseThrow(() -> new NotFoundException("businessSetting not found"));
        store.setBusinessSetting(businessSetting);
        return store;
    }

    public boolean businessSettingExists(final UUID id) {
        return storeRepository.existsByBusinessSettingId(id);
    }

    @EventListener(BeforeDeleteBusinessSetting.class)
    public void on(final BeforeDeleteBusinessSetting event) {
        final ReferencedException referencedException = new ReferencedException();
        final Store businessSettingStore = storeRepository.findFirstByBusinessSettingId(event.getId());
        if (businessSettingStore != null) {
            referencedException.setKey("businessSetting.store.businessSetting.referenced");
            referencedException.addParam(businessSettingStore.getId());
            throw referencedException;
        }
    }

}
