package com.sastapos.sasta_pos.sale;

import com.sastapos.sasta_pos.customer.Customer;
import com.sastapos.sasta_pos.payment.Payment;
import com.sastapos.sasta_pos.sale_item.SaleItem;
import com.sastapos.sasta_pos.store.Store;
import com.sastapos.sasta_pos.user.User;
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
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.BatchSize;
import org.hibernate.annotations.UuidGenerator;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;


@Entity
@Table(name = "Sales")
@EntityListeners(AuditingEntityListener.class)
@Getter
@Setter
public class Sale {

    @Id
    @Column(nullable = false, updatable = false)
    @GeneratedValue
    @UuidGenerator
    private UUID id;

    @Column(nullable = false)
    private String invoiceNumber;

    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal subtotal;

    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal discountAmount;

    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal taxableAmount;

    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal taxAmount;

    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal totalAmount;

    @Column(nullable = false)
    private String currencyCode = "PKR";

    @Column(nullable = false)
    @Enumerated(EnumType.STRING)
    private SaleType saleType = SaleType.DEBIT;

    @Column(nullable = false)
    @Enumerated(EnumType.STRING)
    private SaleStatus status;

    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal totalPaid = BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);

    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal remaining = BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);

    @Column(columnDefinition = "text")
    private String description;

    @Column(columnDefinition = "text")
    private String voidReason;

    private OffsetDateTime voidedAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "voided_by")
    private User voidedBy;

    @Column(nullable = false)
    private LocalDateTime soldAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id")
    private User user;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "customer_id")
    private Customer customer;

    @OneToMany(mappedBy = "sale", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("dateCreated ASC, id ASC")
    @BatchSize(size = 50)
    private List<SaleItem> saleItems = new ArrayList<>();

    @OneToMany(mappedBy = "sale", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("dateCreated ASC, id ASC")
    @BatchSize(size = 50)
    private List<Payment> payments = new ArrayList<>();

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "store_id")
    private Store store;

    @CreatedDate
    @Column(nullable = false, updatable = false)
    private OffsetDateTime dateCreated;

    @LastModifiedDate
    @Column(nullable = false)
    private OffsetDateTime lastUpdated;

}
