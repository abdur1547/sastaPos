import { fromScaled, toScaled } from "../../shared/utils/decimal";
import { CustomerValidationError } from "./customer.errors";

export interface CustomerPaymentInput {
  readonly amount: string;
  readonly method: "CASH" | "BANK";
  readonly referenceNumber?: string | null;
  readonly description?: string | null;
  readonly allowCredit?: boolean;
}

export interface CustomerPaymentRecord {
  readonly id: string;
  readonly customerId: string;
  readonly storeId: string;
  readonly userId: string;
  readonly amount: string;
  readonly method: "CASH" | "BANK";
  readonly referenceNumber: string | null;
  readonly description: string | null;
  readonly allowCredit: boolean;
  readonly createdAt: string;
}

const MAX_MONEY = 999999999999999999n;

export function paymentAmount(value: string): string {
  if (
    typeof value !== "string" ||
    !/^\d{1,16}(\.\d{1,2})?$/.test(value.trim())
  ) {
    throw new CustomerValidationError(
      "Enter a positive amount with at most 16 whole digits and 2 decimal places.",
    );
  }
  const amount = toScaled(value, 2);
  if (amount <= 0n || amount > MAX_MONEY) {
    throw new CustomerValidationError(
      "Payment amount must be greater than zero and within the supported range.",
    );
  }
  return fromScaled(amount, 2);
}

export function balanceAfterPayment(balance: string, amount: string): string {
  const result = toScaled(balance, 2) - toScaled(paymentAmount(amount), 2);
  if (result < -MAX_MONEY || result > MAX_MONEY) {
    throw new CustomerValidationError(
      "Resulting account balance is out of range.",
    );
  }
  return fromScaled(result, 2);
}

export function customerBalanceLabel(balance: string): string {
  const amount = toScaled(balance, 2);
  if (amount === 0n) return "Settled";
  return amount > 0n
    ? `Customer owes you Rs ${fromScaled(amount, 2)}`
    : `Customer has Rs ${fromScaled(-amount, 2)} credit`;
}
