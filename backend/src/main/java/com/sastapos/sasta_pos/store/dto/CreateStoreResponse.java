package com.sastapos.sasta_pos.store.dto;

import com.sastapos.sasta_pos.auth.dto.AuthenticatedUserDTO;
import lombok.Getter;
import lombok.Setter;


/**
 * Response for store creation: the created store plus the caller's updated profile
 * ({@code role = OWNER}, {@code storeId} set).
 */
@Getter
@Setter
public class CreateStoreResponse {

    private StoreDTO store;

    private AuthenticatedUserDTO user;

    public CreateStoreResponse(final StoreDTO store, final AuthenticatedUserDTO user) {
        this.store = store;
        this.user = user;
    }

}
