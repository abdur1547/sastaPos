import { AuthenticatedUser } from "../../core/auth/auth.model";

/** Contracts from the backend Store OpenAPI schemas. */
export type StoreStatus = "ACTIVE" | "INACTIVE";

export interface StoreSettings {
  readonly id: string;
  readonly invoicePrefix: string | null;
  readonly invoiceNumberStart: number;
  readonly nextInvoiceNumber: number;
  readonly receiptFooter: string | null;
}

export interface Store {
  readonly id: string;
  readonly name: string;
  readonly ntn: string;
  readonly address: string | null;
  readonly currencyCode: string | null;
  readonly timezone: string | null;
  readonly status: StoreStatus;
  readonly storeSettings: StoreSettings;
}

export interface UpdateStoreRequest {
  readonly name?: string;
  readonly ntn?: string;
  readonly address?: string;
  readonly currencyCode?: string;
  readonly timezone?: string;
  readonly status?: StoreStatus;
}

export interface CreateStoreRequest {
  readonly name: string;
  readonly ntn: string;
  readonly address?: string;
  readonly currencyCode?: string;
  readonly timezone?: string;
}

export interface CreateStoreResponse {
  readonly store: Store;
  readonly user: AuthenticatedUser;
  readonly accessToken?: string;
  readonly expiresIn?: number;
}

export interface UpdateStoreSettingsRequest {
  readonly invoicePrefix?: string;
  readonly invoiceNumberStart?: number;
  readonly receiptFooter?: string;
}
