package com.sastapos.sasta_pos.auth.dto;

import lombok.Getter;
import lombok.Setter;


@Getter
@Setter
public class MessageResponse {

    private final String message;

    public MessageResponse(final String message) {
        this.message = message;
    }

}
