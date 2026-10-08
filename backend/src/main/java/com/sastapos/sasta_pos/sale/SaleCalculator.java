package com.sastapos.sasta_pos.sale;

import com.sastapos.sasta_pos.payment.PaymentMethod;
import com.sastapos.sasta_pos.product.Product;
import com.sastapos.sasta_pos.sale.dto.CreateSaleRequestDTO;
import com.sastapos.sasta_pos.sale.dto.SaleItemRequestDTO;
import com.sastapos.sasta_pos.sale.dto.SalePaymentRequestDTO;
import com.sastapos.sasta_pos.tax_category.TaxCategory;
import com.sastapos.sasta_pos.util.BadRequestException;
import com.sastapos.sasta_pos.util.ConflictException;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static com.sastapos.sasta_pos.util.MoneyLimits.MAX_AMOUNT;

/** Pure sale arithmetic and the checks of client-supplied totals against it; no persistence. */
final class SaleCalculator {

    static final BigDecimal ZERO = BigDecimal.ZERO.setScale(2);

    record Line(Product product, BigDecimal quantity, BigDecimal unitPrice, BigDecimal taxRate,
                BigDecimal taxable, BigDecimal tax) {
    }

    record Totals(List<Line> lines, BigDecimal subtotal, BigDecimal discount, BigDecimal taxable,
                  BigDecimal tax, BigDecimal total, BigDecimal paid) {
    }

    private SaleCalculator() {
    }

    static Totals computeTotals(final CreateSaleRequestDTO request, final List<SaleItemRequestDTO> items,
            final List<SalePaymentRequestDTO> payments, final Map<UUID, Product> products) {
        final List<Line> lines = new ArrayList<>();
        BigDecimal subtotal = ZERO;
        BigDecimal tax = ZERO;
        for (final SaleItemRequestDTO item : items) {
            final Product product = products.get(item.getProductId());
            final BigDecimal quantity = item.getQuantity().setScale(2, RoundingMode.HALF_UP);
            if (!Boolean.TRUE.equals(product.getUnitsOfMeasure().getAllowsFraction())
                    && quantity.stripTrailingZeros().scale() > 0) {
                throw new BadRequestException("quantity of product '" + product.getName()
                        + "' must be a whole number for unit of measure '"
                        + product.getUnitsOfMeasure().getName() + "'");
            }
            final BigDecimal unitPrice = product.getUnitPrice();
            final BigDecimal taxable = unitPrice.multiply(quantity).setScale(2, RoundingMode.HALF_UP);
            if (taxable.compareTo(MAX_AMOUNT) > 0) {
                throw new BadRequestException("Line total of product '" + product.getName() + "' is too large");
            }
            if (taxable.compareTo(item.getItemTotal().setScale(2, RoundingMode.HALF_UP)) != 0) {
                throw new BadRequestException("itemTotal of product '" + product.getName() + "' must be "
                        + taxable.toPlainString() + " (unitPrice " + unitPrice.toPlainString() + " x quantity "
                        + quantity.toPlainString() + ") but was " + item.getItemTotal().toPlainString());
            }
            final BigDecimal taxRate = product.getTaxCategories().stream()
                    .map(TaxCategory::getRate).map(BigDecimal::valueOf)
                    .reduce(BigDecimal.ZERO, BigDecimal::add).setScale(4, RoundingMode.HALF_UP);
            final BigDecimal lineTax = taxable.multiply(taxRate).setScale(2, RoundingMode.HALF_UP);
            lines.add(new Line(product, quantity, unitPrice, taxRate, taxable, lineTax));
            subtotal = subtotal.add(taxable);
            tax = tax.add(lineTax);
        }
        final BigDecimal discount = request.getDiscount() == null ? ZERO : request.getDiscount().setScale(2, RoundingMode.HALF_UP);
        if (discount.compareTo(subtotal) > 0) {
            throw new BadRequestException("discount (" + discount.toPlainString()
                    + ") cannot exceed the subtotal (" + subtotal.toPlainString() + ")");
        }
        final BigDecimal taxable = subtotal.subtract(discount);
        final BigDecimal total = taxable.add(tax);
        if (total.compareTo(MAX_AMOUNT) > 0) {
            throw new BadRequestException("Sale total is too large");
        }
        BigDecimal paid = ZERO;
        for (final SalePaymentRequestDTO payment : payments) {
            if (payment.getMethod() == PaymentMethod.CREDIT) {
                throw new BadRequestException("payments[].method must be CASH or BANK; CREDIT is derived "
                        + "by the backend");
            }
            paid = paid.add(payment.getAmount().setScale(2, RoundingMode.HALF_UP));
        }
        return new Totals(lines, subtotal, discount, taxable, tax, total, paid);
    }

    static void validateAgainstClient(final CreateSaleRequestDTO request, final Totals totals,
            final boolean completing) {
        if (request.getTotalPrice().setScale(2, RoundingMode.HALF_UP).compareTo(totals.total()) != 0) {
            throw new BadRequestException("totalPrice must be " + totals.total().toPlainString()
                    + " (subtotal - discount + tax) but was " + request.getTotalPrice().toPlainString());
        }
        if (request.getTotalPaidPrice().setScale(2, RoundingMode.HALF_UP).compareTo(totals.paid()) != 0) {
            throw new BadRequestException("totalPaidPrice must equal the sum of payments ("
                    + totals.paid().toPlainString() + ") but was " + request.getTotalPaidPrice().toPlainString());
        }
      int isEqual = totals.paid().compareTo(totals.total());
      if (isEqual > 0) {
            throw new BadRequestException("Payments (" + totals.paid().toPlainString()
                    + ") cannot exceed the sale total (" + totals.total().toPlainString() + ")");
        }
        if (completing && request.getSaleType() == SaleType.DEBIT && isEqual != 0) {
            throw new BadRequestException("A DEBIT sale must be fully paid: payments are "
                    + totals.paid().toPlainString() + " but the total is " + totals.total().toPlainString());
        }
    }

    static void requireStock(final List<Line> lines) {
        for (final Line line : lines) {
            final BigDecimal available = line.product().getStockQuantity();
            if (available.compareTo(line.quantity()) < 0) {
                throw new ConflictException("Insufficient stock for product '" + line.product().getName()
                        + "' (" + line.product().getId() + "): available " + available.toPlainString()
                        + ", requested " + line.quantity().toPlainString());
            }
        }
    }
}
