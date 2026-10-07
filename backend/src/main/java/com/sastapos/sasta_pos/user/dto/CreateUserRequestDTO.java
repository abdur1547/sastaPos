package com.sastapos.sasta_pos.user.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class CreateUserRequestDTO {
  @NotBlank
  @Size(max = 255)
  private String name;

  @NotBlank
  @Email
  @Size(max = 255)
  private String email;

  @NotBlank
  @Size(max = 72)
  private String password;
//  user role will be CASHIER

  /** Trim before validation; the service lowercases. */
  public void setEmail(final String email) {
    this.email = email == null ? null : email.trim();
  }
}
