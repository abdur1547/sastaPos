package com.sastapos.sasta_pos.ledger_entry;

import com.sastapos.sasta_pos.customer.Customer;
import com.sastapos.sasta_pos.sale.Sale;
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


/** Append-only customer ledger row; only the void flags of an original PAYMENT are ever mutated. */
@Entity
@Table(name = "LedgerEntries")
@EntityListeners(AuditingEntityListener.class)
@Getter
@Setter
public class LedgerEntry {

    @Id
    @Column(nullable = false, updatable = false)
    @GeneratedValue
    @UuidGenerator
    private UUID id;

    @Column(nullable = false)
    @Enumerated(EnumType.STRING)
    private LedgerDirection direction;

    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal amount;

    @Column(nullable = false)
    @Enumerated(EnumType.STRING)
    private LedgerEntryType type;

    private String referenceNumber;

    @Column(columnDefinition = "text")
    private String description;

    @Column(nullable = false)
    private boolean voided;

    @Column(columnDefinition = "text")
    private String voidReason;

    private OffsetDateTime voidedAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "voided_by")
    private User voidedBy;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "customer_id", nullable = false)
    private Customer customer;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "sale_id")
    private Sale sale;

    @CreatedDate
    @Column(nullable = false, updatable = false)
    private OffsetDateTime dateCreated;

    @LastModifiedDate
    @Column(nullable = false)
    private OffsetDateTime lastUpdated;

}
