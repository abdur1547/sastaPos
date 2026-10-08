package com.sastapos.sasta_pos.customer.dto;

import com.sastapos.sasta_pos.store.RowStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.Getter;
import lombok.Setter;


@Getter
@Setter
public class CustomerDTO {

    private UUID id;
    private String name;
    private String phoneNumber;
    private String ntn;

    @Schema(description = "> 0: customer owes the store; < 0: store owes the customer; 0: settled")
    private BigDecimal accountBalance;

    private RowStatus status;
    private UUID storeId;
    private OffsetDateTime createdAt;
    private OffsetDateTime lastUpdated;

}
