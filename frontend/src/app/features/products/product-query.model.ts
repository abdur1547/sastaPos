import { Product } from "./product.model";

export type ProductStatusFilter = "ACTIVE" | "INACTIVE" | "ALL";
export type StockOperator = "ANY" | "LTE" | "GTE" | "EQ";
export type ProductSortField =
  | "name"
  | "unitPrice"
  | "stockQuantity"
  | "lastUpdated";
export type SortDirection = "asc" | "desc";

export interface ProductFilters {
  readonly search: string;
  readonly status: ProductStatusFilter;
  readonly stockOperator: StockOperator;
  /** Decimal text; only used when stockOperator is not ANY. */
  readonly stockValue: string;
  readonly minPrice: string;
  readonly maxPrice: string;
  readonly unitsOfMeasureId: string;
  readonly sortField: ProductSortField;
  readonly sortDirection: SortDirection;
}

export const DEFAULT_PRODUCT_FILTERS: ProductFilters = {
  search: "",
  status: "ACTIVE",
  stockOperator: "ANY",
  stockValue: "",
  minPrice: "",
  maxPrice: "",
  unitsOfMeasureId: "",
  sortField: "name",
  sortDirection: "asc",
};

export const DEFAULT_PAGE_SIZE = 25;
export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

/** Product row for list views; tax categories are only loaded for a single product. */
export type ProductListItem = Omit<Product, "taxCategoryIds"> & {
  readonly unitsOfMeasureName: string | null;
};

export interface ProductPage {
  readonly items: readonly ProductListItem[];
  readonly total: number;
}

export interface ProductPageRequest {
  readonly pageIndex: number;
  readonly pageSize: number;
}
