package com.sastapos.sasta_pos.events;

import java.util.UUID;
import lombok.AllArgsConstructor;
import lombok.Getter;


@Getter
@AllArgsConstructor
public class BeforeDeleteSale {

    private UUID id;

}
