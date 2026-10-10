export type StoreStatus = "ACTIVE" | "INACTIVE";

export interface Store {
  readonly id: string;
  readonly name: string;
  readonly ntn: string;
  readonly address: string | null;
  readonly currencyCode: string;
  readonly timezone: string;
  readonly status: StoreStatus;
  readonly storeSettingsId: string;
  readonly dateCreated: string;
  readonly lastUpdated: string;
}

/** Stored in business_settings and linked by stores.store_settings_id. */
export interface BusinessSettings {
  readonly id: string;
  readonly invoicePrefix: string;
  readonly invoiceNumberStart: number;
  readonly nextInvoiceNumber: number;
  readonly receiptFooter: string;
  readonly dateCreated: string;
  readonly lastUpdated: string;
}
