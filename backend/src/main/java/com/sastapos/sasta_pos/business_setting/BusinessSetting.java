package com.sastapos.sasta_pos.business_setting;

import com.sastapos.sasta_pos.store.Store;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EntityListeners;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.UuidGenerator;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;


@Entity
@Table(name = "BusinessSettings")
@EntityListeners(AuditingEntityListener.class)
@Getter
@Setter
public class BusinessSetting {

    @Id
    @Column(nullable = false, updatable = false)
    @GeneratedValue
    @UuidGenerator
    private UUID id;

    @Column(nullable = false)
    private String invoicePrefix;

    @Column(nullable = false)
    private Integer invoiceNumberStart;

    @Column(nullable = false)
    private Integer nextInvoiceNumber;

    @Column(nullable = false)
    private Boolean defaultTaxInclusive;

    @Column(columnDefinition = "text")
    private String receiptFooter;

    @OneToOne(
            mappedBy = "businessSetting",
            fetch = FetchType.LAZY
    )
    private Store store;

    @CreatedDate
    @Column(nullable = false, updatable = false)
    private OffsetDateTime dateCreated;

    @LastModifiedDate
    @Column(nullable = false)
    private OffsetDateTime lastUpdated;

}
