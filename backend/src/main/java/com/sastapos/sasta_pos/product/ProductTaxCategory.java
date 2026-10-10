package com.sastapos.sasta_pos.product;

import com.sastapos.sasta_pos.tax_category.TaxCategory;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.Getter;
import lombok.Setter;


/**
 * Product / tax category link. PowerSync needs a single-column primary key, so the id is the pair
 * encoded as {@code ["productId","taxCategoryId"]} - the same value the desktop app generates, so
 * rows created on either side converge on one id.
 */
@Entity
@Table(name = "product_tax_categories",
        uniqueConstraints = @UniqueConstraint(name = "uq_product_tax_categories_pair",
                columnNames = {"product_id", "tax_category_id"}))
@Getter
@Setter
public class ProductTaxCategory {

    @Id
    @Column(nullable = false, updatable = false, columnDefinition = "text")
    private String id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "product_id", nullable = false, updatable = false)
    private Product product;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "tax_category_id", nullable = false, updatable = false)
    private TaxCategory taxCategory;

    public ProductTaxCategory() {
    }

    public ProductTaxCategory(final Product product, final TaxCategory taxCategory) {
        this.product = product;
        this.taxCategory = taxCategory;
    }

    @PrePersist
    void assignId() {
        if (id == null) {
            id = "[\"" + product.getId() + "\",\"" + taxCategory.getId() + "\"]";
        }
    }

}
