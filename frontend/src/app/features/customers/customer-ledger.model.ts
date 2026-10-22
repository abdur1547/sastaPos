import { DatePreset } from "../sales/models/sale-register.model";

export type LedgerDirection = "DEBIT" | "CREDIT";
export type LedgerEntryType =
  | "SALE"
  | "PAYMENT"
  | "SALE_RETURN"
  | "ADJUSTMENT"
  | "PURCHASE"
  | "PURCHASE_RETURN";
export type LedgerStatusFilter = "ALL" | "ACTIVE" | "VOIDED";
export type LedgerSortDirection = "asc" | "desc";
export type LedgerDatePreset = DatePreset;

/** Types a customer account can carry; purchase types belong to vendor ledgers. */
export const CUSTOMER_LEDGER_TYPES: readonly LedgerEntryType[] = [
  "SALE",
  "PAYMENT",
  "SALE_RETURN",
  "ADJUSTMENT",
];

export const LEDGER_TYPE_LABELS: Record<LedgerEntryType, string> = {
  SALE: "Sale",
  PAYMENT: "Payment",
  SALE_RETURN: "Sale return",
  ADJUSTMENT: "Adjustment",
  PURCHASE: "Purchase",
  PURCHASE_RETURN: "Purchase return",
};

export const LEDGER_DATE_PRESET_LABELS: Record<LedgerDatePreset, string> = {
  all: "All time",
  today: "Today",
  yesterday: "Yesterday",
  last7: "Last 7 days",
  thisMonth: "This month",
  lastMonth: "Last month",
  custom: "Custom range",
};

export interface CustomerLedgerFilters {
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

export const DEFAULT_LEDGER_FILTERS: CustomerLedgerFilters = {
  search: "",
  datePreset: "all",
  customFrom: "",
  customTo: "",
  type: "ALL",
  direction: "ALL",
  status: "ALL",
};

export type LedgerSortField =
  | "occurredAt"
  | "type"
  | "referenceNumber"
  | "description"
  | "debit"
  | "credit"
  | "balance";

export interface LedgerSort {
  readonly field: LedgerSortField;
  readonly direction: LedgerSortDirection;
}

export const DEFAULT_LEDGER_SORT: LedgerSort = {
  field: "occurredAt",
  direction: "desc",
};

export const DEFAULT_LEDGER_PAGE_SIZE = 25;
export const LEDGER_PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

export interface LedgerPageRequest {
  readonly pageIndex: number;
  readonly pageSize: number;
}

/** Resolved UTC `[from, to)` bounds in SQLite `datetime()` format; null means unbounded. */
export interface LedgerDateRange {
  readonly from: string | null;
  readonly to: string | null;
}

export interface CustomerLedgerEntry {
  readonly id: string;
  readonly occurredAt: Date;
  readonly direction: LedgerDirection;
  /** Kept as text so legacy or future types still render instead of failing the page. */
  readonly type: string;
  readonly amount: string;
  readonly referenceNumber: string | null;
  readonly description: string | null;
  readonly voided: boolean;
  readonly voidReason: string | null;
  readonly saleId: string | null;
  /**
   * Account balance right after this entry, over the customer's full history in posting order.
   * Voided originals stay in the sum because their reversing entries restore the balance.
   */
  readonly balanceAfter: string;
}

export interface CustomerLedgerPage {
  readonly items: readonly CustomerLedgerEntry[];
  readonly total: number;
  /** Totals across every entry matching the filters, not just the visible page. */
  readonly totalDebit: string;
  readonly totalCredit: string;
}

export const EMPTY_LEDGER_PAGE: CustomerLedgerPage = {
  items: [],
  total: 0,
  totalDebit: "0.00",
  totalCredit: "0.00",
};

export function ledgerTypeLabel(type: string): string {
  return LEDGER_TYPE_LABELS[type as LedgerEntryType] ?? type.replace(/_/g, " ").toLowerCase();
}
