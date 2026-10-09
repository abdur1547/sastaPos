import { ProductStatus } from "../../product.model";

export interface ProductFormValue {
  readonly name: string;
  readonly sku: string;
  readonly barcode: string;
  readonly pctCode: string;
  readonly description: string;
  readonly unitPrice: string;
  readonly stockQuantity: string;
  readonly unitsOfMeasureId: string;
  readonly taxCategoryIds: readonly string[];
  readonly status: ProductStatus;
}
