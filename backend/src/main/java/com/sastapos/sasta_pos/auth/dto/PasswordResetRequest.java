package com.sastapos.sasta_pos.auth.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import lombok.Getter;
import lombok.Setter;


@Getter
@Setter
public class PasswordResetRequest {

    @NotBlank
    @Email
    private String email;

}
