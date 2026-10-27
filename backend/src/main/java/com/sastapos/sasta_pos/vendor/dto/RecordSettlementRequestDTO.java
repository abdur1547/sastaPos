package com.sastapos.sasta_pos.vendor.dto;

import com.sastapos.sasta_pos.payment.PaymentDirection;
import com.sastapos.sasta_pos.payment.PaymentMethod;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class RecordSettlementRequestDTO {

    private PaymentDirection direction;

    @NotNull
    @DecimalMin(value = "0.01", message = "amount must be > 0")
    private BigDecimal amount;

    @NotNull
    private PaymentMethod method;

    @Size(max = 255)
    private String referenceNumber;

    @Size(max = 1000)
    private String description;

}

