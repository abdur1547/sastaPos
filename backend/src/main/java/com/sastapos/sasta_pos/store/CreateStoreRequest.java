package com.sastapos.sasta_pos.store;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;


@Getter
@Setter
public class CreateStoreRequest {

    @NotBlank
    @Size(max = 255)
    private String name;

    @NotBlank
    @Size(max = 255)
    private String ntn;

    @Size(max = 1000)
    private String address;

    @Size(max = 10)
    private String currencyCode;

    @Size(max = 100)
    private String timezone;

}
