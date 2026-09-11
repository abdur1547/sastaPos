package com.sastapos.sasta_pos.store;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.UUID;
import lombok.Getter;
import lombok.Setter;


@Getter
@Setter
public class StoreDTO {

    private UUID id;

    @NotNull
    @Size(max = 255)
    private String name;

    @NotNull
    @Size(max = 255)
    private String code;

    @NotNull
    private String address;

    @NotNull
    @Size(max = 255)
    private String currencyCode;

    @NotNull
    @Size(max = 255)
    private String timezone;

    @NotNull
    private RowStatus status;

    @StoreBusinessSettingUnique
    private UUID businessSetting;

}
