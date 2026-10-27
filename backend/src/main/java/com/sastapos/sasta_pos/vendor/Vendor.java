package com.sastapos.sasta_pos.vendor;

import com.sastapos.sasta_pos.store.RowStatus;
import com.sastapos.sasta_pos.store.Store;
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
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.UuidGenerator;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;


@Entity
@Table(name = "Vendors")
@EntityListeners(AuditingEntityListener.class)
@Getter
@Setter
public class Vendor {

    @Id
    @Column(nullable = false, updatable = false)
    @GeneratedValue
    @UuidGenerator
    private UUID id;

    @Column(nullable = false)
    private String name;

    private String phoneNumber;

    private String ntn;

    private String strn;

    @Column(nullable = false)
    @Enumerated(EnumType.STRING)
    private TaxRegistrationStatus salesTaxRegistrationStatus = TaxRegistrationStatus.UNREGISTERED;

    @Column(columnDefinition = "text")
    private String address;

    /** Positive: vendor owes the store (advance); negative: the store owes the vendor. */
    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal accountBalance = BigDecimal.ZERO.setScale(2);

    @Column(nullable = false)
    @Enumerated(EnumType.STRING)
    private RowStatus status = RowStatus.ACTIVE;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "store_id", nullable = false)
    private Store store;

    @CreatedDate
    @Column(nullable = false, updatable = false)
    private OffsetDateTime dateCreated;

    @LastModifiedDate
    @Column(nullable = false)
    private OffsetDateTime lastUpdated;

}

