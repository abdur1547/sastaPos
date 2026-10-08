package com.sastapos.sasta_pos.units_of_measure.dto;

import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class UnitsOfMeasureDTO {

    private UUID id;
    private String name;
    private String code;
    private Boolean allowsFraction;
    private Boolean isActive;
    private OffsetDateTime dateCreated;
    private OffsetDateTime lastUpdated;

}
