package com.sastapos.sasta_pos.business_setting;

import com.sastapos.sasta_pos.events.BeforeDeleteBusinessSetting;
import com.sastapos.sasta_pos.util.NotFoundException;
import java.util.List;
import java.util.UUID;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;


@Service
public class BusinessSettingService {

    private final BusinessSettingRepository businessSettingRepository;
    private final ApplicationEventPublisher publisher;

    public BusinessSettingService(final BusinessSettingRepository businessSettingRepository,
            final ApplicationEventPublisher publisher) {
        this.businessSettingRepository = businessSettingRepository;
        this.publisher = publisher;
    }

    public List<BusinessSettingDTO> findAll() {
        final List<BusinessSetting> businessSettings = businessSettingRepository.findAll(Sort.by("id"));
        return businessSettings.stream()
                .map(businessSetting -> mapToDTO(businessSetting, new BusinessSettingDTO()))
                .toList();
    }

    public BusinessSettingDTO get(final UUID id) {
        return businessSettingRepository.findById(id)
                .map(businessSetting -> mapToDTO(businessSetting, new BusinessSettingDTO()))
                .orElseThrow(NotFoundException::new);
    }

    public UUID create(final BusinessSettingDTO businessSettingDTO) {
        final BusinessSetting businessSetting = new BusinessSetting();
        mapToEntity(businessSettingDTO, businessSetting);
        return businessSettingRepository.save(businessSetting).getId();
    }

    public void update(final UUID id, final BusinessSettingDTO businessSettingDTO) {
        final BusinessSetting businessSetting = businessSettingRepository.findById(id)
                .orElseThrow(NotFoundException::new);
        mapToEntity(businessSettingDTO, businessSetting);
        businessSettingRepository.save(businessSetting);
    }

    public void delete(final UUID id) {
        final BusinessSetting businessSetting = businessSettingRepository.findById(id)
                .orElseThrow(NotFoundException::new);
        publisher.publishEvent(new BeforeDeleteBusinessSetting(id));
        businessSettingRepository.delete(businessSetting);
    }

    private BusinessSettingDTO mapToDTO(final BusinessSetting businessSetting,
            final BusinessSettingDTO businessSettingDTO) {
        businessSettingDTO.setId(businessSetting.getId());
        businessSettingDTO.setInvoicePrefix(businessSetting.getInvoicePrefix());
        businessSettingDTO.setInvoiceNumberStart(businessSetting.getInvoiceNumberStart());
        businessSettingDTO.setNextInvoiceNumber(businessSetting.getNextInvoiceNumber());
        businessSettingDTO.setDefaultTaxInclusive(businessSetting.getDefaultTaxInclusive());
        businessSettingDTO.setReceiptFooter(businessSetting.getReceiptFooter());
        return businessSettingDTO;
    }

    private BusinessSetting mapToEntity(final BusinessSettingDTO businessSettingDTO,
            final BusinessSetting businessSetting) {
        businessSetting.setInvoicePrefix(businessSettingDTO.getInvoicePrefix());
        businessSetting.setInvoiceNumberStart(businessSettingDTO.getInvoiceNumberStart());
        businessSetting.setNextInvoiceNumber(businessSettingDTO.getNextInvoiceNumber());
        businessSetting.setDefaultTaxInclusive(businessSettingDTO.getDefaultTaxInclusive());
        businessSetting.setReceiptFooter(businessSettingDTO.getReceiptFooter());
        return businessSetting;
    }

}
