package com.sastapos.sasta_pos.store;

import com.sastapos.sasta_pos.business_setting.BusinessSetting;
import com.sastapos.sasta_pos.product.Product;
import com.sastapos.sasta_pos.sale.Sale;
import com.sastapos.sasta_pos.stock_movement.StockMovement;
import com.sastapos.sasta_pos.tax_category.TaxCategory;
import com.sastapos.sasta_pos.user.User;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EntityListeners;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;
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
@Table(name = "Stores")
@EntityListeners(AuditingEntityListener.class)
@Getter
@Setter
public class Store {

    @Id
    @Column(nullable = false, updatable = false)
    @GeneratedValue
    @UuidGenerator
    private UUID id;

    @Column(nullable = false)
    private String name;

    @Column(nullable = false)
    private String code;

    @Column(nullable = false, columnDefinition = "text")
    private String address;

    @Column(nullable = false)
    private String currencyCode;

    @Column(nullable = false)
    private String timezone;

    @Column(nullable = false)
    @Enumerated(EnumType.STRING)
    private RowStatus status;

    @OneToMany(mappedBy = "store")
    private Set<User> users = new HashSet<>();

    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "business_setting_id", unique = true)
    private BusinessSetting businessSetting;

    @OneToMany(mappedBy = "store")
    private Set<TaxCategory> taxCategories = new HashSet<>();

    @OneToMany(mappedBy = "store")
    private Set<Product> products = new HashSet<>();

    @OneToMany(mappedBy = "store")
    private Set<Sale> sales = new HashSet<>();

    @OneToMany(mappedBy = "store")
    private Set<StockMovement> stockMovementss = new HashSet<>();

    @CreatedDate
    @Column(nullable = false, updatable = false)
    private OffsetDateTime dateCreated;

    @LastModifiedDate
    @Column(nullable = false)
    private OffsetDateTime lastUpdated;

}
