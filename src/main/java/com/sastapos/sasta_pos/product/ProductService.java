package com.sastapos.sasta_pos.product;

import com.sastapos.sasta_pos.events.BeforeDeleteProduct;
import com.sastapos.sasta_pos.events.BeforeDeleteStore;
import com.sastapos.sasta_pos.store.Store;
import com.sastapos.sasta_pos.store.StoreRepository;
import com.sastapos.sasta_pos.tax_category.TaxCategory;
import com.sastapos.sasta_pos.tax_category.TaxCategoryRepository;
import com.sastapos.sasta_pos.units_of_measure.UnitsOfMeasure;
import com.sastapos.sasta_pos.units_of_measure.UnitsOfMeasureRepository;
import com.sastapos.sasta_pos.util.NotFoundException;
import com.sastapos.sasta_pos.util.ReferencedException;
import java.util.List;
import java.util.UUID;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.event.EventListener;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;


@Service
public class ProductService {

    private final ProductRepository productRepository;
    private final UnitsOfMeasureRepository unitsOfMeasureRepository;
    private final TaxCategoryRepository taxCategoryRepository;
    private final StoreRepository storeRepository;
    private final ApplicationEventPublisher publisher;

    public ProductService(final ProductRepository productRepository,
            final UnitsOfMeasureRepository unitsOfMeasureRepository,
            final TaxCategoryRepository taxCategoryRepository,
            final StoreRepository storeRepository, final ApplicationEventPublisher publisher) {
        this.productRepository = productRepository;
        this.unitsOfMeasureRepository = unitsOfMeasureRepository;
        this.taxCategoryRepository = taxCategoryRepository;
        this.storeRepository = storeRepository;
        this.publisher = publisher;
    }

    public List<ProductDTO> findAll() {
        final List<Product> products = productRepository.findAll(Sort.by("id"));
        return products.stream()
                .map(product -> mapToDTO(product, new ProductDTO()))
                .toList();
    }

    public ProductDTO get(final UUID id) {
        return productRepository.findById(id)
                .map(product -> mapToDTO(product, new ProductDTO()))
                .orElseThrow(NotFoundException::new);
    }

    public UUID create(final ProductDTO productDTO) {
        final Product product = new Product();
        mapToEntity(productDTO, product);
        return productRepository.save(product).getId();
    }

    public void update(final UUID id, final ProductDTO productDTO) {
        final Product product = productRepository.findById(id)
                .orElseThrow(NotFoundException::new);
        mapToEntity(productDTO, product);
        productRepository.save(product);
    }

    public void delete(final UUID id) {
        final Product product = productRepository.findById(id)
                .orElseThrow(NotFoundException::new);
        publisher.publishEvent(new BeforeDeleteProduct(id));
        productRepository.delete(product);
    }

    private ProductDTO mapToDTO(final Product product, final ProductDTO productDTO) {
        productDTO.setId(product.getId());
        productDTO.setName(product.getName());
        productDTO.setSku(product.getSku());
        productDTO.setBarcode(product.getBarcode());
        productDTO.setDescription(product.getDescription());
        productDTO.setSellingPrice(product.getSellingPrice());
        productDTO.setTaxRate(product.getTaxRate());
        productDTO.setStockQuantity(product.getStockQuantity());
        productDTO.setStatus(product.getStatus());
        productDTO.setUnitsOfMeasure(product.getUnitsOfMeasure() == null ? null : product.getUnitsOfMeasure().getId());
        productDTO.setTaxCategory(product.getTaxCategory() == null ? null : product.getTaxCategory().getId());
        productDTO.setStore(product.getStore() == null ? null : product.getStore().getId());
        return productDTO;
    }

    private Product mapToEntity(final ProductDTO productDTO, final Product product) {
        product.setName(productDTO.getName());
        product.setSku(productDTO.getSku());
        product.setBarcode(productDTO.getBarcode());
        product.setDescription(productDTO.getDescription());
        product.setSellingPrice(productDTO.getSellingPrice());
        product.setTaxRate(productDTO.getTaxRate());
        product.setStockQuantity(productDTO.getStockQuantity());
        product.setStatus(productDTO.getStatus());
        final UnitsOfMeasure unitsOfMeasure = productDTO.getUnitsOfMeasure() == null ? null : unitsOfMeasureRepository.findById(productDTO.getUnitsOfMeasure())
                .orElseThrow(() -> new NotFoundException("unitsOfMeasure not found"));
        product.setUnitsOfMeasure(unitsOfMeasure);
        final TaxCategory taxCategory = productDTO.getTaxCategory() == null ? null : taxCategoryRepository.findById(productDTO.getTaxCategory())
                .orElseThrow(() -> new NotFoundException("taxCategory not found"));
        product.setTaxCategory(taxCategory);
        final Store store = productDTO.getStore() == null ? null : storeRepository.findById(productDTO.getStore())
                .orElseThrow(() -> new NotFoundException("store not found"));
        product.setStore(store);
        return product;
    }

    public boolean nameExists(final String name) {
        return productRepository.existsByNameIgnoreCase(name);
    }

    public boolean skuExists(final String sku) {
        return productRepository.existsBySkuIgnoreCase(sku);
    }

    public boolean barcodeExists(final String barcode) {
        return productRepository.existsByBarcodeIgnoreCase(barcode);
    }

    @EventListener(BeforeDeleteStore.class)
    public void on(final BeforeDeleteStore event) {
        final ReferencedException referencedException = new ReferencedException();
        final Product storeProduct = productRepository.findFirstByStoreId(event.getId());
        if (storeProduct != null) {
            referencedException.setKey("store.product.store.referenced");
            referencedException.addParam(storeProduct.getId());
            throw referencedException;
        }
    }

}
