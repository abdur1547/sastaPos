import { BalanceState, TaxRegistrationStatus, Vendor } from "./vendor.model";

export type VendorStatusFilter = "ACTIVE" | "INACTIVE" | "ALL";
export type BalanceStateFilter = "ALL" | BalanceState;
export type TaxRegistrationFilter = "ALL" | TaxRegistrationStatus;
export type VendorSortField = "name" | "accountBalance" | "lastUpdated";
export type SortDirection = "asc" | "desc";

export interface VendorFilters {
  readonly search: string;
  readonly status: VendorStatusFilter;
  readonly salesTaxRegistrationStatus: TaxRegistrationFilter;
  readonly balanceState: BalanceStateFilter;
  readonly minBalance?: string | null;
  readonly maxBalance?: string | null;
  readonly sortField: VendorSortField;
  readonly sortDirection: SortDirection;
}

export const DEFAULT_VENDOR_FILTERS: VendorFilters = {
  search: "",
  status: "ACTIVE",
  salesTaxRegistrationStatus: "ALL",
  balanceState: "ALL",
  minBalance: null,
  maxBalance: null,
  sortField: "name",
  sortDirection: "asc",
};

export const DEFAULT_PAGE_SIZE = 25;
export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

export type VendorListItem = Vendor;

export interface VendorPage {
  readonly items: readonly VendorListItem[];
  readonly total: number;
}

export interface VendorPageRequest {
  readonly pageIndex: number;
  readonly pageSize: number;
}

