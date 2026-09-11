import { column, Schema, Table } from '@powersync/common';

// Mirrors the backend `Products` entity (see
// backend/src/main/java/com/sastapos/sasta_pos/product/Product.java).
const products = new Table({
  name: column.text,
  sku: column.text,
  barcode: column.text,
  description: column.text,
  selling_price: column.real,
  tax_rate: column.real,
  stock_quantity: column.real,
  status: column.text,
  units_of_measure_id: column.text,
  tax_category_id: column.text
});

// Mirrors the backend `Sale` entity.
const sales = new Table({
  invoice_number: column.text,
  subtotal: column.real,
  discount_amount: column.real,
  taxable_amount: column.real,
  tax_amount: column.real,
  total_amount: column.real,
  currency_code: column.text,
  status: column.text,
  sold_at: column.text,
  user_id: column.text,
  store_id: column.text
});

// Mirrors the backend `SaleItem` entity.
const saleItems = new Table(
  {
    sale_id: column.text,
    product_id: column.text,
    product_name: column.text,
    sku: column.text,
    quantity: column.real,
    unit_price: column.real,
    tax_rate: column.real,
    tax_inclusive: column.integer,
    taxable_amount: column.real,
    line_total: column.real
  },
  { indexes: { sale: ['sale_id'], product: ['product_id'] } }
);

// Add more tables here as Sync Streams are defined in powersync/sync-config.yaml.
export const AppSchema = new Schema({
  products,
  sales,
  sale_items: saleItems
});

export type Database = (typeof AppSchema)['types'];
export type ProductRecord = Database['products'];
export type SaleRecord = Database['sales'];
export type SaleItemRecord = Database['sale_items'];
