package com.sastapos.sasta_pos.pos_info;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EntityListeners;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.UuidGenerator;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

/** Global (not store-scoped) POS identity data required by FBR. Holds no secrets. */
@Entity
@Table(name = "pos_info")
@EntityListeners(AuditingEntityListener.class)
@Getter
@Setter
public class PosInfo {

    @Id
    @Column(nullable = false, updatable = false)
    @GeneratedValue
    @UuidGenerator
    private UUID id;

    @Column
    private String posId;

    @Column
    private String posName;

    @Column
    private String registrationNumber;

    @Column
    private String softwareName;

    @Column
    private String softwareVersion;

    @Column
    private String vendorName;

    @Column
    private String vendorNtn;

    @Column(nullable = false)
    private Boolean isActive;

    @CreatedDate
    @Column(nullable = false, updatable = false)
    private OffsetDateTime dateCreated;

    @LastModifiedDate
    @Column(nullable = false)
    private OffsetDateTime lastUpdated;

}
