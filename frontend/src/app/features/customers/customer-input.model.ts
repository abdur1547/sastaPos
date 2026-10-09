import { CustomerStatus } from "./customer.model";

export interface CreateCustomerInput {
  readonly name: string;
  readonly phoneNumber?: string | null;
  readonly ntn?: string | null;
}

/** The balance changes through sales and ledger entries and cannot be edited here. */
export interface UpdateCustomerInput {
  readonly name?: string;
  readonly phoneNumber?: string | null;
  readonly ntn?: string | null;
  readonly status?: CustomerStatus;
}
