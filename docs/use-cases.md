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
- `sale_type` is now persisted directly as `sales.saleType` (see db-schema.md) instead of being derived, since a `DEBIT` sale can still carry a `customer_id` and this value is needed for filtering/reporting in use case 8.

## 6. Update sale (require auth)

### Design decision: no in-place financial edits — void + recreate instead
A `sale` fans out into `sale_items`, `stock_movements`, `payments`, and (for customers) `ledger_entries`. Allowing an in-place update of items/quantities/discounts would require diffing old vs new line items and re-deriving stock and ledger deltas for every possible change (quantity up, quantity down, item added, item removed, discount changed, sale_type changed, customer changed, etc.). This is complex, easy to get wrong, and leaves no clear trail of "what actually happened" for accounting/audits.

**Recommendation:** treat only a `COMPLETED` sale as financially immutable. A `COMPLETED` sale already has real `stock_movements`/`ledger_entries` committed against it, so editing its items/amounts in place would require diffing and reversing those side effects — same complexity problem as a void, but without the clear "this was cancelled" audit signal. An `IN_PROGRESS` (draft) sale has **no side effects committed yet** (no stock deducted, no ledger entries, per use case 5 step 3/5 which only run at `COMPLETED`), so it is safe to fully edit like a regular in-flight order.

- **`saleStatus == IN_PROGRESS` (draft)**: fully editable. `sale_items` (add/remove/change quantity), `discount`, `payments`, `customer_id`, and `sale_type` can all be replaced wholesale (same shape as the create request in use case 5). No stock-availability check is required while saving a draft (see decision below) — stock is only checked when the draft is finalized to `COMPLETED`, at which point the full use case 5 validation/write pipeline runs (stock check, invoice number generation, stock_movements, payments, ledger_entries).
- **`saleStatus == COMPLETED`**: financially immutable. Anything that affects money or stock (`sale_items`, `discount`, `payments`, `customer` on a CREDIT sale, `sale_type`) is corrected by **voiding the sale (see use case 7) and creating a brand-new sale** with the correct data. The new sale gets its own `invoiceNumber`; the old one stays on record as `VOIDED`, referencing the void reason (and, once the correction is made, the new invoice number can be included in that reason/description for traceability).
  - Only non-financial metadata may be updated directly, with no stock/ledger side effects: `sale.description`/internal note (if added to schema), and `payments[].referenceNumber` / `payments[].description` (typo/reference fixes only, never `amount` or `method`).
- **`saleStatus == VOIDED`**: fully read-only, no updates allowed (use case 7 output is final).

### Request (PUT /api/sales/{id}) — while IN_PROGRESS
Same body shape as the create request in use case 5 (full replace of `sale_type`, `customer_id`, `discount`, `sale_items`, `payments`), plus an optional `saleStatus: "COMPLETED"` to finalize it in the same call.

### Request (PATCH /api/sales/{id}) — while COMPLETED
```json
{
  "description": "string, optional",
  "payments": [
    { "id": "uuid, required", "referenceNumber": "string, optional", "description": "string, optional" }
  ]
}
```

### Validations
1. Sale must exist and belong to the current store.
2. Sale must not already be `VOIDED` (voided sales are read-only).
3. If the sale is `IN_PROGRESS`: no stock-availability check on plain save; if the request also asks to transition to `COMPLETED`, run the full use case 5 create-time validations (including stock check) before committing.
4. If the sale is `COMPLETED`: only `payments[].referenceNumber`/`payments[].description`/`sale.description` may change. Any attempt to change `sale_items`, `discount`, `payments[].amount`, `payments[].method`, `customer_id`, or `sale_type` is rejected with a clear error pointing to "void and recreate".

## 7. Void (delete) sale (require auth)

### Design decision: soft-delete + reversing entries, never hard-delete or mutate history
Hard-deleting a `sale` row (and cascading to `sale_items`/`payments`/`stock_movements`/`ledger_entries`) destroys the audit trail, breaks the monotonic `invoiceNumber` sequence, and can silently corrupt historical reports (e.g. a report already run for last month would no longer reproduce). Mutating existing `stock_movements`/`ledger_entries` in place is equally bad — those are meant to be an append-only ledger.

