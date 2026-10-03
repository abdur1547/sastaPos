package com.sastapos.sasta_pos.auth.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;


@Getter
@Setter
public class SignupRequest {

    @NotBlank
    @Size(max = 255)
    private String name;

    @NotBlank
    @Email
    @Size(max = 255)
    private String email;

    @NotBlank
    private String password;

    /** Trim before validation and persistence; the service lowercases. */
    public void setEmail(final String email) {
        this.email = email == null ? null : email.trim();
    }

}
