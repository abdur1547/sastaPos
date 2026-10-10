package com.sastapos.sasta_pos.product;

import com.sastapos.sasta_pos.sale_item.SaleItem;
import com.sastapos.sasta_pos.stock_movement.StockMovement;
import com.sastapos.sasta_pos.store.RowStatus;
import com.sastapos.sasta_pos.store.Store;
import com.sastapos.sasta_pos.tax_category.TaxCategory;
import com.sastapos.sasta_pos.units_of_measure.UnitsOfMeasure;
import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EntityListeners;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.UuidGenerator;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;


@Entity
@Table(name = "Products")
@EntityListeners(AuditingEntityListener.class)
@Getter
@Setter
public class Product {

    @Id
    @Column(nullable = false, updatable = false)
    @GeneratedValue
    @UuidGenerator
    private UUID id;

    @Column(nullable = false)
    private String name;

    private String sku;

    private String barcode;

    @Column(nullable = false)
    private String pctCode;

    @Column(columnDefinition = "text")
    private String description;

    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal unitPrice;

    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal stockQuantity;

    @Column(nullable = false)
    @Enumerated(EnumType.STRING)
    private RowStatus status;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "units_of_measure_id", nullable = false)
    private UnitsOfMeasure unitsOfMeasure;

    @OneToMany(mappedBy = "product", cascade = CascadeType.ALL, orphanRemoval = true)
    private Set<ProductTaxCategory> taxCategoryLinks = new HashSet<>();

    @OneToMany(mappedBy = "product")
    private Set<SaleItem> saleItems = new HashSet<>();

    @OneToMany(mappedBy = "product")
    private Set<StockMovement> stockMovements = new HashSet<>();

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "store_id", nullable = false)
    private Store store;

    @CreatedDate
    @Column(nullable = false, updatable = false)
    private OffsetDateTime dateCreated;

    @LastModifiedDate
    @Column(nullable = false)
    private OffsetDateTime lastUpdated;

    public Set<TaxCategory> getTaxCategories() {
        final Set<TaxCategory> result = new HashSet<>();
        taxCategoryLinks.forEach(link -> result.add(link.getTaxCategory()));
        return result;
    }

    public void setTaxCategories(final Set<TaxCategory> taxCategories) {
        taxCategoryLinks.removeIf(link -> !taxCategories.contains(link.getTaxCategory()));
        final Set<TaxCategory> existing = getTaxCategories();
        taxCategories.stream().filter(tc -> !existing.contains(tc))
                .forEach(tc -> taxCategoryLinks.add(new ProductTaxCategory(this, tc)));
    }

}
