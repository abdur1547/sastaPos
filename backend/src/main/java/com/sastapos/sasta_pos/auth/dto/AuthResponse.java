package com.sastapos.sasta_pos.auth.dto;

import lombok.Getter;
import lombok.Setter;


@Getter
@Setter
public class AuthResponse {

    private String accessToken;

    private String tokenType = "Bearer";

    private long expiresIn;

    private AuthenticatedUserDTO user;

    public AuthResponse(final String accessToken, final long expiresIn, final AuthenticatedUserDTO user) {
        this.accessToken = accessToken;
        this.expiresIn = expiresIn;
        this.user = user;
    }

}
