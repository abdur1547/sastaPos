package com.sastapos.sasta_pos.auth.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Getter;
import lombok.Setter;


@Getter
@Setter
public class LoginRequest {

    @NotBlank
    private String email;

    @NotBlank
    private String password;

    /** Trim before validation and persistence; the service lowercases. */
    public void setEmail(final String email) {
        this.email = email == null ? null : email.trim();
    }

}
