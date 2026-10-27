import {
  LedgerDatePreset,
  LedgerDateRange,
  LedgerDirection,
  LedgerEntryType,
  LedgerPageRequest,
  LedgerSort,
  LedgerSortDirection,
  LedgerSortField,
  LedgerStatusFilter,
  ledgerTypeLabel,
} from "../customers/customer-ledger.model";

export {
  LedgerDatePreset,
  LedgerDateRange,
  LedgerDirection,
  LedgerEntryType,
  LedgerPageRequest,
  LedgerSort,
  LedgerSortDirection,
  LedgerSortField,
  LedgerStatusFilter,
  ledgerTypeLabel,
};

export const VENDOR_LEDGER_TYPES: readonly LedgerEntryType[] = [
  "PURCHASE",
  "PAYMENT",
  "PURCHASE_RETURN",
  "ADJUSTMENT",
];

export interface VendorLedgerFilters {
  /** Reference number, description or amount. */
  readonly search: string;
  readonly datePreset: LedgerDatePreset;
  /** Inclusive local calendar dates (`YYYY-MM-DD`), used when `datePreset` is `custom`. */
  readonly customFrom: string;
  readonly customTo: string;
  readonly type: LedgerEntryType | "ALL";
  readonly direction: LedgerDirection | "ALL";
  readonly status: LedgerStatusFilter;
}

export const DEFAULT_VENDOR_LEDGER_FILTERS: VendorLedgerFilters = {
  search: "",
  datePreset: "all",
  customFrom: "",
  customTo: "",
  type: "ALL",
  direction: "ALL",
  status: "ALL",
};

export interface VendorLedgerEntry {
  readonly id: string;
  readonly occurredAt: Date;
  readonly direction: LedgerDirection;
  readonly type: string;
  readonly amount: string;
  readonly referenceNumber: string | null;
  readonly description: string | null;
  readonly voided: boolean;
  readonly voidReason: string | null;
  readonly paymentId: string | null;
  readonly reversalOfEntryId: string | null;
  /** Account balance right after this entry in posting order. */
  readonly balanceAfter: string;
}

export interface VendorLedgerPage {
  readonly items: readonly VendorLedgerEntry[];
  readonly total: number;
  readonly totalDebit: string;
  readonly totalCredit: string;
}

export const EMPTY_VENDOR_LEDGER_PAGE: VendorLedgerPage = {
  items: [],
  total: 0,
  totalDebit: "0.00",
  totalCredit: "0.00",
};

export interface VendorLedgerSummary {
  readonly currentBalance: string;
  readonly openingBalance: string;
  readonly closingBalance: string;
  readonly debitTotal: string;
  readonly creditTotal: string;
}

