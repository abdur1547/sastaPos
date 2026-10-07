package com.sastapos.sasta_pos.user.dto;

import com.sastapos.sasta_pos.store.RowStatus;
import com.sastapos.sasta_pos.user.UserRole;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.LocalDateTime;
import java.util.UUID;
import lombok.Getter;
import lombok.Setter;


@Getter
@Setter
public class UserDTO {

    private UUID id;

    @NotNull
    @Size(max = 255)
    private String name;

    @NotNull
    @Email
    @Size(max = 255)
    private String email;

    @NotNull
    private UserRole role;

    @NotNull
    private RowStatus status;

    private LocalDateTime lastLoginAt;

    private UUID store;

}
