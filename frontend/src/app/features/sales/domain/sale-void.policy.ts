import { UserRole } from "../../../core/auth/auth.model";
import { SaleStatus } from "../models/sale-register.model";
import { isSameLocalDay } from "./sale-date-range";

export const VOID_REASON_MAX_LENGTH = 1000;

export interface VoidableSale {
  readonly status: SaleStatus;
  readonly cashierId: string;
  readonly soldAt: Date;
}

export interface VoidActor {
  readonly id: string;
  readonly role: UserRole;
}

export type VoidDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: string };

/**
 * Who may void a sale (use case 5b, mirrors SaleService#voidSale): the owner always; a cashier only
 * their own sale, on the day it was made. Only completed sales are voidable.
 */
export function evaluateVoid(
  sale: VoidableSale,
  actor: VoidActor,
  now: Date = new Date(),
): VoidDecision {
  if (sale.status === "VOIDED") {
    return { allowed: false, reason: "This sale is already voided." };
  }
  if (sale.status !== "COMPLETED") {
    return { allowed: false, reason: "Only completed sales can be voided." };
  }
  if (actor.role === "OWNER") {
    return { allowed: true };
  }
  if (sale.cashierId !== actor.id) {
    return {
      allowed: false,
      reason: "Cashiers can only void their own sales. Ask the owner to void it.",
    };
  }
  if (!isSameLocalDay(sale.soldAt, now)) {
    return {
      allowed: false,
      reason: "Cashiers can only void sales made today. Ask the owner to void it.",
    };
  }
  return { allowed: true };
}

/** Returns the trimmed reason or an error message. */
export function validateVoidReason(
  reason: string,
): { readonly ok: true; readonly value: string } | { readonly ok: false; readonly message: string } {
  const value = reason.trim();
  if (!value) {
    return { ok: false, message: "A reason is required to void a sale." };
  }
  if (value.length > VOID_REASON_MAX_LENGTH) {
    return {
      ok: false,
      message: `The reason must be at most ${VOID_REASON_MAX_LENGTH} characters.`,
    };
  }
  return { ok: true, value };
}
