package com.sastapos.sasta_pos.pos_info.dto;

import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class PosInfoDTO {

    private UUID id;
    private String posId;
    private String posName;
    private String registrationNumber;
    private String softwareName;
    private String softwareVersion;
    private String vendorName;
    private String vendorNtn;
    private Boolean isActive;
    private OffsetDateTime dateCreated;
    private OffsetDateTime lastUpdated;

}
