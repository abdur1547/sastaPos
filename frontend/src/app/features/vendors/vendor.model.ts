import { fromScaled, toScaled } from "../../shared/utils/decimal";
import { vendorBalanceInWords } from "../../shared/utils/number-to-words";

export type VendorStatus = "ACTIVE" | "INACTIVE";
export type TaxRegistrationStatus = "REGISTERED" | "UNREGISTERED";
export type BalanceState = "PARTY_OWES_STORE" | "STORE_OWES_PARTY" | "SETTLED";

/**
 * Locally stored vendor data. The balance is a signed decimal string:
 * - positive (> 0): vendor owes the store (e.g. advance paid to vendor) -> PARTY_OWES_STORE
 * - negative (< 0): the store owes the vendor (e.g. unpaid purchases) -> STORE_OWES_PARTY
 * - zero (== 0): settled -> SETTLED
 */
export interface Vendor {
  readonly id: string;
  readonly name: string;
  readonly phoneNumber: string | null;
  readonly ntn: string | null;
  readonly strn: string | null;
  readonly salesTaxRegistrationStatus: TaxRegistrationStatus;
  readonly address: string | null;
  readonly accountBalance: string;
  readonly status: VendorStatus;
  readonly storeId: string;
  readonly dateCreated: string;
  readonly lastUpdated: string;
}

export function vendorBalanceState(balance: string): BalanceState {
  const scaled = toScaled(balance, 2);
  if (scaled > 0n) return "PARTY_OWES_STORE";
  if (scaled < 0n) return "STORE_OWES_PARTY";
  return "SETTLED";
}

export function vendorBalanceAmount(balance: string): string {
  const scaled = toScaled(balance, 2);
  const abs = scaled < 0n ? -scaled : scaled;
  return fromScaled(abs, 2);
}

export function vendorBalanceLabel(balance: string): string {
  const state = vendorBalanceState(balance);
  const amount = vendorBalanceAmount(balance);
  switch (state) {
    case "PARTY_OWES_STORE":
      return `Vendor owes you Rs ${amount} (Advance)`;
    case "STORE_OWES_PARTY":
      return `You owe vendor Rs ${amount}`;
    case "SETTLED":
      return "Settled";
  }
}

export function formatVendorBalanceWithWords(balance: string): {
  label: string;
  inWords: string;
  state: BalanceState;
  amount: string;
} {
  return {
    label: vendorBalanceLabel(balance),
    inWords: vendorBalanceInWords(balance),
    state: vendorBalanceState(balance),
    amount: vendorBalanceAmount(balance),
  };
}

