import { ProductStatus } from "./product.model";

export interface CreateProductInput {
  readonly name: string;
  readonly sku?: string | null;
  readonly barcode?: string | null;
  readonly pctCode: string;
  readonly description?: string | null;
  readonly unitPrice: string;
  readonly stockQuantity?: string;
  readonly unitsOfMeasureId: string;
  readonly taxCategoryIds?: readonly string[];
}

/** Stock changes are handled by stock movements and cannot be edited here. */
export interface UpdateProductInput {
  readonly name?: string;
  readonly sku?: string | null;
  readonly barcode?: string | null;
  readonly pctCode?: string;
  readonly description?: string | null;
  readonly unitPrice?: string;
  readonly status?: ProductStatus;
  readonly unitsOfMeasureId?: string;
  readonly taxCategoryIds?: readonly string[];
}
