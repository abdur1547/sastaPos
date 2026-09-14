# Use cases:

## Authentication

> These endpoints are the planned authentication contract. The current backend does not yet implement Spring Security, password hashing, JWT issuance, or a dedicated `/api/auth` resource. The existing `/api/users` resource is administrative CRUD and must not be used as the public signup/login API.

## 1. Signup

### Request (`POST /api/auth/signup`)
```json
{
  "name": "string, required",
  "email": "string, required, valid email format",
  "password": "string, required"
}
```

### Validations
1. `name` must not be blank.
2. `email` must be a valid email address and must be normalized consistently (trimmed and case-insensitive for uniqueness).
3. `email` must be globally unique; an existing email returns `409 Conflict`.
4. `password` must satisfy the configured password policy. The policy must be enforced by the backend and must never be returned in an API response.

### Write steps
1. Hash `password` with the configured adaptive password-hashing algorithm; never store or log the plaintext password.
2. Create the user with:
   - `name` from the request.
   - normalized `email`.
   - `passwordHash` from the password hash.
   - `role = CASHIER`.
   - `status = ACTIVE`.
   - `store = null` until the user creates or is assigned to a store.
3. Issue an access JWT for the newly created user.

### Response (`201 Created`)
```json
{
  "accessToken": "jwt",
  "tokenType": "Bearer",
  "expiresIn": "integer seconds",
  "user": {
    "id": "uuid",
    "name": "string",
    "email": "string",
    "role": "CASHIER",
    "status": "ACTIVE",
    "storeId": null
  }
}
```

The response must never include `password` or `passwordHash`.

## 2. Login

### Request (`POST /api/auth/login`)
```json
{
  "email": "string, required",
  "password": "string, required"
}
```

### Validations and authentication
1. Normalize the email using the same rules as signup.
2. Find the user by normalized email and verify the password against the stored password hash.
3. Users with `status = IN_ACTIVE` cannot log in and receive `401 Unauthorized`.
4. Invalid email/password combinations return the same `401 Unauthorized` response so that the API does not reveal whether an email exists.
5. On successful login, update `lastLoginAt` and issue an access JWT.

### Response (`200 OK`)
Use the same response shape as signup, with the authenticated user's current `id`, `name`, `email`, `role`, `status`, and `storeId`.

## 2a. Get current authenticated user

### Request (`GET /api/auth/me`)
- Requires `Authorization: Bearer <accessToken>`.
- The backend identifies the user from the JWT subject; the client must not provide a user ID.

### Response (`200 OK`)
Return the authenticated user's safe profile using the `user` object from the signup/login response. Never return `password` or `passwordHash`.

### Authorization failures
- Missing, malformed, expired, or invalid token: `401 Unauthorized`.
- User exists but is `IN_ACTIVE`: `401 Unauthorized` and the request must not proceed.

## 2b. Logout

### Request (`POST /api/auth/logout`)
- Requires `Authorization: Bearer <accessToken>`.
- The client must discard the access token after a successful response.

### Response (`204 No Content`)
Because access JWTs are stateless, logout is client-side token removal unless server-side token revocation or refresh-token storage is introduced. A future revocation design must define token identifiers, expiration handling, and revocation storage before this endpoint is made stateful.

## 2c. Change password (require auth)

### Request (`POST /api/auth/change-password`)
```json
{
  "currentPassword": "string, required",
  "newPassword": "string, required"
}
```

### Validations
1. The access token must identify an `ACTIVE` user.
2. `currentPassword` must match the stored password hash.
3. `newPassword` must satisfy the configured password policy and must not be the same as the current password.
4. Invalid current credentials return `401 Unauthorized`; password policy violations return `400 Bad Request`.

### Write steps
1. Hash `newPassword` with the configured adaptive password-hashing algorithm.
2. Replace the stored password hash.
3. Invalidate existing sessions or refresh tokens for the user, if session/token revocation is enabled.

### Response (`204 No Content`)
The response must not include the password, password hash, or a newly generated password.

## 2d. Request password reset

