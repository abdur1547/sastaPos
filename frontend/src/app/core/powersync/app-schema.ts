import { column, Schema, Table } from '@powersync/common';

// Mirrors the operational tables in powersync/sync-config.yaml.
const stores = new Table({
  name: column.text,
  ntn: column.text,
  address: column.text,
  currency_code: column.text,
  timezone: column.text,
  status: column.text,
  store_settings_id: column.text,
  date_created: column.text,
  last_updated: column.text,
});

const users = new Table(
  {
    name: column.text,
    email: column.text,
    role: column.text,
    status: column.text,
    last_login_at: column.text,
    store_id: column.text,
    date_created: column.text,
    last_updated: column.text,
  },
  {
    indexes: {
      users_store: ['store_id'],
    },
  },
);

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

const posInfo = new Table({
  pos_id: column.text,
  pos_name: column.text,
  registration_number: column.text,
  software_name: column.text,
  software_version: column.text,
  vendor_name: column.text,
  vendor_ntn: column.text,
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
  effective_from: column.text,
  effective_to: column.text,
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

const stockMovements = new Table(
  {
    type: column.text,
    quantity: column.text,
    quantity_before: column.text,
    quantity_after: column.text,
    description: column.text,
    product_id: column.text,
    sale_id: column.text,
    sale_item_id: column.text,
    store_id: column.text,
    date_created: column.text,
    last_updated: column.text,
  },
  {
    indexes: {
      stock_movements_product: ['product_id'],
      stock_movements_store: ['store_id'],
      stock_movements_sale: ['sale_id'],
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

const vendors = new Table(
  {
    name: column.text,
    phone_number: column.text,
    ntn: column.text,
    strn: column.text,
    sales_tax_registration_status: column.text,
    address: column.text,
    account_balance: column.text,
    status: column.text,
    store_id: column.text,
    date_created: column.text,
    last_updated: column.text,
  },
  {
    indexes: {
      vendors_store_name: ['store_id', 'name'],
      vendors_store_phone: ['store_id', 'phone_number'],
    },
  },
);

const vendorUniqueKeys = new Table(
  {
    vendor_id: column.text,
    store_id: column.text,
    key_type: column.text,
    normalized_value: column.text,
  },
  {
    localOnly: true,
    indexes: {
      vendor_unique_keys_vendor: ['vendor_id'],
    },
  },
);

// Money and quantities are NUMERIC(18,2) on the backend, so they are stored as
// decimal text to avoid floating-point loss.
const sales = new Table(
  {
    invoice_number: column.text,
    sale_type: column.text,
    subtotal: column.text,
    discount_amount: column.text,
    taxable_amount: column.text,
    tax_amount: column.text,
    total_amount: column.text,
    currency_code: column.text,
    sold_at: column.text,
    status: column.text,
    total_paid: column.text,
    remaining: column.text,
    description: column.text,
    void_reason: column.text,
    voided_at: column.text,
    voided_by: column.text,
    customer_id: column.text,
    user_id: column.text,
    store_id: column.text,
    date_created: column.text,
    last_updated: column.text,
  },
  {
    indexes: {
      sales_store_sold_at: ['store_id', 'sold_at'],
      sales_store_status: ['store_id', 'status'],
      sales_customer: ['customer_id'],
    },
  },
);

const saleItems = new Table(
  {
    product_name: column.text,
    sku: column.text,
    quantity: column.text,
    unit_price: column.text,
    tax_rate: column.text,
    taxable_amount: column.text,
    line_total: column.text,
    sale_id: column.text,
    product_id: column.text,
    date_created: column.text,
    last_updated: column.text,
  },
  {
    indexes: {
      sale_items_sale: ['sale_id'],
      sale_items_product: ['product_id'],
    },
  },
);

const payments = new Table(
  {
    direction: column.text,
    amount: column.text,
    method: column.text,
    reference_number: column.text,
    description: column.text,
    voided: column.integer,
    void_reason: column.text,
    voided_at: column.text,
    voided_by: column.text,
    sale_id: column.text,
    customer_id: column.text,
    vendor_id: column.text,
    store_id: column.text,
    user_id: column.text,
    date_created: column.text,
    last_updated: column.text,
  },
  {
    indexes: {
      payments_sale: ['sale_id'],
      payments_customer: ['customer_id'],
      payments_vendor: ['vendor_id'],
    },
  },
);

const ledgerEntries = new Table(
  {
    direction: column.text,
    amount: column.text,
    type: column.text,
    reference_number: column.text,
    description: column.text,
    voided: column.integer,
    void_reason: column.text,
    voided_at: column.text,
    voided_by: column.text,
    customer_id: column.text,
    vendor_id: column.text,
    reversal_of_entry_id: column.text,
    sale_id: column.text,
    payment_id: column.text,
    store_id: column.text,
    user_id: column.text,
    date_created: column.text,
    last_updated: column.text,
  },
  {
    indexes: {
      ledger_entries_customer: ['customer_id'],
      ledger_entries_vendor: ['vendor_id'],
      ledger_entries_reversal_of: ['reversal_of_entry_id'],
    },
  },
);

// The backend's store settings table; only the signed-in store's row is synced.
const businessSettings = new Table({
  invoice_prefix: column.text,
  invoice_number_start: column.integer,
  next_invoice_number: column.integer,
  receipt_footer: column.text,
  date_created: column.text,
  last_updated: column.text,
});

export const AppSchema = new Schema({
  stores,
  users,
  products,
  units_of_measures: unitsOfMeasures,
  pos_info: posInfo,
  tax_categories: taxCategories,
  product_tax_categories: productTaxCategories,
  product_unique_keys: productUniqueKeys,
  stock_movements: stockMovements,
  customers,
  customer_unique_keys: customerUniqueKeys,
  vendors,
  vendor_unique_keys: vendorUniqueKeys,
  sales,
  sale_items: saleItems,
  payments,
  ledger_entries: ledgerEntries,
  business_settings: businessSettings,
});

export type Database = (typeof AppSchema)['types'];
export type StoreRecord = Database['stores'];
export type UserRecord = Database['users'];
export type BusinessSettingsRecord = Database['business_settings'];
export type ProductRecord = Database['products'];
export type UnitOfMeasureRecord = Database['units_of_measures'];
export type PosInfoRecord = Database['pos_info'];
export type TaxCategoryRecord = Database['tax_categories'];
export type ProductTaxCategoryRecord = Database['product_tax_categories'];
export type StockMovementRecord = Database['stock_movements'];
export type CustomerRecord = Database['customers'];
export type VendorRecord = Database['vendors'];
export type SaleRecord = Database['sales'];
export type SaleItemRecord = Database['sale_items'];
export type PaymentRecord = Database['payments'];
export type LedgerEntryRecord = Database['ledger_entries'];
