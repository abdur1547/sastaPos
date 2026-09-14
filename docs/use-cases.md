# Use cases:

## 1. Signup
- user send name, email, password to backend
- backend creates a user with name, email, password_hash from password, role defaults to CASHIER, status to ACTIVE, store_id will be null 
- backend creates JWT and sends back to user

## 2. Login
- user send email and password to backend
- backend confirms and if valid send back JWT else not authorized

## 3. Create store (require auth)
- user send name, ntn, address (everything else is set to default)
- backend create default store_setting
- backend creates a store wiht name, address, currencyCode = "PKR", timezone = "Asia/Karachi", status = ACTIVE, store_setting
- set store id to user i.e. user.store_id = store.id
- set user role to owner

## 4. Add Products to store
- user send name string (required), sku string optional, barCode string optional, pctCode string (required), description string optional, stockQuantity NUMERIC(18,2) optional, unit_of_measure required (it will be a drop down in UI)
- get store from logedin user
- backend creates a Product(name, sku, barCode, pctCode, description, stockQuantity, unit_of_measure, store)
- if stockQuantity > 0, backend creats a stock_movements with type = ADJUSTMENT_IN, product

## 5. Create sale (require auth)

### Request body
```json
{
  "sale_type": "DEBIT | CREDIT",
  "customer_id": "uuid, required for CREDIT, optional for DEBIT",
  "discount": "decimal, optional, default 0.0",
  "sale_items": [
    {
      "product_id": "uuid, required",
      "quantity": "decimal, must respect product.unit_of_measure.allowsFraction",
      "item_total": "decimal, client-computed, used only for validation"
    }
  ],
  "payments": [
    {
      "amount": "decimal, required",
      "method": "CASH | BANK, optional, default CASH (CREDIT method not allowed here, it is derived by backend)",
      "referenceNumber": "string, optional",
      "description": "string, optional"
    }
  ],
  "total_items": "integer, for validation",
  "total_price": "decimal, for validation",
  "total_paid_price": "decimal, for validation"
}
```

### Pre-conditions / lookups
- Resolve `store` from the authenticated user.
- Resolve `store_settings` for the store (for `defaultTaxInclusive`, `invoicePrefix`, `nextInvoiceNumber`).
- Resolve all `product`s referenced in `sale_items`, must belong to the same store, else 404/403.
- If `customer_id` present, resolve `customer`, must belong to the same store, else 404/403.

