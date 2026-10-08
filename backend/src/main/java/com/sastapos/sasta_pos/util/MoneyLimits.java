package com.sastapos.sasta_pos.util;

import java.math.BigDecimal;

/** Limits that mirror the numeric(18,2) database columns. */
public final class MoneyLimits {

    public static final BigDecimal MAX_AMOUNT = new BigDecimal("9999999999999999.99");

    private MoneyLimits() {
    }
}
