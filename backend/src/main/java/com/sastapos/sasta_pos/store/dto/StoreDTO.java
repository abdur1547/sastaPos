package com.sastapos.sasta_pos.store.dto;

import java.util.UUID;

import com.sastapos.sasta_pos.store.RowStatus;
import lombok.Getter;
import lombok.Setter;


@Getter
@Setter
public class StoreDTO {

    private UUID id;

    private String name;

    private String ntn;

    private String address;

    private String currencyCode;

    private String timezone;

    private RowStatus status;

    private StoreSettingsDTO storeSettings;

}