### Validations (reject whole request if any fails, no partial writes)
1. `sale_items` must not be empty; `sale_items.length == total_items`.
2. Every `product_id` in `sale_items` must exist and be unique (no duplicate product in same sale).
3. For each sale_item: `quantity > 0`; if `product.unit_of_measure.allowsFraction == false` then `quantity` must be a whole number.
4. For each sale_item: `product.currentUnitPrice * quantity == item_total` (rounded to 2 decimals, small epsilon allowed).
5. `sale_type == CREDIT` requires `customer_id` to be present; `sale_type == DEBIT` does not require it.
6. `discount >= 0` and `discount <= subtotal` (computed subtotal, see below).
7. `total_price == (sum of all sale_item.item_total) - discount` (i.e. matches backend-computed `taxableAmount` / `totalAmount`, see calculation section). Comparison done at 2-decimal precision (round both sides to 2 decimals before comparing).
8. `total_paid_price == sum of all payments.amount` (2-decimal precision).
9. If `sale_type == DEBIT`: `sum(payments.amount) == total_price` (fully paid, remaining must be 0), 2-decimal precision.
10. If `sale_type == CREDIT`: `sum(payments.amount) <= total_price` (partial or zero payment allowed, remainder goes to customer's ledger).
11. `payments.method` only accepts `CASH` or `BANK` from the client; backend never accepts `CREDIT` as an input method.
12. For each sale_item, stock check: `product.stockQuantity >= quantity`, else reject with insufficient-stock error (identify which product).

### Calculation (per sale_item, then aggregated to sale)
- Determine applicable tax rate for the product: sum of `rate` of all linked `tax_categories` (0 if product has none, i.e. tax free products just carry `taxRate = 0.0`).
- Taxes are always exclusive (added on top of price), there is no tax-inclusive pricing concept.
- `taxableAmount = unitPrice * quantity`, `taxAmount = taxableAmount * taxRate`, `lineTotal = taxableAmount + taxAmount`.
- Sale level aggregation:
  - `subtotal = sum(unitPrice * quantity)` across all sale_items (before tax, before discount).
  - `discountAmount = discount` from request.
  - `taxableAmount = subtotal - discountAmount` (discount reduces taxable base).
  - `taxAmount = sum(sale_item.taxAmount)`.
  - `totalAmount = taxableAmount + taxAmount`.
  - All monetary values rounded to 2 decimal places (`NUMERIC(18,2)`).

### Transactional write steps (all-or-nothing)
1. Generate `invoiceNumber` from `store_settings.invoicePrefix + store_settings.nextInvoiceNumber`; increment and persist `store_settings.nextInvoiceNumber`.
2. Create `Sale` row: `invoiceNumber`, `subtotal`, `discountAmount`, `taxableAmount`, `taxAmount`, `totalAmount`, `currencyCode = store.currencyCode`, `soldAt = now()`, `saleStatus = COMPLETED`, `totalPaid = sum(payments.amount)`, `remaining = totalAmount - totalPaid`, `customer` (nullable), `user = current logged in user`, `store`.
3. For each sale_item request entry:
   - Snapshot `productName`, `sku` from product at time of sale.
   - Compute and persist `SaleItem`: `quantity`, `unitPrice`, `taxRate`, `taxableAmount`, `lineTotal`, `product`, `sale`.
   - Create `StockMovement`: `type = SALE`, `quantity = quantity` (always stored positive; direction is derived from `type`: `SALE`/`ADJUSTMENT_OUT` decrease stock, `STOCK_IN`/`ADJUSTMENT_IN` increase stock), `quantityBefore = product.stockQuantity`, `quantityAfter = quantityBefore - quantity`, `description = "Sale <invoiceNumber>"`, `sale`, `sale_item`, `product`, `store`.
   - Update `product.stockQuantity = quantityAfter`.
4. For each payment request entry: create `Payment` row: `amount`, `method`, `referenceNumber`, `description`, `sale`.
5. If `customer` is present on the sale (both DEBIT and CREDIT):
   - Create `LedgerEntry`: `direction = DEBIT`, `type = SALE`, `amount = totalAmount`, `reference_number = invoiceNumber`, `customer`, `sale`. (Full sale amount always recorded as a debit against the customer, for a complete history.)
   - For each payment recorded in step 4: create `LedgerEntry`: `direction = CREDIT`, `type = PAYMENT`, `amount = payment.amount`, `reference_number = invoiceNumber`, `customer`, `sale = null` (per schema, PAYMENT entries don't link to a sale directly).
   - Update `customer.accountBalance += totalAmount - sum(payments.amount)` (net effect equals `remaining`; for a fully-paid DEBIT sale this nets to 0 but the ledger history is preserved).
6. Commit transaction; on any failure roll back everything (no partial stock/ledger/payment writes).

### Response
- Return created `sale` with nested `sale_items`, `payments`, `invoiceNumber`, `totalPaid`, `remaining`, and `customer.accountBalance` whenever a `customer` is attached to the sale (regardless of DEBIT or CREDIT).

### Decisions (previously open questions)
- Duplicate `product_id` within one request: rejected outright (validation #2), no merging — avoids ambiguity/errors from the frontend.
- Tax-inclusive pricing concept removed entirely: taxes are always exclusive/added on top; tax-free products simply use `taxRate = 0.0`. `store_settings.defaultTaxInclusive` and `sale_item.taxInclusive` removed from schema.
- `DEBIT` sales with a `customer_id` do create a `LedgerEntry` (both the SALE debit and PAYMENT credits) for full history, even though net `remaining = 0`.
- Float comparisons in validations 4, 7, 8, 9 are done at 2-decimal precision (round before comparing).
