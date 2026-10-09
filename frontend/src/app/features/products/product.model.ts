export type ProductStatus = "ACTIVE" | "INACTIVE";

/**
 * Locally stored product data. BigDecimal values are represented as decimal
 * strings to preserve the backend's precision without SQLite floating-point loss.
 * Related sale and stock-movement collections remain owned by their features.
 */
export interface Product {
  readonly id: string;
  readonly name: string;
  readonly sku: string | null;
  readonly barcode: string | null;
  readonly pctCode: string;
  readonly description: string | null;
  readonly unitPrice: string;
  readonly stockQuantity: string;
  readonly status: ProductStatus;
  readonly unitsOfMeasureId: string;
  readonly taxCategoryIds: readonly string[];
  readonly storeId: string;
  readonly dateCreated: string;
  readonly lastUpdated: string;
}
