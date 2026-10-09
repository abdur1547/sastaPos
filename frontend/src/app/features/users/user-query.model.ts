import { User } from "./user.model";

export type UserRoleFilter = "ALL" | "OWNER" | "CASHIER";
export type UserSortField = "name" | "email" | "lastLoginAt";
export type SortDirection = "asc" | "desc";

export interface UserFilters {
  readonly search: string;
  readonly role: UserRoleFilter;
  readonly sortField: UserSortField;
  readonly sortDirection: SortDirection;
}

export const DEFAULT_USER_FILTERS: UserFilters = {
  search: "",
  role: "ALL",
  sortField: "name",
  sortDirection: "asc",
};

export const DEFAULT_PAGE_SIZE = 25;
export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

export type UserListItem = User;

export interface UserPage {
  readonly items: readonly UserListItem[];
  readonly total: number;
}

export interface UserPageRequest {
  readonly pageIndex: number;
  readonly pageSize: number;
}
