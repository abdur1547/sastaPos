package com.sastapos.sasta_pos.auth.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Getter;
import lombok.Setter;


@Getter
@Setter
public class PasswordResetCompleteRequest {

    @NotBlank
    private String token;

    @NotBlank
    private String newPassword;

}
