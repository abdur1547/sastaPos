import { TaxRegistrationStatus, VendorStatus } from "./vendor.model";

export interface CreateVendorInput {
  readonly name: string;
  readonly phoneNumber?: string | null;
  readonly ntn?: string | null;
  readonly strn?: string | null;
  readonly salesTaxRegistrationStatus?: TaxRegistrationStatus;
  readonly address?: string | null;
}

/** The balance changes through purchases and ledger settlements and cannot be edited directly. */
export interface UpdateVendorInput {
  readonly name?: string;
  readonly phoneNumber?: string | null;
  readonly ntn?: string | null;
  readonly strn?: string | null;
  readonly salesTaxRegistrationStatus?: TaxRegistrationStatus;
  readonly address?: string | null;
  readonly status?: VendorStatus;
}

