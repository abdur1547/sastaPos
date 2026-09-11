package com.sastapos.sasta_pos.user;

import com.sastapos.sasta_pos.store.RowStatus;
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
    @Size(max = 255)
    private String userName;

    @NotNull
    private String passwordHash;

    @NotNull
    private UserRole role;

    @NotNull
    private RowStatus status;

    private LocalDateTime lastLoginAt;

    private UUID store;

}
