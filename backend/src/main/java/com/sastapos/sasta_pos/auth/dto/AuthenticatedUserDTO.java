package com.sastapos.sasta_pos.auth.dto;

import com.sastapos.sasta_pos.store.RowStatus;
import com.sastapos.sasta_pos.user.UserRole;
import java.util.UUID;
import lombok.Getter;
import lombok.Setter;


/**
 * Safe, public-facing user profile. Never carries {@code password} or {@code passwordHash}.
 */
@Getter
@Setter
public class AuthenticatedUserDTO {

    private UUID id;

    private String name;

    private String email;

    private UserRole role;

    private RowStatus status;

    private UUID storeId;

}
