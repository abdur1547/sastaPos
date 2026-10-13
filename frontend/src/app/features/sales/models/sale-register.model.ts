export type SaleStatus = "IN_PROGRESS" | "COMPLETED" | "VOIDED";
export type SaleType = "DEBIT" | "CREDIT";
export type PaymentMethod = "CASH" | "BANK" | "CREDIT";
export type SortDirection = "asc" | "desc";

/** Drafts are bills in progress, not register entries, so they are never listed here. */
export type RegisterStatusFilter = "POSTED" | "COMPLETED" | "VOIDED";
export type DatePreset =
  | "today"
  | "yesterday"
  | "last7"
  | "thisMonth"
  | "lastMonth"
  | "all"
  | "custom";

export interface SaleRegisterFilters {
  /** Invoice number, customer name or customer phone. */
  readonly search: string;
  readonly status: RegisterStatusFilter;
  readonly datePreset: DatePreset;
  /** Inclusive local calendar dates (`YYYY-MM-DD`), used when `datePreset` is `custom`. */
  readonly customFrom: string;
  readonly customTo: string;
  readonly saleType: SaleType | "ALL";
  readonly paymentMethod: "CASH" | "BANK" | "ALL";
  /** Empty string means every cashier. */
  readonly cashierId: string;
  /** Only sales with money still owed (remaining > 0). */
  readonly outstandingOnly: boolean;
}

export const DEFAULT_SALE_REGISTER_FILTERS: SaleRegisterFilters = {
  search: "",
  status: "POSTED",
  datePreset: "today",
  customFrom: "",
  customTo: "",
  saleType: "ALL",
  paymentMethod: "ALL",
  cashierId: "",
  outstandingOnly: false,
};

export type SaleSortField =
  | "soldAt"
  | "invoiceNumber"
  | "totalAmount"
  | "remaining";

export interface SaleSort {
  readonly field: SaleSortField;
  readonly direction: SortDirection;
}

export const DEFAULT_SALE_SORT: SaleSort = {
  field: "soldAt",
  direction: "desc",
};

export const DEFAULT_PAGE_SIZE = 25;
export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

export interface SalePageRequest {
  readonly pageIndex: number;
  readonly pageSize: number;
}

export interface SaleListItem {
  readonly id: string;
  readonly invoiceNumber: string;
  readonly soldAt: Date;
  readonly status: SaleStatus;
  readonly saleType: SaleType;
  readonly customer: { readonly id: string; readonly name: string } | null;
  readonly cashierName: string | null;
  readonly itemCount: number;
  readonly totalAmount: string;
  readonly totalPaid: string;
  readonly remaining: string;
  readonly paymentMethods: readonly PaymentMethod[];
}

export interface SalePage {
  readonly items: readonly SaleListItem[];
  readonly total: number;
}

/** Money totals cover COMPLETED sales; voids are reported separately (mirrors GET /api/sales/summary). */
export interface SaleRegisterSummary {
  readonly saleCount: number;
  readonly netSales: string;
  readonly collected: string;
  readonly outstanding: string;
  readonly averageSale: string;
  readonly voidedCount: number;
  readonly voidedAmount: string;
}

export const EMPTY_SALE_SUMMARY: SaleRegisterSummary = {
  saleCount: 0,
  netSales: "0.00",
  collected: "0.00",
  outstanding: "0.00",
  averageSale: "0.00",
  voidedCount: 0,
  voidedAmount: "0.00",
};

export interface CashierOption {
  readonly id: string;
  readonly name: string;
}

/** Resolved UTC `[from, to)` bounds in SQLite `datetime()` format; null means unbounded. */
export interface SoldAtRange {
  readonly from: string | null;
  readonly to: string | null;
}