### Request (`POST /api/auth/password-reset/request`)
```json
{
  "email": "string, required"
}
```

### Behavior
1. Normalize the email using the same rules as signup and login.
2. If an active account exists, generate a cryptographically random reset token with a short expiry, for example 15 minutes.
3. Store only a hash of the reset token with the user, expiry timestamp, and a used/revoked flag. Never store the raw token.
4. Send the raw token in a password-reset link through the configured email provider. The token must be sent only out of band and must never appear in API logs.
5. Invalidate any previous unused reset tokens for the same user.

### Response (`202 Accepted`)
Always return the same response whether or not the email belongs to an account, for example:
```json
{
  "message": "If an account exists for this email, password reset instructions have been sent."
}
```

This prevents account enumeration. The endpoint must be rate-limited per email and per source address.

## 2e. Complete password reset

### Request (`POST /api/auth/password-reset/complete`)
```json
{
  "token": "string, required",
  "newPassword": "string, required"
}
```

### Validations
1. The token must match a stored token hash, must not be expired, and must not already be used or revoked.
2. `newPassword` must satisfy the configured password policy.
3. Invalid, expired, used, or revoked tokens return `400 Bad Request` without revealing which condition failed.

### Write steps
1. Hash `newPassword` with the configured adaptive password-hashing algorithm.
2. Replace the user's stored password hash.
3. Mark the reset token as used in the same transaction; a reset token is single-use even if the request is retried.
4. Revoke all other unused reset tokens for the user.
5. Invalidate existing sessions or refresh tokens for the user, if session/token revocation is enabled.

### Response (`204 No Content`)
The response must not include the password, password hash, reset token, or JWT. The user must log in again after a successful reset.

### Required persistence
The reset flow requires a password-reset-token record containing at least:
- a token ID and user reference;
- a hash of the raw reset token;
- an expiry timestamp;
- used/revoked state and timestamps;
- creation timestamp.

The email/SMS provider and message template can be selected independently, but the API must preserve the same non-enumerating response and token rules regardless of provider.

## 3. Create store (require auth)

Since each user can belong to only one store, the store resource is always addressed as `/api/store` (singular, no `{id}`) and resolved from the authenticated user — there is no list/index endpoint.

### Request (`POST /api/store`)
```json
{
  "name": "string, required",
  "ntn": "string, required, globally unique",
  "address": "string, optional",
  "currencyCode": "string, optional, defaults to \"PKR\" if not sent",
  "timezone": "string, optional, defaults to \"Asia/Karachi\" if not sent"
}
```
`status` is never accepted from the client on create — it always starts as `ACTIVE`.

### Validations
1. `name` must not be blank.
2. `ntn` must not be blank and must be globally unique; an existing `ntn` returns `409 Conflict`.
3. The authenticated user must not already have a store (`user.storeId != null`) — reject with `409 Conflict` (a user creates at most one store; use case 3d covers deactivating it, there is no delete-and-recreate flow).

### Write steps
1. Create a default `store_settings` row: `invoicePrefix = ""`, `invoiceNumberStart = 1`, `nextInvoiceNumber = 1`, `receiptFooter = ""`.
2. Create the `store`: `name`, `ntn`, `address` (null if not sent), `currencyCode` (request value, else default `"PKR"`), `timezone` (request value, else default `"Asia/Karachi"`), `status = ACTIVE`, linked to the `store_settings` from step 1.
3. Set `user.storeId = store.id`.
4. Set `user.role = OWNER`.

### Response (`201 Created`)
Return the created `store` (including nested `store_settings`) and the updated `user` profile (`role = OWNER`, `storeId` set).

## 3a. Get current store (require auth)

