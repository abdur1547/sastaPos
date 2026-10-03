package com.sastapos.sasta_pos.store.dto;

import com.sastapos.sasta_pos.store.RowStatus;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;


/**
 * Partial update of the store profile (PATCH semantics: only non-null fields are applied).
 * {@code name}, if provided, must not be blank (validated in the service).
 */
@Getter
@Setter
public class UpdateStoreRequest {

    @Size(max = 255)
    private String name;

    @Size(max = 255)
    private String ntn;

    @Size(max = 1000)
    private String address;

    @Size(max = 10)
    private String currencyCode;

    @Size(max = 100)
    private String timezone;

    private RowStatus status;

}