**Recommendation:** never delete or edit the original rows. Instead:
1. Set `sale.saleStatus = VOIDED`, `sale.voidReason = <reason>` (mandatory, see request below), `sale.voidedAt = now()`, `sale.voidedBy = current user` (row is kept, all original children untouched — they remain the historical record of what happened).
2. For each original `sale_item` → create a **reversing `stock_movement`**: `type = ADJUSTMENT_IN`, `quantity = sale_item.quantity`, `quantityBefore = product.stockQuantity`, `quantityAfter = quantityBefore + quantity`, `description = "Void of sale <invoiceNumber>: <voidReason>"`, linking `product`, `store`, `sale` (original), `sale_item` (original). Update `product.stockQuantity = quantityAfter`.
3. If the sale had a `customer` (DEBIT or CREDIT), create **reversing `ledger_entries`** rather than deleting the originals:
   - One `direction = CREDIT`, `type = ADJUSTMENT`, `amount = totalAmount`, `reference_number = invoiceNumber`, `description = "Reversal of SALE debit for voided sale <invoiceNumber>: <voidReason>"`, `customer`, `sale = null`  (reverses the original SALE debit).
   - One `direction = DEBIT`, `type = ADJUSTMENT`, `amount = sum(payments.amount)`, `reference_number = invoiceNumber`, `description = "Reversal of PAYMENT credit(s) for voided sale <invoiceNumber>: <voidReason>"`, `customer`, `sale = null` (reverses the original PAYMENT credits).
   - `reference_number` reuses the original `invoiceNumber` (rather than a synthetic `VOID-` prefix) so it joins/filters cleanly against the original sale's ledger entries; the `description` text is what visibly marks these as void-reversal entries.
   - Net effect: `customer.accountBalance` returns to what it was before the sale (adjust by `-(totalAmount) + sum(payments.amount)`, i.e. the exact opposite of what use case 5 step 5 applied).
4. `payments` rows are left as-is (they are a historical record of money that was actually received); they are not deleted or reversed with new payment rows, since no real refund occurred automatically — a real cash/bank refund, if any, should be recorded through a separate return/refund flow (out of scope here).
5. All of steps 1–3 happen in a single transaction; on failure, roll back everything (no partial voids).

### Request (POST /api/sales/{id}/void)
```json
{
  "voidReason": "string, required, e.g. 'Wrong item scanned, corrected in invoice INV-2024-00042'"
}
```

### Validations
1. Sale must exist and belong to the current store.
2. Sale must not already be `VOIDED` (voiding twice is rejected).
3. `voidReason` is required and must not be blank — reject with 400 if missing/empty, since it's the only durable explanation of why the reversal happened.
4. Only `OWNER` (and optionally the cashier who created it, within a short time window — e.g. same day) may void a sale; otherwise 403.

### Response
- Return the voided `sale` (including `voidReason`, `voidedAt`, `voidedBy`) plus the generated reversing `stock_movements`/`ledger_entries`, and updated `customer.accountBalance` if applicable.

## 8. Get all sales (require auth) — list with filters

All filters are optional and combinable (AND-ed together). Results are always scoped to the authenticated user's `store`.

### Query parameters
- `from`, `to`: datetime range on `soldAt` (inclusive).
- `saleStatus`: one or more of `COMPLETED`, `IN_PROGRESS`, `VOIDED` (defaults to all except `VOIDED` if not specified, so voided sales don't clutter normal listings unless explicitly requested).
- `saleType`: one or more of `DEBIT`, `CREDIT`.
- `customerId`: sales for a specific customer.
- `userId`: sales made by a specific cashier/staff member.
- `invoiceNumber`: exact match or partial/`contains` match (e.g. `?invoiceNumber=INV-2024`).
- `productId`: sales that contain at least one `sale_item` for this product (joins `sale_items`).
- `paymentMethod`: one or more of `CASH`, `BANK`, `CREDIT` — sales having at least one payment with this method.
- `minTotalAmount`, `maxTotalAmount`: range on `totalAmount`.
- `hasRemaining`: boolean — `true` returns sales with `remaining > 0` (outstanding credit), `false` returns fully settled sales.
- `search`: free-text match across `invoiceNumber` and `customer.name`.
- `page`, `size`: pagination (0-indexed page, default size e.g. 20, max size capped e.g. 100 to avoid abuse).
- `sortBy`: one of `soldAt`, `totalAmount`, `invoiceNumber` (default `soldAt`).
- `sortDir`: `asc` | `desc` (default `desc`, most recent first).

### Validations
1. `from <= to` if both provided.
2. `minTotalAmount <= maxTotalAmount` if both provided.
3. Unknown enum values for `saleStatus`/`saleType`/`paymentMethod` are rejected with 400, not silently ignored.
4. `size` is capped server-side regardless of what the client requests.

### Response
- Paginated envelope: `{ content: Sale[], page, size, totalElements, totalPages }`.
- Each `sale` in the list includes summary fields only (`invoiceNumber`, `soldAt`, `saleType`, `saleStatus`, `totalAmount`, `totalPaid`, `remaining`, `customer.name` if present) — full `sale_items`/`payments` detail is only returned by the single-sale `GET /api/sales/{id}` endpoint (use case handled by existing `getSale`).