### Request (`GET /api/store`)
- Resolve `store` from `user.storeId`.
- `404 Not Found` if the authenticated user has no store yet (hasn't completed use case 3).

### Response (`200 OK`)
Return the `store` with its nested `store_settings`.

## 3b. Update store (require auth, OWNER only)

### Request (`PATCH /api/store`)
```json
{
  "name": "string, optional",
  "ntn": "string, optional",
  "address": "string, optional",
  "currencyCode": "string, optional",
  "timezone": "string, optional",
  "status": "ACTIVE | IN_ACTIVE, optional"
}
```

### Validations
1. Authenticated user must have a store (`404` if not) and must have `role = OWNER` (`403 Forbidden` otherwise — `CASHIER`s cannot update store profile).
2. `name`, if provided, must not be blank.
3. `ntn`, if changed, must remain globally unique — conflict returns `409 Conflict`.
4. `status`, if provided, must be a known enum value (`400 Bad Request` otherwise). Setting `status = IN_ACTIVE` here has the same effect as use case 3d (deactivate); setting `status = ACTIVE` reactivates a previously deactivated store.

### Response (`200 OK`)
Return the updated `store` (with nested `store_settings`).

## 3c. Update store settings (require auth, OWNER only)

### Request (`PATCH /api/store/settings`)
```json
{
  "invoicePrefix": "string, optional",
  "invoiceNumberStart": "integer, optional",
  "receiptFooter": "string, optional"
}
```
- `nextInvoiceNumber` is never accepted from the client — it is strictly system-managed (auto-incremented by use case 5 on each sale) to guarantee the invoice number sequence never skips or repeats.

### Validations
1. Authenticated user must have a store (`404` if not) and must have `role = OWNER` (`403 Forbidden` otherwise).
2. `invoiceNumberStart`, if provided, must be a positive integer, and is only editable while the store has **zero** sales ever created (`SALE` history would make retroactively moving the counter ambiguous) — reject with `409 Conflict` if the store already has at least one `sale`. When accepted, also reset `nextInvoiceNumber = invoiceNumberStart`.

### Response (`200 OK`)
Return the updated `store_settings`.

## 3d. Deactivate store (require auth, OWNER only)

### Design decision: soft-delete only, no hard delete
A `store` is referenced by `users`, `products`, `customers`, `sales`, and `stock_movements` — hard-deleting it would destroy all historical/financial records for the business. There is no scenario where a store with any activity can be safely removed, so only a soft-delete (`status = IN_ACTIVE`) is supported; reactivation is done via use case 3b (`PATCH /api/store` with `status = ACTIVE`).

### Request (`DELETE /api/store`)
No body required. This is a convenience alias for `PATCH /api/store` with `{ "status": "IN_ACTIVE" }`.

### Validations
1. Authenticated user must have a store (`404` if not) and must have `role = OWNER` (`403 Forbidden` otherwise).
2. Store must not already be `IN_ACTIVE` (`409 Conflict` if already deactivated).

### Response (`200 OK`)
Return the updated `store` with `status = IN_ACTIVE`.

## 4. Add Products to store
- user send name string (required), sku string optional, barCode string optional, pctCode string (required), description string optional, unitPrice NUMERIC(18,2) required, stockQuantity NUMERIC(18,2) optional, unit_of_measure required (it will be a drop down in UI), tax_category_ids optional list
- get store from logedin user
- backend creates a Product(name, sku, barCode, pctCode, description, unitPrice, stockQuantity, unit_of_measure, tax_categories, store, status = ACTIVE)
- if stockQuantity > 0, backend creats a stock_movements with type = ADJUSTMENT_IN, product

## 4a. Update Product (require auth)

### Request (PATCH /api/products/{id})
```json
{
  "name": "string, optional",
  "sku": "string, optional",
  "barCode": "string, optional",
  "pctCode": "string, optional",
  "description": "string, optional",
  "unitPrice": "decimal, optional",
  "unit_of_measure_id": "uuid, optional",
  "tax_category_ids": "uuid[], optional",
  "status": "ACTIVE | IN_ACTIVE, optional"
}
```
- `stockQuantity` is never editable through this endpoint — stock only changes via `stock_movements` (use case 4's initial `ADJUSTMENT_IN`, a sale, or a future stock-adjustment use case). This keeps `stock_movements` the single source of truth for stock changes.
- Product must belong to the current store, else 404/403.
- `sku`/`pctCode`/`barCode` uniqueness rules from the products table still apply on change.
- `status = IN_ACTIVE` hides the product from POS/sale screens (see use case 5 pre-conditions: only `ACTIVE` products can be added to a new sale) but keeps it fully intact for historical sales/reports.
- Response: the updated `product`.

## 4b. Delete Product (require auth)

### Design decision: hard delete only when the product has no sale history, otherwise soft-delete
A `product` can be referenced by `sale_items` (non-nullable FK) and `stock_movements`. If any `sale_items` row references the product — whether that sale is `COMPLETED`, `IN_PROGRESS`, or `VOIDED` — hard-deleting it would break that historical record. So:

- If the product has **zero** `sale_items` ever created against it (never sold, regardless of draft/void status): hard delete is allowed — the row and its `stock_movements` (only ever `ADJUSTMENT_IN`/`ADJUSTMENT_OUT` in this case, never `SALE`) are removed.
- If the product has **at least one** `sale_item` (even if every sale referencing it is `VOIDED`): hard delete is rejected; `DELETE /api/products/{id}` instead performs a soft-delete by setting `status = IN_ACTIVE` only (no other fields touched). This preserves the audit trail on past sales while still removing it from active use.

### Request (DELETE /api/products/{id})
No body required.

### Validations
1. Product must exist and belong to the current store, else 404/403.

### Response
- `204 No Content` on hard delete.
- `200 OK` with the updated `product` (now `status = IN_ACTIVE`) when a soft-delete was performed instead, along with a message indicating the product had sale history and was deactivated rather than removed.

## 4c. Get all products (require auth) — list with filters

All filters are optional and combinable (AND-ed together). Results are always scoped to the authenticated user's `store`.

### Query parameters
- `search`: free-text match across `name`, `sku`, `barCode`, `pctCode`.
- `status`: `ACTIVE` | `IN_ACTIVE` (defaults to `ACTIVE` only, so deactivated products don't clutter normal listings unless explicitly requested).
- `unitOfMeasureId`: exact match.
- `taxCategoryId`: products linked to this tax category.
- `minStock`, `maxStock`: range on `stockQuantity`.
- `minPrice`, `maxPrice`: range on `unitPrice`.
- `page`, `size`: pagination (0-indexed page, default size e.g. 20, max size capped e.g. 100).
- `sortBy`: one of `name`, `stockQuantity`, `unitPrice`, `createdAt` (default `name`).
- `sortDir`: `asc` | `desc` (default `asc`).

### Validations
1. `minStock <= maxStock` if both provided.
2. `minPrice <= maxPrice` if both provided.
3. Unknown enum values for `status` are rejected with 400, not silently ignored.
4. `size` is capped server-side regardless of what the client requests.

### Response
- Paginated envelope: `{ content: Product[], page, size, totalElements, totalPages }`.

## 4d. Add Stock Movement (require auth) — manual stock adjustments

Covers stock changes that don't come from a sale: receiving new stock (`STOCK_IN`), or correcting stock counts (`ADJUSTMENT_IN`/`ADJUSTMENT_OUT`, e.g. stocktake corrections, damage/loss, returns to supplier). `SALE` movements are never created through this endpoint — they're only ever created by use case 5 (create sale) and reversed by use case 5b (void sale).

### Request (POST /api/products/{id}/stock-movements)
```json
{
  "type": "STOCK_IN | ADJUSTMENT_IN | ADJUSTMENT_OUT",
  "quantity": "decimal, required, must be > 0",
  "description": "string, required for all three types (e.g. 'Received PO#1234', 'Stocktake correction', 'Damaged goods write-off')"
}
```

### Validations
1. Product must exist, belong to the current store, else 404/403.
2. `type` must be one of `STOCK_IN`, `ADJUSTMENT_IN`, `ADJUSTMENT_OUT` — `SALE` is rejected with 400 (only created internally by the sale flow).
3. `quantity > 0`; if `product.unit_of_measure.allowsFraction == false` then `quantity` must be a whole number.
4. `description` is required and must not be blank for all three types — reject with 400 if missing/empty.
5. For `ADJUSTMENT_OUT`: `product.stockQuantity >= quantity`, else reject with insufficient-stock error (stock can't go negative).

### Write steps
1. `quantityBefore = product.stockQuantity`.
2. `quantityAfter = quantityBefore + quantity` for `STOCK_IN`/`ADJUSTMENT_IN`, or `quantityBefore - quantity` for `ADJUSTMENT_OUT`.
3. Create `StockMovement`: `type`, `quantity`, `quantityBefore`, `quantityAfter`, `description`, `product`, `store`, `sale = null`, `sale_item = null`.
4. Update `product.stockQuantity = quantityAfter`.

### Response
- Return the created `stock_movement` and the updated `product` (with new `stockQuantity`).

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
- Resolve all `product`s referenced in `sale_items`, must belong to the same store and have `status = ACTIVE`, else 404/403.
- If `customer_id` present, resolve `customer`, must belong to the same store, else 404/403.

### Validations (reject whole request if any fails, no partial writes)
1. `sale_items` must not be empty; `sale_items.length == total_items`.
2. Every `product_id` in `sale_items` must exist and be unique (no duplicate product in same sale).
3. For each sale_item: `quantity > 0`; if `product.unit_of_measure.allowsFraction == false` then `quantity` must be a whole number.
4. For each sale_item: `product.unitPrice * quantity == item_total` (rounded to 2 decimals, small epsilon allowed).
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
- `sale_type` is now persisted directly as `sales.saleType` (see db-schema.md) instead of being derived, since a `DEBIT` sale can still carry a `customer_id` and this value is needed for filtering/reporting in use case 5c.

## 5a. Update sale (require auth)

### Design decision: no in-place financial edits — void + recreate instead
A `sale` fans out into `sale_items`, `stock_movements`, `payments`, and (for customers) `ledger_entries`. Allowing an in-place update of items/quantities/discounts would require diffing old vs new line items and re-deriving stock and ledger deltas for every possible change (quantity up, quantity down, item added, item removed, discount changed, sale_type changed, customer changed, etc.). This is complex, easy to get wrong, and leaves no clear trail of "what actually happened" for accounting/audits.

**Recommendation:** treat only a `COMPLETED` sale as financially immutable. A `COMPLETED` sale already has real `stock_movements`/`ledger_entries` committed against it, so editing its items/amounts in place would require diffing and reversing those side effects — same complexity problem as a void, but without the clear "this was cancelled" audit signal. An `IN_PROGRESS` (draft) sale has **no side effects committed yet** (no stock deducted, no ledger entries, per use case 5 steps 3/5 which only run at `COMPLETED`), so it is safe to fully edit like a regular in-flight order.

- **`saleStatus == IN_PROGRESS` (draft)**: fully editable. `sale_items` (add/remove/change quantity), `discount`, `payments`, `customer_id`, and `sale_type` can all be replaced wholesale (same shape as the create request in use case 5). No stock-availability check is required while saving a draft (see decision below) — stock is only checked when the draft is finalized to `COMPLETED`, at which point the full use case 5 validation/write pipeline runs (stock check, invoice number generation, stock_movements, payments, ledger_entries).
- **`saleStatus == COMPLETED`**: financially immutable. Anything that affects money or stock (`sale_items`, `discount`, `payments`, `customer` on a CREDIT sale, `sale_type`) is corrected by **voiding the sale (see use case 5b) and creating a brand-new sale** with the correct data. The new sale gets its own `invoiceNumber`; the old one stays on record as `VOIDED`, referencing the void reason (and, once the correction is made, the new invoice number can be included in that reason/description for traceability).
  - Only non-financial metadata may be updated directly, with no stock/ledger side effects: `sale.description`/internal note (if added to schema), and `payments[].referenceNumber` / `payments[].description` (typo/reference fixes only, never `amount` or `method`).
- **`saleStatus == VOIDED`**: fully read-only, no updates allowed (use case 5b output is final).

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

## 5b. Void (delete) sale (require auth)

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

## 5c. Get all sales (require auth) — list with filters

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

## 6. Create customer (require auth)

### Request (POST /api/customers)
```json
{
  "name": "string, required, unique per store",
  "phoneNumber": "string, optional, unique globally",
  "ntn": "string, optional"
}
```

### Validations
1. `name` required, not blank, unique within the current store.
2. `phoneNumber`, if provided, unique globally across all stores.

### Write steps
- Resolve `store` from the authenticated user.
- Create `Customer`: `name`, `phoneNumber`, `ntn`, `accountBalance = 0.0`, `status = ACTIVE`, `store`.

### Response
- Return the created `customer`.

## 6a. Update customer (require auth)

### Request (PATCH /api/customers/{id})
```json
{
  "name": "string, optional",
  "phoneNumber": "string, optional",
  "ntn": "string, optional",
  "status": "ACTIVE | IN_ACTIVE, optional"
}
```

- `accountBalance` is never editable through this endpoint — it only ever changes as a side effect of sales (use case 5), voids (use case 5b), and payments (use case 6d), keeping `ledger_entries` the single source of truth.
- `status` can be set back to `ACTIVE` here to reactivate a customer previously deactivated via delete (use case 6b), or set to `IN_ACTIVE` directly (equivalent to the soft-delete outcome of 6b, without needing the balance/sales checks — since no side effects are being reversed, just visibility toggled). Reactivating never touches `accountBalance`.

### Validations
1. Customer must exist and belong to the current store, else 404/403.
2. `name`, if changed, stays unique within the store; `phoneNumber`, if changed, stays unique globally.
3. Unknown `status` values rejected with 400.

### Response
- Return the updated `customer`.

## 6b. Delete customer (require auth)

### Design decision: hard delete only when fully clean, otherwise soft-delete via status
A `customer` can be referenced by `sales` (nullable FK, but present whenever a sale is linked to them) and `ledger_entries` (non-nullable FK). If either exists, or the customer carries any non-zero `accountBalance`, hard-deleting would either destroy historical/financial records or silently write off money owed. So:

- If `accountBalance == 0` **and** the customer has **zero** `sales` ever created against them **and** **zero** `ledger_entries`: hard delete is allowed — the row is removed.
- Otherwise, if `accountBalance == 0` (regardless of whether `sales`/`ledger_entries` exist): hard delete is rejected; `DELETE /api/customers/{id}` instead performs a soft-delete by setting `status = IN_ACTIVE` only (no other fields touched). The customer is hidden from default listings and can't be attached to new sales, but stays intact for historical sales/ledger.
- If `accountBalance != 0` (positive = customer owes store, negative = store owes customer): the delete is rejected outright with an error — an outstanding balance must be settled (via use case 6d, a void, or a manual ledger adjustment) before the customer can be removed or deactivated.

### Request (DELETE /api/customers/{id})
No body required.

### Validations
1. Customer must exist and belong to the current store, else 404/403.
2. `accountBalance` must be `0`, else reject with an outstanding-balance error.

### Response
- `204 No Content` on hard delete.
- `200 OK` with the updated `customer` (now `status = IN_ACTIVE`) when a soft-delete was performed instead, along with a message indicating the customer had sale/ledger history and was deactivated rather than removed.

## 6c. Get all customers (require auth) — list with filters

All filters are optional and combinable (AND-ed together). Results are always scoped to the authenticated user's `store`.

### Query parameters
- `search`: free-text match across `name`, `phoneNumber`, `ntn`.
- `status`: `ACTIVE` | `IN_ACTIVE` (defaults to `ACTIVE` only, so deactivated customers don't clutter normal listings unless explicitly requested).
- `hasBalance`: boolean — `true` returns customers with `accountBalance != 0`, `false` returns customers with `accountBalance == 0`.
- `minBalance`, `maxBalance`: range on `accountBalance`.
- `page`, `size`: pagination (0-indexed page, default size e.g. 20, max size capped e.g. 100).
- `sortBy`: one of `name`, `accountBalance`, `createdAt` (default `name`).
- `sortDir`: `asc` | `desc` (default `asc`).

### Validations
1. `minBalance <= maxBalance` if both provided.
2. Unknown enum values for `status` are rejected with 400, not silently ignored.
3. `size` is capped server-side regardless of what the client requests.

### Response
- Paginated envelope: `{ content: Customer[], page, size, totalElements, totalPages }`.

## 6d. Take payment from customer (require auth)

Records money received from a customer against their outstanding balance. This is a general payment against the customer's ledger, not tied to any single sale/invoice — it settles the account as a whole (oldest debts first is a reporting/display concern, not a data concern, since `ledger_entries` are just a flat append-only history).

### Request (POST /api/customers/{id}/payments)
```json
{
  "amount": "decimal, required, must be > 0",
  "method": "CASH | BANK, required",
  "referenceNumber": "string, optional",
  "description": "string, optional"
}
```

### Validations
1. Customer must exist and belong to the current store, else 404/403.
2. `amount > 0`.
3. `method` must be `CASH` or `BANK` (`CREDIT` is not a valid payment method here).
4. Overpayment is allowed — `amount` may exceed the customer's current `accountBalance`, resulting in a negative balance (store now owes the customer).

### Write steps
1. Create `LedgerEntry`: `direction = CREDIT`, `type = PAYMENT`, `amount`, `reference_number = referenceNumber`, `description`, `customer`, `sale = null`.
2. Update `customer.accountBalance -= amount`.

### Response
- Return the created `ledger_entry` and the updated `customer` (with new `accountBalance`).

## 6e. Void customer payment (require auth)

### Design decision: void via reversing entry, same pattern as sale voiding (5b) — never delete or mutate
A payment is just a `ledger_entry` (`type = PAYMENT`, `direction = CREDIT`). Deleting or editing that row outright would corrupt the append-only ledger and make `accountBalance` history unreproducible (same reasoning as use case 5b for sales). So voiding never deletes anything or filters rows out of calculations — it works purely by posting an offsetting entry, exactly like a sale void:

1. Mark the original entry: `ledger_entry.voided = true`, `voidReason = <reason>` (mandatory), `voidedAt = now()`, `voidedBy = current user`. The row and its original `amount`/`direction`/`type` are left untouched — `voided` is only a display/reporting flag (e.g. "exclude voided payments from a payments-received report") and is never used to adjust `accountBalance` itself.
2. Create a **reversing `ledger_entry`**: `direction = DEBIT`, `type = ADJUSTMENT`, `amount = original.amount`, `reference_number = original.reference_number`, `description = "Reversal of PAYMENT voided: <voidReason>"`, `customer`, `sale = null`.
3. Update `customer.accountBalance += original.amount` (exact opposite of the `-= amount` applied when the payment was taken in 6d).

No query-time filtering of voided rows is needed to keep `accountBalance` correct — the reversing entry alone restores the balance. `voided` only helps reporting distinguish "money we actually still hold" from "a payment that was reversed" when listing/summing raw ledger entries.

### Request (POST /api/customers/{customerId}/payments/{ledgerEntryId}/void)
```json
{
  "voidReason": "string, required, e.g. 'Cheque bounced' or 'Entered wrong amount, corrected in payment #123'"
}
```

### Validations
1. Ledger entry must exist, belong to the current store's customer, and have `type == PAYMENT`, else 404/403/400.
2. Entry must not already be `voided` (voiding twice is rejected).
3. `voidReason` is required and must not be blank — reject with 400 if missing/empty.
4. Only `OWNER` (and optionally the cashier who recorded it, within a short time window — same rule as sale voids in 5b) may void a payment; otherwise 403.

### Response
- Return the voided `ledger_entry` (with `voidReason`, `voidedAt`, `voidedBy`), the generated reversing `ledger_entry`, and the updated `customer` (with new `accountBalance`).
- Each `sale` in the list includes summary fields only (`invoiceNumber`, `soldAt`, `saleType`, `saleStatus`, `totalAmount`, `totalPaid`, `remaining`, `customer.name` if present) — full `sale_items`/`payments` detail is only returned by the single-sale `GET /api/sales/{id}` endpoint (use case handled by existing `getSale`).
