import { SaleRequest } from "../models/sale.model";
import { SaleValidationError } from "../sell.errors";
import { toScaled } from "./decimal";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_ITEMS = 500;
const MAX_PAYMENTS = 50;

/** Structural checks that do not need the database (use case 5, validations 1-3, 5, 11). */
export function validateSaleRequest(request: SaleRequest): void {
  if (request.saleItems.length === 0) {
    throw new SaleValidationError("Add at least one product to the sale.");
  }
  if (request.saleItems.length > MAX_ITEMS) {
    throw new SaleValidationError(
      `A sale can have at most ${MAX_ITEMS} products.`,
    );
  }
  if (request.totalItems !== request.saleItems.length) {
    throw new SaleValidationError(
      `totalItems (${request.totalItems}) must equal the number of sale items (${request.saleItems.length}).`,
    );
  }

  const productIds = new Set<string>();
  for (const item of request.saleItems) {
    if (!UUID_PATTERN.test(item.productId)) {
      throw new SaleValidationError("Every sale item needs a valid product.");
    }
    if (!productIds.add(item.productId)) {
      throw new SaleValidationError(
        "Each product may only be listed once per sale.",
      );
    }
  }

  if (request.customerId !== null && !UUID_PATTERN.test(request.customerId)) {
    throw new SaleValidationError("customerId must be a valid customer.");
  }
  if (request.saleType === "CREDIT" && request.customerId === null) {
    throw new SaleValidationError("Select a customer to sell on credit.");
  }
  if (request.saleId !== null && !UUID_PATTERN.test(request.saleId)) {
    throw new SaleValidationError("saleId must be a valid sale.");
  }

  if (request.payments.length > MAX_PAYMENTS) {
    throw new SaleValidationError(
      `A sale can have at most ${MAX_PAYMENTS} payments.`,
    );
  }
  for (const payment of request.payments) {
    if (payment.method !== "CASH" && payment.method !== "BANK") {
      throw new SaleValidationError("Payment method must be CASH or BANK.");
    }
    if (toScaled(payment.amount, 2) <= 0n) {
      throw new SaleValidationError(
        "Each payment amount must be greater than zero.",
      );
    }
  }
}
