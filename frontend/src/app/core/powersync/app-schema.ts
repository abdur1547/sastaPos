import { column, Schema, Table } from '@powersync/common';

// Mirrors the "lists" and "todos" tables configured in the PowerSync Cloud
// sync streams for this project. Add new tables here as sync streams are added.
const lists = new Table({
  created_at: column.text,
  archived: column.integer,
});

const todos = new Table({
  created_at: column.text,
  name: column.text,
});

const products = new Table(
  {
    name: column.text,
    sku: column.text,
    barcode: column.text,
    pct_code: column.text,
    description: column.text,
    unit_price: column.text,
    stock_quantity: column.text,
    status: column.text,
    units_of_measure_id: column.text,
    store_id: column.text,
    date_created: column.text,
    last_updated: column.text,
  },
  {
    indexes: {
      products_store_name: ['store_id', 'name'],
      products_store_sku: ['store_id', 'sku'],
      products_store_barcode: ['store_id', 'barcode'],
      products_store_pct_code: ['store_id', 'pct_code'],
    },
  },
);

const unitsOfMeasures = new Table({
  name: column.text,
  code: column.text,
  allows_fraction: column.integer,
  is_active: column.integer,
  date_created: column.text,
  last_updated: column.text,
});

const taxCategories = new Table({
  name: column.text,
  code: column.text,
  rate: column.real,
  calculation_type: column.text,
  is_exempt: column.integer,
  is_active: column.integer,
  store_id: column.text,
  date_created: column.text,
  last_updated: column.text,
});

const productTaxCategories = new Table(
  {
    product_id: column.text,
    tax_category_id: column.text,
  },
  {
    localOnly: true,
    indexes: {
      product_tax_categories_product: ['product_id'],
    },
  },
);

// Primary-key IDs encode store, key kind, and a normalized value. This gives
// SQLite an atomic uniqueness constraint without scanning the product table.
const productUniqueKeys = new Table(
  {
    product_id: column.text,
    store_id: column.text,
    key_type: column.text,
    normalized_value: column.text,
  },
  {
    localOnly: true,
    indexes: {
      product_unique_keys_product: ['product_id'],
    },
  },
);

const productStockMovements = new Table(
  {
    type: column.text,
    quantity: column.text,
    quantity_before: column.text,
    quantity_after: column.text,
    description: column.text,
    product_id: column.text,
    store_id: column.text,
    date_created: column.text,
    last_updated: column.text,
  },
  {
    localOnly: true,
    indexes: {
      product_stock_movements_product: ['product_id'],
      product_stock_movements_store: ['store_id'],
    },
  },
);

const customers = new Table(
  {
    name: column.text,
    phone_number: column.text,
    ntn: column.text,
    account_balance: column.text,
    status: column.text,
    store_id: column.text,
    date_created: column.text,
    last_updated: column.text,
  },
  {
    indexes: {
      customers_store_name: ['store_id', 'name'],
      customers_store_phone: ['store_id', 'phone_number'],
    },
  },
);

// Same atomic-uniqueness approach as product_unique_keys: name per store and
// phone number, encoded in the primary-key ID.
const customerUniqueKeys = new Table(
  {
    customer_id: column.text,
    store_id: column.text,
    key_type: column.text,
    normalized_value: column.text,
  },
  {
    localOnly: true,
    indexes: {
      customer_unique_keys_customer: ['customer_id'],
    },
  },
);

export const AppSchema = new Schema({
  lists,
  todos,
  products,
  units_of_measures: unitsOfMeasures,
  tax_categories: taxCategories,
  product_tax_categories: productTaxCategories,
  product_unique_keys: productUniqueKeys,
  product_stock_movements: productStockMovements,
  customers,
  customer_unique_keys: customerUniqueKeys,
});

export type Database = (typeof AppSchema)['types'];
export type ListRecord = Database['lists'];
export type TodoRecord = Database['todos'];
