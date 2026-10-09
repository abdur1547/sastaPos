export type CustomerStatus = "ACTIVE" | "INACTIVE";

/**
 * Locally stored customer data. The balance is a signed decimal string to
 * preserve the backend's precision: positive means the customer owes the
 * store, negative means the store owes the customer. It is maintained by sales
 * and ledger entries and is never edited directly.
 */
export interface Customer {
  readonly id: string;
  readonly name: string;
  readonly phoneNumber: string | null;
  readonly ntn: string | null;
  readonly accountBalance: string;
  readonly status: CustomerStatus;
  readonly storeId: string;
  readonly dateCreated: string;
  readonly lastUpdated: string;
}
