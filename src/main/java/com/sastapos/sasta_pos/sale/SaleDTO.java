package com.sastapos.sasta_pos.sale;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.LocalDateTime;
import java.util.UUID;
import lombok.Getter;
import lombok.Setter;


@Getter
@Setter
public class SaleDTO {

    private UUID id;

    @NotNull
    @Size(max = 255)
    private String invoiceNumber;

    @NotNull
    private Double subtotal;

    @NotNull
    private Double discountAmount;

    @NotNull
    private Double taxableAmount;

    @NotNull
    private Double taxAmount;

    @NotNull
    private Double totalAmount;

    @NotNull
    @Size(max = 255)
    private String currencyCode;

    @NotNull
    private SaleStatus status;

    @NotNull
    private LocalDateTime soldAt;

    private UUID user;

    private UUID store;

}
