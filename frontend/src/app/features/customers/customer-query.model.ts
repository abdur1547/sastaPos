import { Customer } from "./customer.model";

export type CustomerStatusFilter = "ACTIVE" | "INACTIVE" | "ALL";
export type BalanceFilter = "ANY" | "OWES" | "CREDIT" | "SETTLED";
export type CustomerSortField = "name" | "accountBalance" | "lastUpdated";
export type SortDirection = "asc" | "desc";

export interface CustomerFilters {
  readonly search: string;
  readonly status: CustomerStatusFilter;
  /** OWES: customer owes the store; CREDIT: the store owes the customer. */
  readonly balance: BalanceFilter;
  readonly sortField: CustomerSortField;
  readonly sortDirection: SortDirection;
}

export const DEFAULT_CUSTOMER_FILTERS: CustomerFilters = {
  search: "",
  status: "ACTIVE",
  balance: "ANY",
  sortField: "name",
  sortDirection: "asc",
};

export const DEFAULT_PAGE_SIZE = 25;
export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

export type CustomerListItem = Customer;

export interface CustomerPage {
  readonly items: readonly CustomerListItem[];
  readonly total: number;
}

export interface CustomerPageRequest {
  readonly pageIndex: number;
  readonly pageSize: number;
}
