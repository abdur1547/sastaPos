import { SaleRequest, SalePaymentRequest } from '../models/sale.model';
import { SellProduct } from '../models/sell.model';
import { SaleConflictError, SaleValidationError } from '../sell.errors';
import { divRound, fromScaled, toScaled } from './decimal';

/** Mirrors `MoneyLimits.MAX_AMOUNT` (numeric(18,2)) on the backend. */
const MAX_AMOUNT = toScaled('9999999999999999.99', 2);
const ZERO = 0n;

export interface PricedLine {
  readonly product: SellProduct;
  /** Quantity at 2 decimals, e.g. "2.00". */
  readonly quantity: string;
  readonly unitPrice: string;
  /** Summed tax rate at 4 decimals, e.g. "0.1000". */
  readonly taxRate: string;
  readonly taxable: string;
  readonly tax: string;
  readonly lineTotal: string;
}

export interface SaleTotals {
  readonly lines: readonly PricedLine[];
  readonly subtotal: string;
  readonly discount: string;
  readonly taxable: string;
  readonly tax: string;
  readonly total: string;
  readonly paid: string;
}

export interface QuantifiedProduct {
  readonly product: SellProduct;
  readonly quantity: string | number;
}

interface PricedAmounts {
  readonly quantity: bigint;
  readonly unitPrice: bigint;
  readonly taxRate: bigint;
  readonly taxable: bigint;
  readonly tax: bigint;
}

function priceLine(
  product: SellProduct,
  quantity: string | number,
): PricedAmounts {
  const qty = toScaled(quantity, 2);
  const unitPrice = toScaled(product.unitPrice, 2);
  const taxRate = toScaled(product.taxRate, 4);
  const taxable = divRound(unitPrice * qty, 100n);
  const tax = divRound(taxable * taxRate, 10_000n);
  return { quantity: qty, unitPrice, taxRate, taxable, tax };
}

function toPricedLine(
  product: SellProduct,
  amounts: PricedAmounts,
): PricedLine {
  return {
    product,
    quantity: fromScaled(amounts.quantity, 2),
    unitPrice: fromScaled(amounts.unitPrice, 2),
    taxRate: fromScaled(amounts.taxRate, 4),
    taxable: fromScaled(amounts.taxable, 2),
    tax: fromScaled(amounts.tax, 2),
    lineTotal: fromScaled(amounts.taxable + amounts.tax, 2),
  };
}

/**
 * Non-throwing totals for the live cart: taxes are exclusive, the discount reduces the
 * taxable base, and tax is computed per line from the undiscounted line amount.
 */
export function previewTotals(
  items: readonly QuantifiedProduct[],
  discount: string | number,
): SaleTotals {
  const priced = items.map((item) => ({
    item,
    amounts: priceLine(item.product, item.quantity),
  }));
  const subtotal = priced.reduce(
    (sum, line) => sum + line.amounts.taxable,
    ZERO,
  );
  const tax = priced.reduce((sum, line) => sum + line.amounts.tax, ZERO);
  const discountScaled = toScaled(discount, 2);
  const taxable = subtotal - discountScaled;
  return {
    lines: priced.map((line) => toPricedLine(line.item.product, line.amounts)),
    subtotal: fromScaled(subtotal, 2),
    discount: fromScaled(discountScaled, 2),
    taxable: fromScaled(taxable, 2),
    tax: fromScaled(tax, 2),
    total: fromScaled(taxable + tax, 2),
    paid: '0.00',
  };
}

/**
 * Server-equivalent calculation (`SaleCalculator.computeTotals`): validates quantities against
 * the unit of measure, the client-supplied line totals and the discount, then sums payments.
 */
