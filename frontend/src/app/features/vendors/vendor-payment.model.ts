import { fromScaled, toScaled } from "../../shared/utils/decimal";
import { VendorValidationError } from "./vendor.errors";
import { vendorBalanceLabel } from "./vendor.model";

export type PaymentMethod = "CASH" | "BANK";
export type PaymentDirection = "INCOMING" | "OUTGOING";

export interface RecordVendorPaymentInput {
  readonly direction: PaymentDirection;
  readonly amount: string;
  readonly method: PaymentMethod;
  readonly referenceNumber?: string | null;
  readonly description?: string | null;
  /** Required when a payment crosses zero (e.g. from owing vendor into an advance). */
  readonly allowZeroCross?: boolean;
}

export interface VendorPaymentRecord {
  readonly id: string;
  readonly vendorId: string;
  readonly storeId: string;
  readonly userId: string;
  readonly direction: PaymentDirection;
  readonly amount: string;
  readonly method: PaymentMethod;
  readonly referenceNumber: string | null;
  readonly description: string | null;
  readonly allowZeroCross: boolean;
  readonly createdAt: string;
}

const MAX_MONEY = 999999999999999999n;

export function parsePaymentAmount(value: string): string {
  if (
    typeof value !== "string" ||
    !/^\d{1,16}(\.\d{1,2})?$/.test(value.trim())
  ) {
    throw new VendorValidationError(
      "Enter a positive amount with at most 16 whole digits and 2 decimal places.",
    );
  }
  const amount = toScaled(value, 2);
  if (amount <= 0n || amount > MAX_MONEY) {
    throw new VendorValidationError(
      "Payment amount must be greater than zero and within the supported range.",
    );
  }
  return fromScaled(amount, 2);
}

/**
 * Calculates the resulting vendor balance after a settlement:
 * - OUTGOING (Paying vendor): DEBIT effect -> balance += amount
 * - INCOMING (Refund / Advance return from vendor): CREDIT effect -> balance -= amount
 */
export function balanceAfterVendorPayment(
  currentBalance: string,
  amount: string,
  direction: PaymentDirection,
): string {
  const current = toScaled(currentBalance, 2);
  const delta = toScaled(parsePaymentAmount(amount), 2);
  const result = direction === "OUTGOING" ? current + delta : current - delta;

  if (result < -MAX_MONEY || result > MAX_MONEY) {
    throw new VendorValidationError(
      "Resulting vendor balance is out of range.",
    );
  }
  return fromScaled(result, 2);
}

/**
 * Returns whether a payment causes the balance to cross zero.
 * (e.g. was owing the vendor, now vendor has an advance; or vice-versa)
 */
export function doesPaymentCrossZero(
  currentBalance: string,
  resultingBalance: string,
): boolean {
  const current = toScaled(currentBalance, 2);
  const result = toScaled(resultingBalance, 2);

  // Crossing zero means strictly changing signs (from negative to positive, or positive to negative)
  return (current < 0n && result > 0n) || (current > 0n && result < 0n);
}

export interface VendorPaymentPreview {
  readonly balance: string;
  readonly label: string;
  readonly crossesZero: boolean;
  readonly zeroCrossWarning?: string;
}

export function previewVendorPayment(
  currentBalance: string,
  amount: string,
  direction: PaymentDirection,
): VendorPaymentPreview {
  const balance = balanceAfterVendorPayment(currentBalance, amount, direction);
  const crossesZero = doesPaymentCrossZero(currentBalance, balance);
  let zeroCrossWarning: string | undefined;

  if (crossesZero) {
    if (direction === "OUTGOING") {
      zeroCrossWarning =
        "This payment exceeds the amount owed to the vendor and creates a vendor advance (vendor will owe you).";
    } else {
      zeroCrossWarning =
        "This refund exceeds the vendor's advance balance and creates an outstanding debt owed to the vendor.";
    }
  }

  return {
    balance,
    label: vendorBalanceLabel(balance),
    crossesZero,
    zeroCrossWarning,
  };
}

