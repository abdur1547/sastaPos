package com.sastapos.sasta_pos.sale;

import com.sastapos.sasta_pos.events.BeforeDeleteSale;
import com.sastapos.sasta_pos.events.BeforeDeleteStore;
import com.sastapos.sasta_pos.events.BeforeDeleteUser;
import com.sastapos.sasta_pos.store.Store;
import com.sastapos.sasta_pos.store.StoreRepository;
import com.sastapos.sasta_pos.user.User;
import com.sastapos.sasta_pos.user.UserRepository;
import com.sastapos.sasta_pos.util.NotFoundException;
import com.sastapos.sasta_pos.util.ReferencedException;
import java.util.List;
import java.util.UUID;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.event.EventListener;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;


@Service
public class SaleService {

    private final SaleRepository saleRepository;
    private final UserRepository userRepository;
    private final StoreRepository storeRepository;
    private final ApplicationEventPublisher publisher;

    public SaleService(final SaleRepository saleRepository, final UserRepository userRepository,
            final StoreRepository storeRepository, final ApplicationEventPublisher publisher) {
        this.saleRepository = saleRepository;
        this.userRepository = userRepository;
        this.storeRepository = storeRepository;
        this.publisher = publisher;
    }

    public List<SaleDTO> findAll() {
        final List<Sale> sales = saleRepository.findAll(Sort.by("id"));
        return sales.stream()
                .map(sale -> mapToDTO(sale, new SaleDTO()))
                .toList();
    }

    public SaleDTO get(final UUID id) {
        return saleRepository.findById(id)
                .map(sale -> mapToDTO(sale, new SaleDTO()))
                .orElseThrow(NotFoundException::new);
    }

    public UUID create(final SaleDTO saleDTO) {
        final Sale sale = new Sale();
        mapToEntity(saleDTO, sale);
        return saleRepository.save(sale).getId();
    }

    public void update(final UUID id, final SaleDTO saleDTO) {
        final Sale sale = saleRepository.findById(id)
                .orElseThrow(NotFoundException::new);
        mapToEntity(saleDTO, sale);
        saleRepository.save(sale);
    }

    public void delete(final UUID id) {
        final Sale sale = saleRepository.findById(id)
                .orElseThrow(NotFoundException::new);
        publisher.publishEvent(new BeforeDeleteSale(id));
        saleRepository.delete(sale);
    }

    private SaleDTO mapToDTO(final Sale sale, final SaleDTO saleDTO) {
        saleDTO.setId(sale.getId());
        saleDTO.setInvoiceNumber(sale.getInvoiceNumber());
        saleDTO.setSubtotal(sale.getSubtotal());
        saleDTO.setDiscountAmount(sale.getDiscountAmount());
        saleDTO.setTaxableAmount(sale.getTaxableAmount());
        saleDTO.setTaxAmount(sale.getTaxAmount());
        saleDTO.setTotalAmount(sale.getTotalAmount());
        saleDTO.setCurrencyCode(sale.getCurrencyCode());
        saleDTO.setStatus(sale.getStatus());
        saleDTO.setSoldAt(sale.getSoldAt());
        saleDTO.setUser(sale.getUser() == null ? null : sale.getUser().getId());
        saleDTO.setStore(sale.getStore() == null ? null : sale.getStore().getId());
        return saleDTO;
    }

    private Sale mapToEntity(final SaleDTO saleDTO, final Sale sale) {
        sale.setInvoiceNumber(saleDTO.getInvoiceNumber());
        sale.setSubtotal(saleDTO.getSubtotal());
        sale.setDiscountAmount(saleDTO.getDiscountAmount());
        sale.setTaxableAmount(saleDTO.getTaxableAmount());
        sale.setTaxAmount(saleDTO.getTaxAmount());
        sale.setTotalAmount(saleDTO.getTotalAmount());
        sale.setCurrencyCode(saleDTO.getCurrencyCode());
        sale.setStatus(saleDTO.getStatus());
        sale.setSoldAt(saleDTO.getSoldAt());
        final User user = saleDTO.getUser() == null ? null : userRepository.findById(saleDTO.getUser())
                .orElseThrow(() -> new NotFoundException("user not found"));
        sale.setUser(user);
        final Store store = saleDTO.getStore() == null ? null : storeRepository.findById(saleDTO.getStore())
                .orElseThrow(() -> new NotFoundException("store not found"));
        sale.setStore(store);
        return sale;
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