export function computeTotals(
  request: SaleRequest,
  products: ReadonlyMap<string, SellProduct>,
): SaleTotals {
  const lines: PricedLine[] = [];
  let subtotal = ZERO;
  let tax = ZERO;

  for (const item of request.saleItems) {
    const product = products.get(item.productId);
    if (!product) {
      throw new SaleValidationError(`Product ${item.productId} was not found.`);
    }
    const amounts = priceLine(product, item.quantity);
    if (amounts.quantity <= ZERO) {
      throw new SaleValidationError(
        `quantity of product '${product.name}' must be greater than zero.`,
      );
    }
    if (!product.allowsFraction && amounts.quantity % 100n !== ZERO) {
      throw new SaleValidationError(
        `quantity of product '${product.name}' must be a whole number for unit of measure '${product.unitName}'.`,
      );
    }
    if (amounts.taxable > MAX_AMOUNT) {
      throw new SaleValidationError(
        `Line total of product '${product.name}' is too large.`,
      );
    }
    if (amounts.taxable !== toScaled(item.itemTotal, 2)) {
      throw new SaleValidationError(
        `itemTotal of product '${product.name}' must be ${fromScaled(amounts.taxable, 2)} ` +
          `(unitPrice ${product.unitPrice} x quantity ${fromScaled(amounts.quantity, 2)}) but was ${item.itemTotal}. ` +
          'The product price may have changed.',
      );
    }
    lines.push(toPricedLine(product, amounts));
    subtotal += amounts.taxable;
    tax += amounts.tax;
  }

  const discount = toScaled(request.discount, 2);
  if (discount < ZERO) {
    throw new SaleValidationError('discount must not be negative.');
  }
  if (discount > subtotal) {
    throw new SaleValidationError(
      `discount (${fromScaled(discount, 2)}) cannot exceed the subtotal (${fromScaled(subtotal, 2)}).`,
    );
  }
  const taxable = subtotal - discount;
  const total = taxable + tax;
  if (total > MAX_AMOUNT) {
    throw new SaleValidationError('Sale total is too large.');
  }

  return {
    lines,
    subtotal: fromScaled(subtotal, 2),
    discount: fromScaled(discount, 2),
    taxable: fromScaled(taxable, 2),
    tax: fromScaled(tax, 2),
    total: fromScaled(total, 2),
    paid: fromScaled(sumPayments(request.payments), 2),
  };
}

function sumPayments(payments: readonly SalePaymentRequest[]): bigint {
  return payments.reduce(
    (sum, payment) => sum + toScaled(payment.amount, 2),
    ZERO,
  );
}

/** Checks the client-supplied totals against the recomputed ones (`validateAgainstClient`). */
export function validateAgainstClient(
  request: SaleRequest,
  totals: SaleTotals,
  completing: boolean,
): void {
  if (toScaled(request.totalPrice, 2) !== toScaled(totals.total, 2)) {
    throw new SaleValidationError(
      `totalPrice must be ${totals.total} (subtotal - discount + tax) but was ${request.totalPrice}.`,
    );
  }
  if (toScaled(request.totalPaidPrice, 2) !== toScaled(totals.paid, 2)) {
    throw new SaleValidationError(
      `totalPaidPrice must equal the sum of payments (${totals.paid}) but was ${request.totalPaidPrice}.`,
    );
  }
  const paid = toScaled(totals.paid, 2);
  const total = toScaled(totals.total, 2);
  if (paid > total) {
    throw new SaleValidationError(
      `Payments (${totals.paid}) cannot exceed the sale total (${totals.total}).`,
    );
  }
  if (completing && request.saleType === 'DEBIT' && paid !== total) {
    throw new SaleValidationError(
      `A DEBIT sale must be fully paid: payments are ${totals.paid} but the total is ${totals.total}.`,
    );
  }
}

/** Stock is only enforced when a sale is completed; drafts may exceed stock. */
export function requireStock(lines: readonly PricedLine[]): void {
  for (const line of lines) {
    if (toScaled(line.product.stockQuantity, 2) < toScaled(line.quantity, 2)) {
      throw new SaleConflictError(
        `Insufficient stock for product '${line.product.name}': available ${line.product.stockQuantity}, requested ${line.quantity}.`,
      );
    }
  }
}
