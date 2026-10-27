package com.sastapos.sasta_pos.store.dto;

import com.sastapos.sasta_pos.auth.dto.AuthenticatedUserDTO;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;


/**
 * Response for store creation: the created store plus the caller's updated profile
 * ({@code role = OWNER}, {@code storeId} set), and a fresh access token containing store_id.
 */
@Getter
@Setter
@NoArgsConstructor
public class CreateStoreResponse {

    private StoreDTO store;

    private AuthenticatedUserDTO user;

    private String accessToken;

    private Long expiresIn;

    public CreateStoreResponse(final StoreDTO store, final AuthenticatedUserDTO user) {
        this.store = store;
        this.user = user;
    }

    public CreateStoreResponse(final StoreDTO store, final AuthenticatedUserDTO user,
            final String accessToken, final Long expiresIn) {
        this.store = store;
        this.user = user;
        this.accessToken = accessToken;
        this.expiresIn = expiresIn;
    }

}
