# Use cases:

> Vendor, purchase, return, inventory, costing, settlement, and offline changes below are the planned contract, not an assertion that application code or database migrations already implement them. Existing implementation notes describe the previous implementation where explicitly identified.

## Shared inventory and account rules

- All new business operations below work offline: validate and write to local SQLite first, in one transaction, then upload through the PowerSync connector to the backend. PowerSync replicates backend changes down; it does not itself apply uploads to PostgreSQL. See use case 13.
- One writing terminal per store is supported for now. Multi-terminal numbering, stock conflicts, and concurrent cost reconciliation are deferred. Direct API writes must not become a second independent writer while offline terminal operations are pending.
- Resolve the store and acting user from the authenticated context, including upload authentication; never trust a client-supplied store/user to bypass authorization.
- Unless a use case says OWNER only, OWNER and CASHIER may perform it. Both may create purchases and view purchase costs. Only OWNER may void documents/payments, make manual stock adjustments, or correct inventory valuation.
- Use `Vendor`, `vendors`, and `vendorId` consistently. Customers and vendors are separate accounts even when they represent the same business; never automatically offset their balances.
- Shared `ledger_entries` belong to exactly one customer or vendor. `accountBalance = sum(DEBIT) - sum(CREDIT)` for both; always include original entries and their reversals in this calculation.
- Positive means the party owes the store; negative means the store owes the party. Customer display: **Customer owes you Rs X / You owe customer Rs X / Settled**. Vendor display: **Vendor owes you Rs X / You owe vendor Rs X / Settled**. Show absolute amounts, not negative money or debit/credit jargon.
- Document `DEBIT` means fully paid now, `CREDIT` means some/all payment deferred. Display **Paid in full / Pay later** in the form; document types are not ledger directions or payment methods.
- Actual payment methods are `CASH` and `BANK` only. `CREDIT` is never a synthetic payment row or an actual payment-method filter; use document type and remaining amount to identify credit transactions.
- Movement types: `SALE` (out), `PURCHASE` (in), `SALE_RETURN` (in), `PURCHASE_RETURN` (out), `ADJUSTMENT_IN` (in), `ADJUSTMENT_OUT` (out). Quantities are always positive; type determines direction.
- Manual adjustments never change customer/vendor balances. An actual commercial return must use the return flow, not a manual adjustment.
- Posted records are financially immutable. Preserve original rows and link any reversal to the exact original row; require a reason and prevent duplicate reversals.
- Zero financial effects create no zero-amount ledger/payment rows. Free goods may still create positive-quantity stock movements.
- Money uses decimal arithmetic rounded half-up to 2 decimals; quantity has 2 decimals; unit/average costs have 6 decimals. Use exact decimal/scaled-integer handling in SQLite as well as PostgreSQL.
- Date/time fields are UTC; date presets and calendar filters use the store timezone. All list filters are optional, AND-ed, and identically supported locally and by the API. Unknown fields/enums/sort keys, invalid ranges, negative pages, or sizes outside 1–100 return a clear validation error; never silently ignore an invalid filter.

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
  "timezone": "string, optional, defaults to \"Asia/Karachi\" if not sent",
  "salesTaxRegistrationStatus": "REGISTERED | UNREGISTERED, default UNREGISTERED",
  "strn": "string, required when REGISTERED"
}
```
`status` is never accepted from the client on create — it always starts as `ACTIVE`.

### Validations
1. `name` must not be blank.
2. `ntn` must not be blank and must be globally unique; an existing `ntn` returns `409 Conflict`.
3. The authenticated user must not already have a store (`user.storeId != null`) — reject with `409 Conflict` (a user creates at most one store; use case 3d covers deactivating it, there is no delete-and-recreate flow).
4. REGISTERED requires a nonblank STRN; NTN alone does not imply sales-tax registration.

### Write steps
1. Create a default `store_settings` row: `invoicePrefix = ""`, `invoiceNumberStart = 1`, `nextInvoiceNumber = 1`, `receiptFooter = ""`, `purchaseInvoicePrefix = "PUR-"`, `purchaseInvoiceNumberStart = 1`, `nextPurchaseInvoiceNumber = 1`, `returnInvoicePrefix = "RET-"`, `nextReturnInvoiceNumber = 1`, `costingMethod = MOVING_WEIGHTED_AVERAGE`.
2. Create the store with request identity/currency/timezone, tax registration status/STRN, status ACTIVE and settings from step 1; use the documented defaults for omitted optional fields.
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
  "salesTaxRegistrationStatus": "REGISTERED | UNREGISTERED, optional",
  "strn": "string, optional; required on the resulting REGISTERED record",
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
  "receiptFooter": "string, optional",
  "purchaseInvoicePrefix": "string, optional",
  "purchaseInvoiceNumberStart": "positive integer, optional, only before any purchase exists",
  "returnInvoicePrefix": "string, optional"
}
```
- `nextInvoiceNumber`, `nextPurchaseInvoiceNumber`, and `nextReturnInvoiceNumber` are never accepted as manual edits — the local transaction manages its sequence at posting and uploads it atomically. Drafts do not consume numbers, and posted numbers are never reused, including after voids. Offline numbering follows use case 13.
- Changing `purchaseInvoiceNumberStart` resets `nextPurchaseInvoiceNumber` only before any purchase exists; otherwise reject with `409`. Prefix changes must not cause a duplicate posted number.

### Validations
1. Authenticated user must have a store (`404` if not) and must have `role = OWNER` (`403 Forbidden` otherwise).
2. `invoiceNumberStart`, if provided, must be a positive integer, and is only editable while the store has **zero** sales ever created (`SALE` history would make retroactively moving the counter ambiguous) — reject with `409 Conflict` if the store already has at least one `sale`. When accepted, also reset `nextInvoiceNumber = invoiceNumberStart`.

### Response (`200 OK`)
Return the updated `store_settings`.

## 3d. Deactivate store (require auth, OWNER only)

### Design decision: soft-delete only, no hard delete
A `store` is referenced by users, products, customers, vendors, sales, purchases, returns, payments, ledgers, and stock history — hard-deleting it would destroy historical/financial records. Only soft-delete (`status = IN_ACTIVE`) is supported; reactivation is done via use case 3b.

### Request (`DELETE /api/store`)
No body required. This is a convenience alias for `PATCH /api/store` with `{ "status": "IN_ACTIVE" }`.

### Validations
1. Authenticated user must have a store (`404` if not) and must have `role = OWNER` (`403 Forbidden` otherwise).
2. Store must not already be `IN_ACTIVE` (`409 Conflict` if already deactivated).

### Response (`200 OK`)
Return the updated `store` with `status = IN_ACTIVE`.

> **Existing implementation notes (4–4d):** the API uses camelCase (`unitOfMeasureId`, `taxCategoryIds`); the enum value is `INACTIVE` (the `IN_ACTIVE` spelling below describes the same state). Unknown JSON properties return `400`; sku/barCode/pctCode conflicts return `409`. The planned list contract below validates page size 1–100 consistently; preserve existing enum serialization when implementing these additions.

## 4. Add Products to store
- user send name string (required), sku string optional, barCode string optional, pctCode string (required), description string optional, unitPrice NUMERIC(18,2) required, stockQuantity NUMERIC(18,2) optional, unit_of_measure required (it will be a drop down in UI), taxCategoryIds optional list
- get store from logedin user
- create the product locally with status ACTIVE; zero stock starts with known zero inventoryValue/averageCost. Upload under use case 13.
- if stockQuantity > 0, require `openingUnitCost` (decimal >= 0, 6 decimals), create an `ADJUSTMENT_IN` with reason `OPENING_STOCK`, and initialize inventory value/average cost under use case 12. Zero cost must be explicitly supplied, never inferred from missing data. Initial stock is a manual adjustment and is OWNER only; CASHIER may create a product with zero stock.

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
  "unitOfMeasureId": "uuid, optional",
  "taxCategoryIds": "uuid[], optional",
  "status": "ACTIVE | IN_ACTIVE, optional"
}
```
- `stockQuantity`, `averageCost`, `inventoryValue`, and `costStatus` are never editable through this endpoint. Stock changes only through stock movements; cost changes follow use case 12.
- Product must belong to the current store, else 404/403.
- `sku`/`pctCode`/`barCode` uniqueness rules from the products table still apply on change.
- `status = IN_ACTIVE` hides the product from POS/sale screens (see use case 5 pre-conditions: only `ACTIVE` products can be added to a new sale) but keeps it fully intact for historical sales/reports.
- Response: the updated `product`.

## 4b. Delete Product (require auth)

### Design decision: hard delete only with no stock or document history, otherwise soft-delete
- Hard delete is allowed only when stock is zero and there are no sale items, purchase items, return items, stock movements, or valuation adjustments, including drafts/voided history.
- Otherwise set `status = IN_ACTIVE`, preserving all history. Never cascade-delete inventory movements, even when the product was never sold.

### Request (DELETE /api/products/{id})
No body required.

### Validations
1. Product must exist and belong to the current store, else 404/403.

### Response
- `204 No Content` on hard delete.
- `200 OK` with the updated inactive product and a message explaining that stock/document history was retained.

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
4. `size` must be in 1–100; reject invalid values consistently locally and on the API.

### Response
- Paginated envelope: `{ content: Product[], page, size, totalElements, totalPages }`.

## 4d. Add Stock Movement (require auth, OWNER only) — manual stock adjustments

Covers non-commercial stock changes: opening stock, stocktake corrections, damage/loss, or other explained adjustments. Purchases and supplier/customer returns must use their document flows. Legacy `STOCK_IN` is replaced by `ADJUSTMENT_IN` for receipts with no commercial document or balance effect; do not relabel legacy receipts as purchases.

### Request (POST /api/products/{id}/stock-movements)
```json
{
  "type": "ADJUSTMENT_IN | ADJUSTMENT_OUT",
  "quantity": "decimal, required, must be > 0",
  "unitCost": "decimal >= 0, required for ADJUSTMENT_IN, 6 decimals",
  "reason": "OPENING_STOCK | STOCKTAKE | DAMAGE | LOSS | OTHER, required",
  "description": "string, required, e.g. 'Damaged goods write-off'"
}
```

### Validations
1. Product must exist, belong to the current store, else 404/403.
2. Only `ADJUSTMENT_IN` and `ADJUSTMENT_OUT` are accepted. Commercial movement types and legacy `STOCK_IN` are rejected with 400.
3. `quantity > 0`; if `product.unit_of_measure.allowsFraction == false` then `quantity` must be a whole number.
4. `reason` and nonblank `description` are required. For additions require explicit non-negative `unitCost`; removals use current carrying cost, never a client-entered cost. Unknown-valued existing stock must first be valued under use case 12a.
5. For `ADJUSTMENT_OUT`: `product.stockQuantity >= quantity`, else reject with insufficient-stock error (`409 Conflict`) (stock can't go negative).

### Write steps
1. `quantityBefore = product.stockQuantity`.
2. `quantityAfter = quantityBefore + quantity` for `ADJUSTMENT_IN`, or `quantityBefore - quantity` for `ADJUSTMENT_OUT`.
3. Create StockMovement with quantity, cost/value before/after snapshots, reason, description, product, user, store, and no document links.
4. Update product quantity, inventory value, and weighted-average cost atomically (use case 12). No payments or party-ledger entries are created.

### Response
- Return the created `stock_movement` and the updated `product` (with new `stockQuantity`).

## 5. Create sale (require auth)

### Request body
```json
{
  "sale_type": "DEBIT | CREDIT",
  "saleStatus": "COMPLETED | IN_PROGRESS, default COMPLETED",
  "customer_id": "uuid, required for CREDIT, optional for DEBIT",
  "discount": "decimal, optional, default 0.0",
  "sale_items": [
    {
      "product_id": "uuid, required",
      "quantity": "decimal, must respect product.unit_of_measure.allowsFraction",
      "unit_price": "decimal >= 0, optional, defaults to current product.unitPrice; sale-only price override",
      "item_total": "decimal, client-computed, used only for validation"
    }
  ],
  "payments": [
    {
      "amount": "decimal, required",
      "method": "CASH | BANK, optional, default CASH; no synthetic CREDIT payment",
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
- Resolve `store_settings` for the store (`invoicePrefix`, `nextInvoiceNumber`); sales remain tax-exclusive.
- Resolve all `product`s referenced in `sale_items`, must belong to the same store and have `status = ACTIVE`, else 404/403.
- If customer_id is present, resolve an ACTIVE customer from the same store; otherwise reject. Existing inactive customers may still receive returns and settlements against their history.
- IN_PROGRESS saves an incomplete draft in draftData without posting effects; completion executes all validations and writes below.

### Validations (reject whole request if any fails, no partial writes)
1. `sale_items` must not be empty; `sale_items.length == total_items`.
2. Every `product_id` in `sale_items` must exist and be unique (no duplicate product in same sale).
3. For each sale_item: `quantity > 0`; if `product.unit_of_measure.allowsFraction == false` then `quantity` must be a whole number.
4. For each sale_item: selected `unit_price * quantity == item_total` at 2-decimal precision. Omitted price uses current product.unitPrice. Snapshot the selected price; never change the product default as a side effect.
5. `sale_type == CREDIT` requires `customer_id` to be present; `sale_type == DEBIT` does not require it.
6. `discount >= 0` and `discount <= subtotal` (computed subtotal, see below).
7. `total_price == totalAmount` after discount and tax, not just the pre-tax subtotal. Compare final money at 2-decimal precision.
8. `total_paid_price == sum of all payments.amount` (2-decimal precision).
9. If `sale_type == DEBIT`: `sum(payments.amount) == total_price` (fully paid, remaining must be 0), 2-decimal precision.
10. If `sale_type == CREDIT`: `sum(payments.amount) <= total_price` (partial or zero payment allowed, remainder goes to customer's ledger).
11. `payments.method` only accepts `CASH` or `BANK` from the client; backend never accepts `CREDIT` as an input method.
12. For each sale_item, stock check: `product.stockQuantity >= quantity`, else reject with insufficient-stock error (identify which product).
13. Payment amounts are positive; a zero-total sale uses no payment or zero-value ledger rows.

### Calculation (per sale_item, then aggregated to sale)
- Determine applicable tax rate for the product: sum of `rate` of all linked `tax_categories` (0 if product has none, i.e. tax free products just carry `taxRate = 0.0`).
- Taxes are always exclusive (added on top of price), there is no tax-inclusive pricing concept.
- This restriction applies to sales only; purchases support inclusive/exclusive invoice prices under use case 9.
- Allocate invoice discount proportionally to pre-discount line values, using stable item order to distribute leftover paisas; allocations sum exactly to discount. Each line: `taxableAmount = unitPrice * quantity - allocated discount`, `taxAmount = round(taxableAmount * taxRate / 100, 2)`, `lineTotal = taxableAmount + taxAmount`. Percentage rates use 18 for 18%.
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
   - soldAt is UTC posting time, including finalized drafts. Normalize offline timestamps before PostgreSQL storage; zone-less synced timestamps are read as UTC and displayed using the store timezone.
3. For each sale_item request entry:
   - Snapshot `productName`, `sku` from product at time of sale.
   - Compute and persist SaleItem with price, discount, tax, and the unitCost/costOfGoodsSold snapshots from use case 12; unknown legacy cost is explicitly flagged, not zero profit.
   - Create StockMovement `type = SALE`, positive quantity, quantity/value/average-cost before/after, description, sale/item, product, user, store.
   - Update product quantity and inventory value atomically.
4. For each payment request entry: create Payment with `direction = INCOMING`, amount, method, references, sale, optional customer, user, store.
5. If `customer` is present on the sale (both DEBIT and CREDIT):
   - Create `LedgerEntry`: `direction = DEBIT`, `type = SALE`, `amount = totalAmount`, `reference_number = invoiceNumber`, `customer`, `sale`. (Full sale amount always recorded as a debit against the customer, for a complete history.)
   - For each payment recorded in step 4: create `LedgerEntry`: `direction = CREDIT`, `type = PAYMENT`, `amount = payment.amount`, `reference_number = invoiceNumber`, `customer`, `sale` (the same sale as the SALE debit, including every split payment).
   - Update `customer.accountBalance += totalAmount - sum(payments.amount)` (net effect equals `remaining`; for a fully-paid DEBIT sale this nets to 0 but the ledger history is preserved).
6. Commit transaction; on any failure roll back everything (no partial stock/ledger/payment writes).

### Response
- Return created `sale` with nested `sale_items`, `payments`, `invoiceNumber`, `totalPaid`, `remaining`, and `customer.accountBalance` whenever a `customer` is attached to the sale (regardless of DEBIT or CREDIT).

### Decisions (previously open questions)
- Duplicate `product_id` within one request: rejected outright (validation #2), no merging — avoids ambiguity/errors from the frontend.
- Sales stay tax-exclusive; purchase invoice tax modes are independent. Tax-free sale products use `taxRate = 0.0`; there is no sales defaultTaxInclusive setting.
- `DEBIT` sales with a `customer_id` do create a `LedgerEntry` (both the SALE debit and PAYMENT credits) for full history, even though net `remaining = 0`.
- Sale-generated ledger entries share `sale_id` for reliable grouping; `reference_number = invoiceNumber` remains a human-readable reference. Bulk uploads require `sale_id` on SALE entries and validate any supplied sale link against the entry's customer and store. Standalone customer payments remain unlinked. Existing unlinked historical entries are not automatically backfilled from invoice references.
- Monetary comparisons use decimal arithmetic at 2-decimal precision, never floating-point epsilons.
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
2. For each original sale item create a reversing stock movement with `type = SALE_RETURN`, original quantity/COGS restored into the current stock pool, original sale/item links, reversalOfMovementId, no return item, and a void description. Recompute weighted average from current value plus restored cost, not old before-state snapshots. This is a void reversal, not an actual return document.
3. If the sale had a customer, reverse its SALE debit with one CREDIT ADJUSTMENT linked through `reversalOfEntryId`. Preserve the original payment entries unless the requested payment treatment explicitly reverses them.
4. Apply the required `paymentTreatment`: `KEEP_AS_ADVANCE` retains actual receipts and leaves customer credit; `REFUND` records actual OUTGOING payments and their DEBIT PAYMENT ledger entries; `VOID_RECORDING` marks erroneous receipts voided and reverses each original PAYMENT entry separately. Never reverse a valid receipt merely because the sale was voided. See use case 8d. For a sale without a customer, KEEP_AS_ADVANCE is not allowed; any real receipt must be refunded or explicitly identified as a recording error.
5. All of steps 1–3 happen in a single transaction; on failure, roll back everything (no partial voids).

### Request (POST /api/sales/{id}/void)
```json
{
  "voidReason": "string, required",
  "paymentTreatment": "KEEP_AS_ADVANCE | REFUND | VOID_RECORDING, required when payments exist",
  "settlements": [
    { "amount": "decimal > 0", "method": "CASH | BANK", "referenceNumber": "string, optional" }
  ]
}
```

### Validations
1. Sale must exist and belong to the current store.
2. Sale must not already be `VOIDED` (voiding twice is rejected).
3. `voidReason` is required and must not be blank — reject with 400 if missing/empty, since it's the only durable explanation of why the reversal happened.
4. Only OWNER may void. Reject drafts/already-voided sales and sales with actual returns. Refund settlements must sum exactly to valid original receipts; KEEP_AS_ADVANCE requires a customer, and VOID_RECORDING requires an explicit recording-error reason.
5. Apply the planned [FBR void/reversal gate](./fbr-integration-plan.md#66-returns-and-void-reversals): accepted fiscal invoices require a verified, separately linked reversal; sending/unknown originals require reconciliation first. A local void alone never cancels an FBR invoice.
6. Fiscal-managed source void is online-gated: obtain backend one-use reservation against canonical state before local stock/payment/ledger reversal. Offline may save a request draft only; cached READY/absence of an FBR ID does not prove backend never sent. Excluded sources retain ordinary offline rules with backend validation.

### Response
- Return the voided `sale` (including `voidReason`, `voidedAt`, `voidedBy`) plus the generated reversing `stock_movements`/`ledger_entries`, and updated `customer.accountBalance` if applicable.

### Offline void (desktop app)
For a proven excluded/non-fiscal source, the planned void writes reversals, payment treatment and aggregates in one native SQLite transaction, then uploads atomically. A fiscal-managed source first needs an online backend reservation against authoritative status, even if the local cached state says never sent; offline permits a request draft only. Once reserved, commit the same atomic local void and upload reservation/operation identity. OWNER authorization is enforced locally and on authenticated backend processing; UI checks alone are insufficient.

### Database guard (`V7__sales_register_integrity`)
The existing guard protects posted sales from financial edits. The planned purchase/return/sync work must extend equivalent integrity checks to every posted surface and permit only validated system-managed return/refund aggregates. A failed business operation rejects the whole operation, not individual rows with partial stock/ledger effects.

## 5c. Get all sales (require auth) — list with filters

All filters are optional and combinable (AND-ed together). Results are always scoped to the authenticated user's `store`.

### Query parameters
- `from`, `to`: UTC datetime range on `soldAt` (inclusive); convert local/store calendar bounds to UTC before querying.
- `saleStatus`: one or more of `COMPLETED`, `IN_PROGRESS`, `VOIDED` (defaults to all except `VOIDED` if not specified, so voided sales don't clutter normal listings unless explicitly requested).
- `saleType`: one or more of `DEBIT`, `CREDIT`.
- `customerId`: sales for a specific customer.
- `userId`: sales made by a specific cashier/staff member.
- `invoiceNumber`: exact match or partial/`contains` match (e.g. `?invoiceNumber=INV-2024`).
- `productId`: sales that contain at least one `sale_item` for this product (joins `sale_items`).
- `paymentMethod`: one or more of `CASH`, `BANK` — sales having at least one valid original receipt with this method; use saleType for credit sales.
- `minTotalAmount`, `maxTotalAmount`: range on `totalAmount`.
- `hasRemaining`: boolean — `true` returns sales with `remaining > 0` (outstanding credit), `false` returns fully settled sales.
- `search`: free-text match across `invoiceNumber` and `customer.name`.
- `page`, `size`: pagination (0-indexed page, default size e.g. 20, max size capped e.g. 100 to avoid abuse).
- `sortBy`: one of `soldAt`, `totalAmount`, `invoiceNumber`, `remaining` (default `soldAt`).
- `sortDir`: `asc` | `desc` (default `desc`, most recent first).

### Validations
1. `from <= to` if both provided.
2. `minTotalAmount <= maxTotalAmount` if both provided.
3. Unknown enum values for `saleStatus`/`saleType`/`paymentMethod` are rejected with 400, not silently ignored.
4. `size` must be in 1–100; reject invalid values consistently locally and on the API.

### Response
- Paginated envelope: `{ content: Sale[], page, size, totalElements, totalPages }`.

### Summary (`GET /api/sales/summary`)
Accepts the same filters as the list and returns totals for every matching sale, not just one page: `saleCount`, `netSales`, `discountTotal`, `taxTotal`, `collected`, `outstanding`, `averageSale` (money totals cover `COMPLETED` sales only), plus `voidedCount`/`voidedAmount` reported separately. Drafts are never included.

### Sales register (desktop app, `/sales`)
The register is the store's sales journal, read from the local synced database so it works offline:
- Lists posted sales only (completed + voided; drafts are bills in progress, not register entries), newest first.
- Filters: search (invoice, customer name/phone), status, period presets (today, yesterday, last 7 days, this/last month, all time, custom range in local time), sale type, payment method, cashier, and "payment due" only.
- Sortable by invoice number, date, total and amount due; paged (10/25/50/100). Filters, sort and page survive opening a sale and coming back.
- A summary strip mirrors `/api/sales/summary` for the current filters.
- Opening a sale shows read-only items, totals, original payments, returns/refunds, cost snapshots, and stock/account audit trails. Actions: **Return items** and OWNER-only **Void sale** when eligible. Both preview stock, money, and balance effects before confirmation.

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

- `accountBalance` is never editable here; it changes only through posted ledger effects from sales, settlements, returns, and reversals.
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

- If accountBalance is zero and the customer has no sales (including drafts/voids), returns, payments, or ledger entries, hard delete is allowed.
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
- `balanceState`: PARTY_OWES_STORE | STORE_OWES_PARTY | SETTLED, same sign convention and owner-facing labels as vendors.
- `minBalance`, `maxBalance`: range on `accountBalance`.
- `page`, `size`: pagination (0-indexed page, default size e.g. 20, max size capped e.g. 100).
- `sortBy`: one of `name`, `accountBalance`, `createdAt` (default `name`).
- `sortDir`: `asc` | `desc` (default `asc`).

### Validations
1. `minBalance <= maxBalance` if both provided.
2. Unknown enum values for `status` are rejected with 400, not silently ignored.
3. `size` must be in 1–100; reject invalid values consistently locally and on the API.

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
1. Create an INCOMING Payment linked to the customer, store, and user, no document allocation.
2. Create a CREDIT PAYMENT LedgerEntry linked to that payment, customer, store, and user.
3. Update `customer.accountBalance -= amount`. Commit all rows in one transaction. Use case 8d also permits OUTGOING customer refunds.

### Response
- Return the created `ledger_entry` and the updated `customer` (with new `accountBalance`).

### Desktop flow and offline persistence
- Selecting a customer opens **Customers → Customer Ledger** directly. The ledger shows the customer's name, phone, NTN, status, and balance on the left with **Edit Customer** on the right; the top-right **Take Payment** action opens the payment form.
- Below the customer information, a **Transactions** table lists every ledger entry for that customer, read from the local synced SQLite database through the customer ledger repository (never the backend), so it works offline and updates live as entries are posted or synced.
  - Columns: date & time, type (Sale, Payment, Sale return, Adjustment), reference number, description (plus void reason when voided), Debit, Credit, running Balance after the entry, and status (Posted/Voided).
  - Running balance is `sum(DEBIT) - sum(CREDIT)` over the customer's full history in posting order (`date_created`, debits before credits at the same instant, then id), including voided originals and their reversals, so it is independent of the active filters/sort and the latest entry matches `accountBalance`.
  - Filters: search (reference, description, or amount), period (all time, today, yesterday, last 7 days, this/last month, custom range in local calendar days), entry type, direction (all/debits/credits), and status (any/posted/voided), with **This month**, **Sales**, **Payments**, and **Voided** quick filters and a reset. Default is all time, newest first.
  - Every column except status is sortable in both directions; ties fall back to posting order. Debit/Credit sorting keeps entries of the other direction last.
  - Paged (10/25/50/100 per page, default 25), with the filtered entry count and filtered Debit/Credit totals. Entries linked to a sale open that sale's detail.
- Ledger back navigation returns to Customers. Editing returns to the ledger after save/cancel unless an explicit originating-screen return URL is provided; payment save/cancel returns to the ledger.
- The payment form shows the current balance and the resulting balance. A resulting customer credit requires explicit confirmation, including when the account was already in credit.
- Save through the native database gateway, even when online: insert the INCOMING payment and its CREDIT/PAYMENT ledger entry, then update the customer's balance in one local SQLite transaction. Never update an invoice's `remaining` or allocate this settlement to a sale.
- The payment ID and its ledger entry ID are the same UUID (in separate tables); `ledger_entries.payment_id` links the two. This is specific to standalone customer settlements.
- PowerSync queues these writes for `POST /api/sync/upload`. The customer-payment bulk service validates the context and creates the canonical ledger entry plus balance effect atomically when accepting the payment, even if its ledger copy arrives in a later upload batch. Both the REST endpoint and uploads use the same posting service.
- Retried uploads acknowledge the original posting without applying its balance effect again or undoing a subsequent void. Client balance patches are ignored by the server. Standalone payment amounts are immutable; deleting them is rejected.
- Deploy migration `V9__customer_account_payments.sql` before the updated desktop client, and reload/restart PowerSync with the updated sync rules so standalone payments download to other store devices.

## 6e. Void customer payment (require auth)

### Design decision: void via reversing entry, same pattern as sale voiding (5b) — never delete or mutate
A payment has a payment record and, when a party is attached, a PAYMENT ledger entry. Deleting or editing amounts would corrupt the audit trail. Recording-error voids post an offsetting entry; actual refunds instead record opposite-direction money movement (use case 8d). The legacy `{ledgerEntryId}` route resolves the linked payment; never guess a payment for historical entries without a reliable link.

1. Mark the original payment and its ledger entry voided with reason/time/user; retain amount/direction/type. The flag is for display, never used to calculate accountBalance.
2. Create a reversing DEBIT ADJUSTMENT linked through reversalOfEntryId to the original incoming payment's CREDIT ledger entry. Preserve its customer/payment identity; no sale allocation for a standalone settlement.
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
4. Only OWNER may void. This endpoint handles standalone payments only; document-linked payment corrections go through document void/return rules so posted invoice totals cannot diverge.

### Response
- Return the voided `ledger_entry` (with `voidReason`, `voidedAt`, `voidedBy`), the generated reversing `ledger_entry`, and the updated `customer` (with new `accountBalance`).
- Each `sale` in the list includes summary fields only (`invoiceNumber`, `soldAt`, `saleType`, `saleStatus`, `totalAmount`, `totalPaid`, `remaining`, `customer.name` if present) — full `sale_items`/`payments` detail is only returned by the single-sale `GET /api/sales/{id}` endpoint (use case handled by existing `getSale`).

## 7. Sales report (require auth)

Generates a printable/exportable report of a store's sales over a date range, in CSV or PDF format, with combinable filters so the report can be narrowed to a single day, a specific customer, a specific product, etc.

### Request (`GET /api/reports/sales-report`)

Query parameters:
- `from_date`: `YYYY-MM-DD`, required — start of the date range (inclusive), compared against `sale.soldAt` in the store's `timezone`.
- `to_date`: `YYYY-MM-DD`, required — end of the date range (inclusive). For a single-day report, send the same value for `from_date` and `to_date`.
- `format`: `CSV | PDF`, required.
- `customerId`: `uuid`, optional — only sales for this customer.
- `userId`: `uuid`, optional — only sales made by this cashier/staff member.
- `saleType`: `DEBIT | CREDIT`, optional.
- `productId`: `uuid`, optional — only sales that contain at least one `sale_item` for this product (joins `sale_items`).
- `paymentMethod`: `CASH | BANK`, optional — only sales having at least one valid original receipt with this method.
- `minTotalAmount`, `maxTotalAmount`: decimal, optional — range on `sale.totalAmount`.
- `invoiceNumber`: string, optional — exact or partial/`contains` match.

All filters are optional except `from_date`, `to_date`, and `format`, and are AND-ed together when combined (same filtering semantics as use case 5c).

### Pre-conditions / lookups
- Resolve `store` from the authenticated user (`404` if the user has no store yet).
- Resolve all `sale`s for the store where `saleStatus == COMPLETED`, `soldAt` falls within `[from_date, to_date]` (in the store's `timezone`), and every supplied filter matches, ordered by `soldAt asc`.
- For each such sale, resolve its `sale_items` (each already snapshots `productName`, `sku`, `unitPrice`, `taxRate`, `taxableAmount`, `lineTotal` at sale time, so the report reads historical values straight off `sale_items` and never recomputes from the current `product`).

### Validations
1. `from_date` and `to_date` must be valid calendar dates, and `from_date <= to_date` (`400 Bad Request` otherwise).
2. `format` must be `CSV` or `PDF` (`400 Bad Request` for any other value).
3. Authenticated user must have a store (`404 Not Found` otherwise). Any role (`OWNER` or `CASHIER`) may request the report.
4. `minTotalAmount <= maxTotalAmount` if both provided; unknown enum values for `saleType`/`paymentMethod` are rejected with `400`, not silently ignored (same rules as use case 5c).
5. No sales matching the date range/filters is not an error — the report is still generated with an empty sales table and all totals at `0.00`.

### Report layout

**Header (store info + report metadata), always at the top:**
- Store `name`, `ntn`, `address`.
- Report name: `"Sales Report"`.
- Report date range: `from_date` to `to_date` (the days whose transactions are included).
- Printing date: current server date/time at generation.

**Applied filters section, shown only if at least one optional filter was supplied:**
- One line per filter that was actually sent in the request (e.g. `Customer: <name>`, `Cashier: <name>`, `Sale type: CREDIT`, `Product: <name>`, `Payment method: BANK`, `Total amount: <min> - <max>`, `Invoice number: <value>`).
- Omitted entirely (no heading, no empty section) when no optional filter is applied, to keep a plain date-range report clean.

**Sales table**, one block per sale, each block:
- Sale summary row: `#` (1-based row index across sales in the report), `invoiceNumber`, `customer name` (blank if no customer attached).
- One indented sub-row per sale item: pctCode, product name, quantity, snapshotted unit price, allocated discount, taxableAmount after discount, taxRate as a percentage, stored taxAmount, and lineTotal. Never recompute historical tax from current product settings.
- No sub-total line per sale — the sale's own `sales.taxableAmount`/`sales.taxAmount`/`sales.totalAmount` columns are not repeated per block, only the grand totals below matter for this report.

**Grand totals row/section, after the last sale block:**
- `total items`: count of sale-item rows, not quantity units; any quantity totals are grouped by unit of measure.
- `total taxable amount`: sum of `sale_item.taxableAmount` across all included sales.
- `total discount`: sum of `sale.discountAmount` across all included sales.
- `total tax`: sum of `sale_item.taxAmount` across all included sales (must equal sum of `sale.taxAmount`).
- `grand total`: sum of `sale.totalAmount` across all included sales.

### Response
- `200 OK` with the file as the response body.
- `Content-Type`: `text/csv` for `format=CSV`, `application/pdf` for `format=PDF`.
- `Content-Disposition: attachment; filename="sales-report-<from_date>_to_<to_date>.csv|pdf"`.
- No JSON envelope — the report file is the entire response body.

## 8. Create vendor (require auth)

### Request (`POST /api/vendors`)
```json
{
  "name": "string, required, unique per store",
  "phoneNumber": "string, optional, globally unique within vendors",
  "ntn": "string, optional",
  "strn": "string, required when REGISTERED",
  "salesTaxRegistrationStatus": "REGISTERED | UNREGISTERED, default UNREGISTERED",
  "address": "string, optional"
}
```

### Validations
1. Name must not be blank and must be unique within the store, using the same normalization as customer names.
2. Provided phone numbers use the customer normalization/uniqueness rules, but vendor and customer uniqueness are independent.
3. REGISTERED requires a nonblank STRN; an NTN alone never implies sales-tax registration. This records supplied information, not a claim of live FBR verification.
4. Resolve store from the authenticated user; never accept initial balance or status from the request.

### Write steps
1. Create Vendor with supplied identity, `accountBalance = 0.0`, `status = ACTIVE`, and store.
2. Commit locally and queue the operation for upload.

### Response (`201 Created`)
Return the created vendor, including signed accountBalance plus `balanceAmount` (absolute amount) and `balanceState = PARTY_OWES_STORE | STORE_OWES_PARTY | SETTLED` for owner-facing labels.

## 8a. Update vendor (require auth)

### Request (`PATCH /api/vendors/{id}`)
Same editable identity fields as create, plus optional `status = ACTIVE | IN_ACTIVE`. Omitted fields are unchanged; nullable identity fields may explicitly be cleared subject to the registration rule.

### Validations
1. Vendor belongs to the current store; otherwise 404/403.
2. Apply name/phone uniqueness and STRN validation to the resulting record.
3. Never accept accountBalance. Historical purchases keep their original vendor/tax snapshots.
4. As with customer PATCH, status changes only affect visibility/new documents, not history or balances. An inactive party remains available for settling an existing account and processing returns.

### Response (`200 OK`)
Return updated vendor and the balance display fields from use case 8.

## 8b. Delete vendor (require auth)

### Request (`DELETE /api/vendors/{id}`)
No body.

### Validations and write steps
1. Resolve the store-scoped vendor.
2. If accountBalance is nonzero, reject with `409` and show who owes whom; never write off a balance on delete.
3. If zero balance and no purchases (including drafts/voided), returns, payments, or ledger entries, hard delete.
4. Otherwise deactivate only. History and financial rows stay intact.

### Response
- `204 No Content` for hard delete.
- `200 OK` with inactive vendor and a history-preservation message for soft delete.

## 8c. Get vendors and account history (require auth) — list with filters

### Request (`GET /api/vendors`)
- `search`: name, phoneNumber, ntn, strn.
- `status`: ACTIVE or IN_ACTIVE, defaults to ACTIVE.
- `salesTaxRegistrationStatus`: REGISTERED or UNREGISTERED.
- `hasBalance`: true for nonzero, false for settled.
- `balanceState`: PARTY_OWES_STORE, STORE_OWES_PARTY, SETTLED.
- `minBalance`, `maxBalance`: signed accountBalance range; UI translates owner-friendly choices to this convention.
- `page`, `size`: defaults 0/20, maximum size 100.
- `sortBy`: name, accountBalance, createdAt; default name.
- `sortDir`: asc or desc; default asc.

### Validations
Shared list rules apply; `minBalance <= maxBalance`. Results never include another store's vendors.

### Response (`200 OK`)
`{ content: Vendor[], page, size, totalElements, totalPages }`, including explicit balance display fields.

### Vendor detail (`GET /api/vendors/{id}`)
Return identity, balance, and links/counts for purchase/payment/return history. Do not embed an unbounded ledger.

### Account ledger (`GET /api/vendors/{id}/ledger`, `GET /api/customers/{id}/ledger`)
- Filters: `from`, `to` on occurredAt; direction; one or more ledger types; saleId or purchaseId as appropriate; returnId; paymentId; `voided`; `isReversal`; referenceNumber; search across reference/description; minAmount/maxAmount.
- Pagination 0/20, max 100; sortBy occurredAt, amount, type, referenceNumber; default occurredAt desc, with stable ID tie-breaker.
- Return paginated entries with original/reversal links and document/payment references.
- `GET .../{id}/ledger/summary` returns unfiltered current accountBalance and period opening/closing balances, plus filtered debit/credit totals. Opening/closing balances include all entries before/through the requested period, not only rows matching type/search filters.
- Account balances always include originals and their reversals. A display filter excluding voided originals is never used to calculate the actual balance.
- Party detail pages read local SQLite, preserve filters on navigation, show balances in words, and provide the same customer/vendor create, edit, deactivate/reactivate, history, and payment actions.

## 8d. Record a customer/vendor settlement (require auth)

Extends use case 6d to both directions and both party types. Standalone settlements are against the account as a whole, not an invoice allocation. Accordingly, invoice `remaining` is the original invoice's unallocated amount, not a claim that a later account payment was never made.

### Request (`POST /api/vendors/{id}/payments`, `POST /api/customers/{id}/payments`)
```json
{
  "direction": "INCOMING | OUTGOING, required; legacy customer requests without it mean INCOMING",
  "amount": "decimal > 0, required",
  "method": "CASH | BANK, required",
  "referenceNumber": "string, optional",
  "description": "string, optional"
}
```

### Validations
1. Party exists in the current store. Inactive parties may settle existing balances.
2. Amount is positive; method/direction valid. No synthetic CREDIT payments.
3. Advances/overpayments are allowed both ways; preview the resulting balance and explicitly confirm crossing zero.

### Write steps (one transaction)
1. Create Payment with store, user, selected customer/vendor, direction and actual cash/bank details.
2. Create linked PAYMENT ledger entry:
   - INCOMING money: CREDIT, accountBalance decreases.
   - OUTGOING money: DEBIT, accountBalance increases.
3. Update party balance and queue the operation.

### Examples
- Buy on credit for Rs 1,000: vendor CREDIT PURCHASE, balance -1,000, display **You owe vendor Rs 1,000**.
- Pay vendor Rs 600: OUTGOING payment / DEBIT ledger, balance -400.
- Pay vendor another Rs 500: balance +100, display **Vendor owes you Rs 100** (advance).
- Vendor returns that advance: INCOMING payment / CREDIT ledger, balance 0.
- Customer overpays: INCOMING payment / CREDIT ledger creates customer credit; an OUTGOING refund / DEBIT ledger settles it.

### Response (`201 Created`)
Return payment, ledger entry, updated party, and balance display fields.

### Payment list (`GET /api/payments`)
Store-scoped filters: from/to, customerId, vendorId, saleId, purchaseId, returnId, userId, direction, method, voided, minAmount/maxAmount, search across reference/description. Customer and vendor filters are mutually exclusive. Sort by occurredAt (payment createdAt), amount, direction, or method; default newest first; same pagination/validation rules. `GET /api/payments/{id}` returns the payment and linked ledger/document/reversal audit.

## 8e. Void a standalone settlement (require auth, OWNER only)

### Request (`POST /api/payments/{paymentId}/void`)
Vendor-scoped alias: `POST /api/vendors/{id}/payments/{paymentId}/void`. The existing customer route in 6e remains an explicit ledger-entry-ID adapter to the linked payment; do not ambiguously interpret the same route parameter as either ID type.
```json
{
  "voidReason": "string, required, explains a recording error"
}
```

### Validations
1. Payment belongs to this party/store, is standalone, and is not already voided/reversed.
2. Nonblank reason and OWNER authorization required.
3. If money actually moved and is now being returned, record an opposite-direction settlement instead. A void is a correction of an erroneous recording, not a hidden real refund.
4. Document-linked payment changes must use the document's void/return workflow; no mutation of completed invoice amounts.

### Write steps
1. Mark payment and its original PAYMENT ledger entry voided with reason/time/user, retaining original amounts and directions.
2. Append one ADJUSTMENT ledger entry with the opposite direction, same amount/party, and `reversalOfEntryId`.
3. Apply that reversing entry to accountBalance. No fictitious cash/bank payment is created for a recording error.
4. Commit all audit rows and effects together. Original and reversal both remain in balance reconstruction.

### Response (`200 OK`)
Return marked original payment/entry, reversal entry, and updated party.

## 9. Create purchase (require auth)

Uses the same cart/form pattern as sale: select products, quantities, prices, discount, party, split cash/bank payments, paid-in-full/pay-later, draft, receipt, and confirmation. Differences: Vendor replaces Customer; purchase costs are explicitly entered; stock increases; purchase tax follows the supplier invoice; owner-facing payable labels reverse.

### Request (`POST /api/purchases`)
```json
{
  "purchaseType": "DEBIT | CREDIT, required",
  "purchaseStatus": "COMPLETED | IN_PROGRESS, default COMPLETED",
  "vendorId": "uuid, required for CREDIT, optional for DEBIT",
  "supplierInvoiceNumber": "string, optional",
  "supplierInvoiceDate": "YYYY-MM-DD, optional",
  "supplierIdentity": {
    "name": "string, optional for anonymous paid purchases",
    "ntn": "string, optional",
    "strn": "string, required for REGISTERED invoice evidence",
    "address": "string, optional",
    "salesTaxRegistrationStatus": "REGISTERED | UNREGISTERED, defaults UNREGISTERED without evidence"
  },
  "description": "string, optional",
  "discount": "decimal >= 0, default 0; exclusive-basis invoice discount",
  "freightAmount": "decimal >= 0, default 0",
  "handlingAmount": "decimal >= 0, default 0",
  "purchaseItems": [
    {
      "productId": "uuid, required",
      "quantity": "decimal > 0, required",
      "unitPrice": "decimal >= 0, required, up to 6 decimals",
      "taxMode": "EXCLUSIVE | INCLUSIVE | NO_SEPARATE_TAX, required",
      "taxBasis": "TRANSACTION_VALUE | RETAIL_PRICE | OTHER_DOCUMENTED, required",
      "taxRate": "percentage, optional when explicit invoice tax is supplied",
      "includedTaxAmount": "decimal >= 0, pre-discount tax embedded in an inclusive quote; required for explicit/non-ordinary inclusive tax without a usable ordinary rate",
      "taxBase": "decimal >= 0, required for non-transaction-value bases",
      "taxAmount": "decimal >= 0, optional explicit final supplier-invoice amount",
      "taxDetails": "optional structured invoice tax components and evidence",
      "inputTaxTreatment": "NON_RECOVERABLE | RECOVERABLE | PARTIALLY_RECOVERABLE, default NON_RECOVERABLE",
      "recoverableTaxAmount": "decimal >= 0, default 0",
      "taxTreatmentReason": "string, required for recoverable treatment",
      "itemTotal": "decimal, required when posting, validation only"
    }
  ],
  "payments": [
    { "amount": "decimal > 0", "method": "CASH | BANK", "referenceNumber": "string, optional", "description": "string, optional" }
  ],
  "totalItems": "integer, required when posting, validation only",
  "totalPrice": "decimal, required when posting, validation only",
  "totalPaidPrice": "decimal, required when posting, validation only"
}
```

### Pre-conditions / lookups
Resolve store, settings, active products with units of measure, optional active vendor, current stock valuation, and invoice-time store/vendor tax identities. A purchase without a selected vendor is an anonymous paid purchase, not an invented reusable vendor account; supplierIdentity supplies its invoice evidence. With a selected vendor, use vendor identity for snapshots and reject contradictory supplierIdentity rather than silently changing the vendor.

### Validations (reject whole operation, no partial writes)
1. Posted purchase has at least one item; product IDs are unique and belong to the store; quantities respect allowsFraction.
2. Price/discount/charges are non-negative. Discount cannot exceed the exclusive subtotal. Zero-cost goods require explicit zero, not a missing cost.
3. CREDIT requires a vendor. DEBIT may omit the vendor but must be paid in full.
4. For DEBIT: payment sum equals computed totalAmount; for CREDIT: payment sum is at most totalAmount. Payments are positive CASH/BANK amounts. A zero-total document needs no payment.
5. Compare every supplied validation total to the recomputed value at the specified precision; never trust client totals.
6. A nonblank supplier invoice number must be unique for this store/vendor, including voided purchases. If no vendor is selected, warn on matching anonymous reference/date/total but do not pretend this is reliable identity-based deduplication.
7. Validate tax modes/bases and treatment under 9d. Unknown-valued positive stock must first receive an audited opening valuation before a purchase changes its weighted average.
8. New purchases do not change product selling price. A selling-price change uses the normal explicit product update.
9. Freight/handling here are supplier-billed, non-recoverable charges included in supplier payable. Third-party freight bills, charge tax breakdowns, income-tax withholding and import/customs workflows are deferred; do not silently add a third party's bill to vendor balance.

### Calculation
1. Normalize each quoted unit price to an exclusive pre-discount line value using its tax mode (9d). Save the original quote and invoice tax evidence.
2. `subtotal = sum(exclusive pre-discount line values)`. Allocate invoice discount proportionally across lines; assign paisa remainders in stable request order. Sum of allocations must equal discount.
3. For ordinary percentage tax: `taxableAmount = exclusive line value - allocated discount`; `taxAmount = round(taxableAmount * taxRate / 100, 2)`.
4. Explicit final invoice tax and RETAIL_PRICE/OTHER_DOCUMENTED bases preserve the supplier's documented amount; never automatically reduce retail-price tax by a purchase discount. A mismatch with a supplied ordinary rate/base requires explanation in taxDetails and explicit amount confirmation, not a silent override.
5. Line `lineTotal = taxableAmount + taxAmount`. Sum lines to header taxableAmount/taxAmount; `totalAmount = sum(lineTotal) + freightAmount + handlingAmount`.
6. Allocate freight/handling by discounted exclusive line value; if all such values are zero, allocate by quantity. Stable order absorbs rounding remainder; allocations must sum exactly to each charge.
7. `nonRecoverableTaxAmount = taxAmount - recoverableTaxAmount`.
8. `inventoryCost = taxableAmount + nonRecoverableTaxAmount + freightAllocation + handlingAllocation`. `unitCost = inventoryCost / quantity` at 6 decimals.
9. `totalPaid = sum(payments.amount)`, `remaining = totalAmount - totalPaid`. Keep the original invoice remainder separate from the vendor's account balance after later standalone payments.

### Transactional write steps
1. On posting, allocate the internal invoiceNumber from purchase settings and increment the sequence once. Drafts have no posted invoice number.
2. Create Purchase with totals, UTC purchasedAt, currency, vendor/store tax snapshots and supplier reference/date; save item price/discount/tax/cost snapshots.
3. For each item create PURCHASE stock movement, increase stock, and update weighted-average valuation (use case 12).
4. Create OUTGOING cash/bank Payment rows for money actually paid, with purchase and optional vendor links.
5. If a vendor is present, even on DEBIT:
   - CREDIT PURCHASE ledger for full totalAmount.
   - DEBIT PAYMENT ledger for each payment, linked to the exact payment.
   - `vendor.accountBalance -= totalAmount - totalPaid`.
6. With no vendor, create no party ledger; retain purchase, payment, and inventory history.
7. Commit all rows, aggregates, sequence, and upload intent in one SQLite transaction; upload idempotently as one business operation.

### Response (`201 Created`)
Purchase with items, payments, internal/supplier references, totalPaid, remaining, cost/tax breakdown, and updated vendor balance/display when attached. Locally show **Saved on this device / Pending sync** until backend acknowledgement, not a claim of server confirmation.

## 9a. Update purchase / save draft (require auth)

### Request (`PUT /api/purchases/{id}`) — IN_PROGRESS only
Full replacement using create shape. `purchaseStatus = COMPLETED` finalizes through all posting validations.

### Validations and write steps
- Drafts may be incomplete and do not require stock/cost/tax posting checks until completion; structurally invalid IDs/enums/negative inputs are still rejected.
- Saving a draft writes no stock movement, inventory valuation, actual payment, ledger entry, or invoice counter change. Proposed payment details are draft data only.
- Completion revalidates current product/vendor status, costs, tax, and payments, and posts exactly once.
- COMPLETED financial/identity fields are immutable. Only internal description and payment reference/description typos may be patched; never amount, method, party, invoice identity, quantities, cost, tax, or purchasedAt.
- VOIDED is read-only. Corrections use void + recreate if eligible, otherwise an actual purchase return and a new corrected purchase.
- `DELETE /api/purchases/{id}` removes an unposted draft only; it never deletes a posted purchase.

### Response (`200 OK`)
Return updated draft/posted document and sync status.

## 9b. Void purchase (require auth, OWNER only)

### Request (`POST /api/purchases/{id}/void`)
Same reason/payment-treatment shape as sale void: KEEP_AS_ADVANCE, REFUND, or VOID_RECORDING; REFUND on a purchase means actual money received back from the supplier.

### Validations
1. Purchase belongs to the store, is COMPLETED, has no actual returns, and has not already been voided.
2. Require reason and OWNER. For each product there must be enough stock and the original purchase must be its latest quantity/value-affecting event (12). Otherwise reject with `409` and explain that an actual purchase return is needed.
3. KEEP_AS_ADVANCE requires a vendor. REFUND payments must equal original valid payments, use CASH/BANK, and be INCOMING. VOID_RECORDING requires an actual recording-error explanation.
4. Anonymous paid purchases require REFUND or VOID_RECORDING; no unowned account credit.
5. Ordinary vendor purchases use EVIDENCE_ONLY: a local void does not cancel the vendor's FBR invoice and makes no outbound call. Only an explicitly supported special purchase profile applies the [FBR void/reversal gate](./fbr-integration-plan.md#66-returns-and-void-reversals); preserve vendor evidence separately.

### Transactional write steps
1. Mark purchase VOIDED with audit fields.
2. Append PURCHASE_RETURN movements referencing each original PURCHASE movement, no return document, restore exact pre-purchase quantity/value/average snapshots.
3. If vendor exists, reverse original PURCHASE credit with a DEBIT ADJUSTMENT linked through reversalOfEntryId.
4. Handle payments explicitly:
   - KEEP_AS_ADVANCE retains valid OUTGOING payments/DEBIT ledger entries, leaving a vendor advance.
   - REFUND creates INCOMING payments/CREDIT ledger entries.
   - VOID_RECORDING marks each erroneous payment and reverses its DEBIT entry with a CREDIT ADJUSTMENT.
5. Update inventory and vendor aggregates, append audit, and commit/upload atomically. Never delete history or fabricate a real refund.

### Response (`200 OK`)
Voided purchase, stock/ledger reversals, payment treatment effects, and updated vendor balance.

## 9c. Get purchases / purchase register / report (require auth)

### Request (`GET /api/purchases`)
- `from`, `to`: UTC purchasedAt range.
- `purchaseStatus`: one or more COMPLETED, IN_PROGRESS, VOIDED; defaults to all except VOIDED.
- `purchaseType`: DEBIT or CREDIT.
- `vendorId`, `userId`, `productId`: exact matches; productId means a purchase containing that product.
- `invoiceNumber`, `supplierInvoiceNumber`: contains matches.
- `supplierInvoiceFrom`, `supplierInvoiceTo`: supplier invoice date range, separate from posting dates.
- `paymentMethod`: CASH or BANK, matching valid original OUTGOING payments.
- `hasRemaining`: true for original invoice remaining > 0, false for zero; label **Invoice amount unallocated**, not current vendor debt.
- `hasReturns`: whether an actual return exists.
- `taxMode`, `inputTaxTreatment`: purchases containing at least one matching line.
- `minTotalAmount`, `maxTotalAmount`.
- `search`: internal/supplier invoice number and vendor name/phone.
- `page`, `size`: 0/20, max 100.
- `sortBy`: purchasedAt, totalAmount, invoiceNumber, supplierInvoiceDate, remaining; default purchasedAt.
- `sortDir`: asc or desc; default desc; stable ID tie-breaker.

### Validations
Shared list rules apply, including supplier date range and amount min/max. Filters have identical SQLite/API semantics.

### Response (`200 OK`)
`{ content: Purchase[], page, size, totalElements, totalPages }`; list contains summaries, not all child rows.

### Purchase detail (`GET /api/purchases/{id}`)
Read-only items and supplier identity/reference snapshots, discounted prices, tax treatment, allocated costs, payments, returns/refunds, vendor balance, and complete movement/ledger audit. Draft detail is editable under 9a.

### Summary (`GET /api/purchases/summary`)
Same filters, across all matches rather than current page: purchaseCount, purchasesExcludingTax, discountTotal, taxTotal, recoverableTaxRecorded, nonRecoverableTaxTotal, freightTotal, handlingTotal, totalPurchases, paidAtPurchase, invoiceUnallocated, averagePurchase; completed documents only. Report voidedCount/voidedAmount separately; never count drafts. Show actual purchase returns and vendor refunds separately, not by removing original purchase rows.

### Purchase register (desktop app, `/purchases`)
- Local, offline-readable purchase journal, same layout/navigation behavior as sales register.
- Posted completed/voided documents only; drafts appear in the purchase form's draft list.
- Period presets in store timezone, search, vendor, cashier, type/status/payment/tax/return filters, sortable columns, 10/25/50/100 page sizes, remembered navigation state.
- Summary strip uses identical filters; due amounts are labeled as original invoice unallocated amounts. Show **You owe vendor / Vendor owes you** from the current vendor account separately.
- Reuse sale cart/receipt UX, but display **Purchase / Vendor / Paid to vendor / Purchase cost / Stock received**. Do not copy customer-debt wording into purchases.
- Actions: Return items, and OWNER-only eligible Void purchase. Show movement/balance/valuation/payment preview.

### Purchase report (`GET /api/reports/purchase-report`)
Mirror use case 7: required from_date/to_date in store timezone, format CSV/PDF, optional purchase list filters, same range/enum validations, empty results still produce a report.
- Header: store identity, report name, dates, printing time; applied filters only when supplied.
- Per purchase: internal invoice, supplier invoice/date, vendor; per item: product, quantity, quoted price/mode, discount, exclusive value, tax, recoverable/non-recoverable split, allocated charges, inventory unit cost and line payable.
- Totals: completed purchase count, item-line count, quantity shown per unit of measure (never add kg and pieces), exclusive value, discount, tax splits, charges, gross total, paid-at-purchase and invoice-unallocated amounts.
- Separate return and cash-refund totals with the return/refund event dates; distinguish gross purchases from purchases net of returns.
- File response uses the sales report Content-Type/Content-Disposition pattern, filename purchase-report-<from_date>_to_<to_date>.csv|pdf. Local CSV/PDF generation must work offline; the API is an equivalent online export, not a prerequisite.
- Sales reports likewise expose return/refund totals separately by event date without changing original invoice rows.

## 9d. Purchase tax handling — Pakistan

### Invoice entry rules
1. EXCLUSIVE: quote excludes tax; add documented tax to discounted exclusive value.
2. INCLUSIVE: quote includes tax; do not add it a second time. With an ordinary rate r, exclusive pre-discount value = quoted gross / (1 + r/100). For explicit/non-ordinary invoice tax, require includedTaxAmount for the tax embedded in that pre-discount quote; exclusive pre-discount value = quoted gross - includedTaxAmount. Never subtract the final discounted tax from a pre-discount gross quote. Show and validate the breakdown.
3. NO_SEPARATE_TAX: taxAmount and recoverableTaxAmount must be zero. Entire discounted price is inventory cost before charges. This describes invoice entry, not a legal assertion that the goods are exempt or zero-rated.
4. For ordinary INCLUSIVE percentage quotes with an exclusive-basis discount D: derive exclusive pre-discount value from gross/(1+r/100), subtract D, then compute final tax. The UI must explain that invoice discount is entered exclusive of tax; a supplier's different discount presentation must be normalized before confirmation.
5. RETAIL_PRICE/OTHER_DOCUMENTED: require documented taxBase, explicit taxAmount, and evidence/explanation. Preserve tax components in taxDetails; do not assume tax is a simple sum of product tax-category rates or a percentage of discounted purchase price.
6. Snapshot invoice values. Later tax category, supplier registration, or store registration changes never recalculate posted purchases.
7. A tax invoice must preserve supplier identity/STRN and invoice reference/date. Anonymous fully paid purchases may record supplied supplier identity as a snapshot even without creating a vendor account.
8. UNREGISTERED suppliers must not be presented as charging ordinary separately collectible sales tax. Third Schedule embedded/printed tax evidence is a distinct documented case, not automatic eligibility for input credit.

### Recoverability and inventory cost
- Default to NON_RECOVERABLE; both the store and supplier must be recorded REGISTERED with STRN before ordinary recoverable treatment is accepted.
- RECOVERABLE requires recoverableTaxAmount = taxAmount. PARTIALLY_RECOVERABLE requires 0 < recoverableTaxAmount < taxAmount. NON_RECOVERABLE requires zero. Always require invoice evidence/reference/date and a treatment reason for recoverable amounts.
- Store registration updates use OWNER-only `PATCH /api/store` with salesTaxRegistrationStatus/strn; registered status requires STRN. Existing NTN is not replaced.
- These checks record an accounting classification, not legal verification or an automatic return claim. Eligibility can depend on invoice validity, use of goods, supplier status, payment requirements, restrictions, applicable schedules/SROs and current law.
- Recoverable tax is recorded separately, excluded from inventory valuation, and reversed proportionally on returns. Non-recoverable tax is included in inventory cost.
- If eligibility is unknown, record NON_RECOVERABLE and flag the evidence for review. A later reclassification requires an explicit OWNER-audited correction with tax and valuation effects; never silently edit a posted item. Automated reclassification/filing is deferred.
- Do not hardcode 18% across all goods. Example only: Rs 1,000 exclusive + 18% = Rs 1,180 payable; Rs 1,180 inclusive at 18% contains Rs 180 tax. Cost is Rs 1,180 if none is recoverable, or Rs 1,000 if all Rs 180 is eligible and classified recoverable, before charges.

### Local-market scope and sources
Support ordinary registered-supplier tax invoices, informal/no-separate-tax bills, inclusive quotes, and documented printed-retail-price goods. No blanket answer of "all purchases include tax" or "always add tax" is correct.

Sources consulted for this design:
- [FBR: Sales Tax Basics](https://www.fbr.gov.pk/sales-tax/51148/101149) explains input/output tax and the distinction between goods, imports and exemptions.
- [FBR: Sales tax to be recovered only if the supplier is registered](https://www.fbr.gov.pk/sales-tax--to-be-recovered-only-if-the-supplier-is-registered/132123) distinguishes STRN from NTN and explains manufacturer/importer tax on Third Schedule goods bearing printed retail price and tax.
- [FBR: Sales Tax Act archive](https://www.fbr.gov.pk/categ/sales-tax-act/301) is the official legislation reference. The version directly exposed during this research was amended through 7 May 2024, not a verified October 2026 consolidation. Confirm subsequent Finance Acts/SROs and the applicable sections on input tax, invoices and payment conditions with a Pakistani tax adviser before compliance implementation.

Purchase entry is not submission of the store's own sales invoice to FBR. Under the [current direct DI design](./fbr-integration-plan.md), ordinary purchases and purchase returns retain supplier FBR invoice/adjustment evidence as EVIDENCE_ONLY; no generic purchase POST or guessed sales payload. The documented cotton-ginner/sector exceptions require separately certified issuer/credential/payload rules. Live validation, input-tax return filing, current-law eligibility automation, provincial service taxes, further/extra tax rules, withholding, and import duties require separate compliance work.

## 10. Return sold/purchased goods (require auth)

An actual return reverses some/all of a real transaction. It is not a void of an erroneous document. Preserve the original completed invoice and use original price, discount, tax and identity snapshots, not today's product price or tax configuration.

### Request (`POST /api/sales/{id}/returns`, `POST /api/purchases/{id}/returns`)
```json
{
  "reason": "string, required",
  "supplierCreditNoteNumber": "string, optional, purchase returns only",
  "items": [
    {
      "originalItemId": "uuid, required",
      "quantity": "decimal > 0, required",
      "restock": "boolean, required for sale returns; false for purchase returns"
    }
  ],
  "settlementType": "ACCOUNT_CREDIT | IMMEDIATE_SETTLEMENT | MIXED, required",
  "settlements": [
    { "amount": "decimal > 0", "method": "CASH | BANK", "referenceNumber": "string, optional" }
  ]
}
```

### Validations
1. Original document belongs to the store, is COMPLETED, and is not voided. Return type/party/product must match the original document.
2. At least one unique original item; quantity respects unit of measure. Cumulative posted returned quantity may not exceed original quantity, including damaged non-restocked returns.
3. Compute the price/discount/tax share from immutable original item amounts, proportional to quantity. Last remaining return receives the exact remaining paisas so cumulative refunds and tax reversals cannot exceed originals.
4. A purchase return requires enough physical stock and known current valuation. A damaged sale return with restock=false does not add sellable stock.
5. ACCOUNT_CREDIT requires the original customer/vendor and no money movement. IMMEDIATE_SETTLEMENT requires payment sum equal return total; MIXED requires a positive payment sum below the total and an original party for the retained account portion.
6. For a customer sale return, refund only available customer credit after applying the return. An unpaid invoice return first reduces debt; it does not automatically refund money never received. Purchase-return incoming settlements similarly cannot exceed the amount the vendor owes after applying the return. Show the whole-account calculation because standalone settlements are unallocated.
7. If the original document has no party, only full immediate settlement is allowed. It was fully paid originally; refund/receipt is recorded without inventing an account.
8. Tax reversal uses original recoverability and invoice amounts. Purchase freight/handling are not automatically refunded; in this version they are not credited on a goods return. If a supplier credits such charges, record a separately specified future charge-credit workflow rather than silently changing item refunds.
9. Preview quantities, money, account balance, tax reversal, stock value, and any cost variance; require confirmation.

### Transactional write steps — sale return
1. Allocate return invoice number, create immutable SALE_RETURN header/items with original sale/item links, reason and allocated original monetary amounts.
2. If a customer exists, create CREDIT SALE_RETURN ledger for return total; decrease customer.accountBalance.
3. For restock=true, append SALE_RETURN stock movement and add quantity at original sale-item unitCost/COGS allocation, not current purchase price. This restores the returned inventory cost and reverses that portion of COGS.
4. For restock=false, create no stock movement and do not reverse COGS: the returned goods are not sellable inventory. Keep return quantity/reason for audit; do not also write off the same cost a second time.
5. For an actual refund create OUTGOING payments and, with a customer, DEBIT PAYMENT entries; increase balance accordingly.
6. Update original totalReturned/totalRefunded as system-managed aggregates. Do not rewrite original quantities, prices, totalPaid, or invoice remaining.

### Transactional write steps — purchase return
1. Create PURCHASE_RETURN header/items, original purchase/item links, credit-note reference and original proportional monetary/tax values.
2. If a vendor exists, create DEBIT PURCHASE_RETURN ledger for return total; increase vendor.accountBalance.
3. Append PURCHASE_RETURN stock movement removing quantity at current weighted-average carrying cost. Snapshot the original acquisition-cost credit and the variance separately (12).
4. Reverse the original recoverable input-tax portion. Non-recoverable tax is part of the original acquisition-cost credit; no automatic freight/handling credit.
5. Money actually received from vendor creates INCOMING payment and, with a vendor, CREDIT PAYMENT ledger, decreasing balance.
6. Update original returned/refunded aggregates only. Commit every stock, valuation, tax, payment and ledger effect together locally, then upload atomically.

### Response (`201 Created`)
Return document/items, money settlements, tax/cost effects, movements, ledger entries, updated product values, and updated party balance/display.

## 10a. Get returns / return detail (require auth)

### Request (`GET /api/returns`)
- `from`, `to` on returnedAt; `type` SALE_RETURN/PURCHASE_RETURN.
- `saleId`, `purchaseId`, `customerId`, `vendorId`, `productId`, `userId`.
- `settlementType`, `paymentMethod`, `restock`, minTotalAmount/maxTotalAmount.
- `search` across return/internal original/supplier invoice number, reason, party name and supplier credit-note number.
- `page`, `size`: 0/20, max 100.
- `sortBy`: returnedAt, invoiceNumber, totalAmount; default returnedAt desc with stable ID tie-breaker.
- Reject incompatible filters (e.g. customerId with PURCHASE_RETURN); all shared range/enum rules apply.

### Response (`200 OK`)
Paginated summaries. `GET /api/returns/{id}` returns full original-document links, returned items, tax/cost snapshots, payment and ledger audit.

### Summary (`GET /api/returns/summary`)
Same filters, all matching rows: saleReturnCount/amount, purchaseReturnCount/amount, actualCustomerRefunds, actualVendorRefunds, retainedAccountCredits, recoverableTaxReversed, and costVariance. Never combine opposite-direction refunds into one unlabeled total.

### Correction policy
Posted returns are immutable. Correct mistakes with a compensating sale/purchase using optional correctionOfReturnId in the create request and normal money settlement, OWNER confirmed; the link must match return type, original party and store. Retain the original return and its consumed return allowance. This is not a return-void endpoint and must not silently reopen original return quantities. Where the intended correction cannot be represented by those ordinary documents, stop and require an audited future correction workflow, not manual deletion.

## 11. Inventory — all product-level stock movements (require auth)

### Page (`/inventory`)
Dedicated local-first inventory journal for every product movement: purchases, sales, actual returns, document void reversals, opening stock and manual adjustments. Also link each product's stock/valuation history from product detail.

- Columns: posting time, product/name/SKU/barcode/unit, movement label, quantity in, quantity out, before/after quantity, unit cost, signed value change, before/after value, source invoice/return, customer/vendor, staff, reason/description, reversal indicator, sync status.
- Label **Sale return** versus **Sale void reversal**, and **Purchase return** versus **Purchase void reversal**, even though each pair shares an enum; use reversalOfMovementId, not description parsing.
- Opening a source document shows its immutable detail. Manual adjustments show their audit and have no customer/vendor ledger effect.
- Include inactive products in historical movement results by default. No direct movement editing/deleting; new OWNER adjustment needs reason and previews quantity/value changes.
- Filters/sort/page persist across navigation; presets use store timezone; all querying/export works offline.

### Request (`GET /api/stock-movements`)
- `from`, `to`: UTC occurredAt range.
- `productId`, `unitOfMeasureId`.
- `type`: one or more of all six movement types.
- `direction`: IN or OUT, derived from type.
- `reason`: OPENING_STOCK, STOCKTAKE, DAMAGE, LOSS, OTHER.
- `saleId`, `purchaseId`, `returnId`, `customerId`, `vendorId`, `userId`: source-document/actor matches.
- `isReversal`: true/false; `source`: SALE, PURCHASE, RETURN, MANUAL.
- `productStatus`: ACTIVE/IN_ACTIVE, default both for history.
- `costStatus`: KNOWN/UNKNOWN.
- `minQuantity`, `maxQuantity`; `minQuantityBefore`, `maxQuantityBefore`; `minQuantityAfter`, `maxQuantityAfter`.
- `minUnitCost`, `maxUnitCost`; `minValueChange`, `maxValueChange` (signed); `minInventoryValueAfter`, `maxInventoryValueAfter`.
- `invoiceNumber`: contains match on source sale/purchase/return number; `supplierInvoiceNumber`: purchase source reference.
- `search`: product name/SKU/barcode/PCT, source invoice, party name, description.
- `page`, `size`: defaults 0/20, max 100.
- `sortBy`: occurredAt, productName, type, quantity, quantityAfter, unitCost, valueChange, inventoryValueAfter; default occurredAt desc with stable ID tie-breaker.

### Validations
1. Shared filter rules apply to every range, enum and sort key; return explicit validation errors.
2. Supplied product/document/party IDs must be store-scoped. Reject incompatible customer/vendor/source filters rather than producing misleading matches.
3. Unknown costs do not match numeric cost ranges; they remain available under costStatus=UNKNOWN and are clearly labeled.

### Response (`200 OK`)
`{ content: StockMovement[], page, size, totalElements, totalPages }`, including product/unit, source links, actor, valuation snapshots and reversal identity.

### Summary (`GET /api/stock-movements/summary`)
Same filters, full result set: movementCount, counts per type, quantities in/out/net grouped by product and unit of measure, known inventoryValueIn/out/net, unknownCostMovementCount. Do not add unlike units or claim filtered movements equal current stock.
- Current on-hand and valuation come from the complete product history, separately labeled from filtered-period movement totals.
- With one product and a date period, show opening/closing quantity/value from all its events before/through the boundaries, independent of movement-type/search filters.
- Valuation-only corrections are shown as a separate cost-audit section; they have zero quantity effect and are not fake zero-quantity stock movements.

### Product history (`GET /api/products/{id}/stock-movements`)
Same contract with productId fixed to the route; conflicting productId is rejected.

### Export (`GET /api/reports/inventory-report`)
Required from_date/to_date and CSV/PDF; same optional movement filters, layout/header/applied-filter/file conventions as use case 7. Include all six types and reversals, product-level quantity totals, value totals and unknown-cost warnings. Local export has the same results without network access.

## 12. Moving weighted-average cost and future profit

### Design decision
Use moving weighted-average cost, not the latest purchase price and not FIFO. Preserve every purchase item's actual cost and every sale item's cost at posting. Changing a product's default selling price never changes old sales, costs, or profit.

### Valuation calculation
Let Q be current quantity, V the known carrying value, and A = V/Q (6 decimals) when Q > 0.
1. Purchase/addition of q with total inventory cost C: new Q = Q + q, new V = V + C, new A = new V/new Q. Use cost after discount, non-recoverable tax and allocated supplier-billed acquisition charges.
2. Sale/removal: cost removed = round(q * A, 2); new Q = Q - q, new V = V - removed cost. If removing all remaining stock, consume exactly remaining V and set Q/V to zero; averageCost becomes zero until the next known-cost receipt.
3. Recalculate displayed average from remaining value/quantity; retain 6 decimals and clamp rounded partial-removal cost to remaining V to avoid a negative carrying value from rounding.
4. Save movement before/after quantity/value/average and the sale's unitCost/COGS. Profit never looks up today's product average.
5. Restocked sale return adds the original proportional COGS allocation back; final returned quantity consumes the exact remaining original cost. Weighted average then reflects the restored value. A non-restocked damaged return restores no inventory value and reverses no COGS.
6. Purchase return removes stock at current carrying cost, not the historic invoice cost, because units have been pooled under weighted average. `costVariance = original acquisition-cost credit excluding recoverable tax - carrying value removed`. Original acquisition-cost credit excludes freight/handling not credited by the supplier. Preserve this signed variance for later profit/accounting; do not force product value negative to match a supplier credit.
7. Stocktake/damage/loss reductions use current carrying cost and no party-ledger entry. Additions require explicit unitCost and update average as receipts; they are not purchases and do not create supplier debt.
8. Sale void adds original quantity/COGS back into the current pool like a restocked sale return; later purchases do not block it or get retroactively recosted. Purchase void uses an exact rollback only if its original receipt is the latest quantity/value-affecting event for each product, with no subsequent valuation-only correction or actual return. Restore its before snapshots with linked inverse movements. Otherwise reject purchase void with a clear conflict and use actual purchase return/new-document correction; never silently recost later sales.
9. Posting order is the terminal's durable sequence, not supplier invoice date. Backdated references never reorder historical valuation.

### Example
Buy 10 units at Rs 100 and 10 at Rs 120, no tax/charges: Q = 20, V = Rs 2,200, A = Rs 110.
- Sell 1 for Rs 150 exclusive: COGS Rs 110, gross profit Rs 40 before other expenses.
- Sell another at Rs 160: COGS still Rs 110, gross profit Rs 50.
- Later purchases change future average cost, not either historical sale.
- Return 1 unit to the first supplier for Rs 100 while A is Rs 110: remove Rs 110 carrying value, record Rs 100 acquisition-cost credit and variance -Rs 10. Vendor credit and inventory carrying value need not match.

### Profit data, not a complete accounting system
- Net sales revenue excludes output sales tax and includes original discount/actual sale-return effects.
- Gross profit = net sales revenue - net COGS, with purchase-return cost variances and stock write-offs separately reported rather than hidden in customer/vendor balances.
- Recoverable purchase tax is not an inventory expense. Non-recoverable tax and allocated acquisition charges are part of inventory cost.
- Snapshots support later reports, but full profit dashboards, operating-expense accounting, tax filing, FIFO, lot/batch/expiry tracking and general-ledger accounting are outside this documentation change.

## 12a. Opening valuation and unknown historical costs (require auth, OWNER only)

Existing products may have stock but no reliable purchase-cost history. Never use zero as a silent substitute or recompute past profit from today's cost.

### Request (`POST /api/products/{id}/inventory-cost-adjustments`)
```json
{
  "inventoryValue": "decimal >= 0, required; total value of current on-hand stock",
  "reason": "string, required, explains opening valuation or correction"
}
```

### Validations and write steps
1. Product belongs to store, OWNER only. Quantity is unchanged; for zero stock only zero inventory value is allowed.
2. Record immutable inventory_cost_adjustment with quantity snapshot, old/new value/average, reason/user/time/operation ID.
3. Set known product value and average cost. No fake purchase, party balance, payment, or quantity movement.
4. Unknown historical sale COGS remains UNKNOWN. Such sales may proceed against available legacy stock with explicit unknown-cost flags, but profit reports exclude them from known-profit totals and report their count/revenue separately.
5. Before a new valued receipt or purchase return mixes/removes unknown stock, require this opening valuation. An unknown-cost sale return may restock quantity but makes the resulting product valuation UNKNOWN; do not invent its cost.
6. Quantity adjustments and valuation corrections must be separate explicit actions, linked in audit if performed together.

### Response (`201 Created`)
Valuation audit and updated product. Product inventory detail includes the valuation-only timeline alongside stock movements.

## 13. Offline writes and PowerSync contract

### Local-first operation
1. Validate using the same rules and decimal calculations as the backend.
2. In one SQLite transaction allocate UUIDs, operationId and durable sequence; write document/items, actual payments, stock/value movements, ledger entries, cached balances/stock, numbering and pending upload intent. Roll everything back on any failure.
3. Draft edits are local and syncable but cause no posted effects. Draft payment proposals must be stored with draft data, not the posted payments table.
4. Lists, details, filters, summaries, inventory history, receipts and CSV/PDF exports read SQLite and work without a network. Show pending/error sync state; never call an online endpoint as a required step for an offline business action.
5. Initial login/provisioning and reference-data download require connectivity. Offline operation requires a provisioned user/store, unit/tax data, and device authorization under the existing offline-access policy.

### Upload and backend validation
1. Connector sends a whole business operation with stable operationId, terminal sequence, original actor, expected aggregate before-state, and all related row changes. Use an authenticated backend transaction endpoint; arbitrary per-table CRUD upload is insufficient for a posted operation.
2. Backend authorizes store/user/action, verifies every FK/store link, immutable snapshot, original/reversal relationship, return allowance, decimal total, stock/value/balance delta and expected sequence/before-state.
3. Apply the whole operation and sync_transactions receipt in one PostgreSQL transaction. Reject partial row acceptance. Receipt insert and effects must be atomic, with operation/sequence uniqueness enforced.
4. Same ID and same canonical payload after a lost response: acknowledge existing application without new invoice, stock, payment, ledger or cost effects. Same ID/different payload: reject conflict explicitly.
5. Preserve operation order, including multiple operations on the same row while offline. Never upload only the final product/customer/vendor state while losing intervening movements.
6. Backend must distinguish draft saves from posting, enforce one posting and one reversal per original, and validate cached aggregates against append-only effects. No independent last-write-wins aggregate replacement.
7. Direct online use-case endpoints must execute the same transaction pipeline and coordinate with the single writing terminal. Do not introduce an independent server writer that races queued offline operations.

### Replication scope
- Extend local SQLite schema, upload allowlist/validation, PostgreSQL publication and PowerSync store streams for vendors, purchases/items, returns/items, expanded payments/ledgers/movements, valuation adjustments and applicable receipt references/settings.
- Ledger rows must sync for both customer and vendor ownership; the previous customer-only filter would omit vendor history.
- Payments must sync for standalone party settlements and purchase/return links, not only sale-linked payments.
- All business rows are store-scoped directly or through validated parent ownership. Global unit/reference data remains read-only where appropriate. Do not sync credentials/secrets.
- Include inactive products/parties and voided history needed for inventory and balance reconstruction.

### Errors and device lifecycle
- Mark pending, uploading, synced, or failed locally. Permanent validation/authorization failures are visible with operation/document identity and a resolution message; never silently drop the queue, pretend success, or repeatedly retry a permanent error.
- A failed operation blocks dependent later operations until explicitly resolved, preserving stock/cost/account order.
- Safe transport retries reuse IDs/payloads. Corrections are explicit compensating operations; never regenerate IDs to bypass duplicate detection.
- Do not enable a second writing terminal, clear pending local data, or switch writing devices until queued operations are acknowledged and counters/history reconciled. Device replacement and multi-terminal conflict handling require a future explicit design.

### Migration and acceptance requirements for later implementation
1. Preserve historical original IDs/amounts. Map legacy non-commercial STOCK_IN to ADJUSTMENT_IN with audit provenance; map legacy RETURN only with verified origin, not guessed descriptions.
2. Backfill store/party/payment links only from reliable relationships; flag ambiguous historical rows. Mark historical unknown cost UNKNOWN. Do not manufacture purchases, tax credit or historical profit.
3. Exercise identical API/local calculations: paid/partial/unpaid purchase, optional vendor, split payments, advances/refunds, each tax mode/basis/treatment, discount/charge rounding, draft completion, all return variants, void eligibility/payment treatments, and inactive-party settlement.
4. Verify sale/purchase/return posting changes stock and signed party balances exactly once; manual adjustments change quantity/value only; non-restocked returns change no sellable stock.
5. Verify full/partial cumulative return limits, paisa remainders, restocked COGS, purchase-return variance, unknown-cost warnings and zero-stock rounding.
6. Verify the complete offline flow: create vendor → purchase → sale → return → account settlement → reconnect; retry after a lost acknowledgement and confirm identical IDs/counts/balances/stock/value.
7. Force a child-row validation failure and confirm no partial local/backend document, sequence, stock/value or ledger effect. Verify cross-store IDs/unauthorized voids are rejected on upload.
8. Verify all Inventory types/filters/sorts/summaries/export results against SQLite and API fixtures, including inactive products, void reversals, valuation-only audits and mixed units.

## 14. FBR configuration, posting, and manual reporting (planned)

Full implementation contract: [FBR integration design and milestones](./fbr-integration-plan.md). The existing Java/Spring backend alone calls current DI v1.12 and owns credentials/mapping/audit/jobs. Angular captures offline intents/commands and reads canonical results; Rust provides native DB/PowerSync/printing only. This supersedes frontend TS mapping/dispatch and native FBR credentials. Historical 2023 attachments are not payload/reference seeds; official-contract gaps remain gates.

### 14a. Store setup and onboarding
1. No global POS metadata/setup dependency in FBR integration. Existing legacy runtime cleanup is separate from this planned feature.
2. Store OWNER saves integration registration, reporting toggle and nonsecret fiscal defaults offline in store_fbr_settings, then syncs. No settings-history/audit table in V1.
3. Registration differs from legal sales-tax/STRN status. All taxpayer/environment secrets are provisioned centrally in backend vault/restricted encrypted storage; no customer/native FBR token/IP/endpoint setup.
4. Public settings/defaults are offline-editable; server certification/readiness/generation is read-only. Off locally freezes new sources as REPORTING_OFF. Backend only pauses remote work after receiving disable; show confirmation pending. Re-enable never drains paused old-generation work automatically.
5. Provide resumable OWNER FBR onboarding: confirm legal name/identity/address/province/legal tax status and conditional STRN -> supported activity/sector/profile -> catalog HS/unit/treatment/rate and conditional special fields -> buyer particulars/capture -> backend sandbox checks -> explicit approved production activation. Reuse existing store details; do not restart basic POS onboarding or require non-FBR stores to finish this flow.
6. Required data/checks persist in backend setup/master data, with safe check timestamps/config versions and invalidation on relevant changes. Current address is optional and province/STRN/buyer-address/tax-status/FBR product mapping are missing; see [gap inventory](./fbr-integration-plan.md#35-required-data-and-fbr-onboarding). No fabricated walk-in particulars; invoice-specific checks continue after onboarding.

### 14b. Posting a business document
1. Sales/purchases/actual returns still post locally if backend/FBR is unavailable. One native SQLite transaction writes financial effects, ordered upload envelope and immutable fbr_reporting_intent with fiscal source/config snapshot, never a forged canonical result.
2. Upload the same stable operation when connected. Backend atomically validates financial source/intent, creates canonical document and one initial job when eligible, commits, then acknowledges. Missing fiscal metadata produces NEEDS_ATTENTION without undoing a valid business operation.
3. After commit, backend runner performs one delayed initial attempt; automatic first processing after offline upload is allowed, **automatic retry after an attempt is not**. Ordinary purchases/returns retain supplier evidence, no generic outbound calls. Desktop shows Awaiting upload/backend, then downloaded canonical state.
4. Drafts, stock adjustments and customer/vendor payments/refunds do not generate another invoice. Provider/tax-owner review must resolve any advance/time-of-supply obligations.

### 14c. Submission and audit
1. Backend transactionally claims durable job/document, rechecks gate/version/account, Java-maps exact request and persists immutable attempt start before HTTP; no DB transaction spans the call.
2. Backend HTTPS sends once to matching FBR environment using backend-resolved secrets. Java response mapper persists raw response/error/item results/event/status/source summary atomically in PG; only allowlisted status/ID/timestamps/actionable diagnostics replicate down to SQLite.
3. Accepted requires invoiceNumber and consistent valid top-level/item validationResponse evidence, not HTTP 200/top-level code alone. An optional Validate call never means accepted and cannot check an unknown earlier POST. FBR ID is fiscal registration, not proof of payment/tax remittance.
4. FBR failure never repeats or rolls back financial effects. Backend may accept while desktop is disconnected; show cached freshness until download. Client cannot upload ACCEPTED/FBR ID/attempt results; backend is authoritative.
5. OWNER reference refresh/optional validation is a backend action with PG-only raw audit and normalized read-only reference cache downloads. Exact contextual reference values remain available offline without checkout network calls.
6. Use a PG transactional outbox plus bounded Spring poller, with interface-based services/ports and database claim/uniqueness/state-version checks. No volatile-only queue or automatic second HTTP attempt. A storage failure retries storing the same response, not sending again.
7. Enforce [durability/restore requirements](./fbr-integration-plan.md#67-background-jobs-durability-and-the-unavoidable-uncertainty-window): durable local commits and upload retention, synchronous PG durability for acknowledged commits, backups/WAL/restore drills, dispatch disabled after restore, and actionable unknown-outcome records. A crash before persisting an HTTP response cannot guarantee retention of those raw bytes; this remains an explicit production acceptance gate.

### 14d. Manual retry, correction, and reconciliation
1. No automatic second FBR attempt/backoff after failure/unknown. Backend restart may process PENDING jobs never durably started; orphaned durable starts become OUTCOME_UNKNOWN, never a worker resend.
2. OWNER/CASHIER Send/Retry creates stable command ID/expected canonical version/target attempt. Offline queues the command, not an FBR call; backend revalidates current role/state and creates one job. Duplicate upload/HTTP/lost ack reuses receipt, distinct stale commands conflict.
3. OWNER correction is a typed backend command yielding a new immutable revision after definitive nonacceptance; never edit monetary data. Backend rejection/stale version remains visible locally.
4. Unknown resolution requires online OWNER command/evidence/CAS; retain existing accepted ID if confirmed. Optional Validate is not old-invoice lookup. Backend replica/desktop fallback never resends unknown work.
5. No app role, including OWNER, can inspect/export raw FBR payloads in V1. No raw-data API or sync/SQLite copy; restricted backend PG only. App exposes safe workflow/error summaries, never whole parsed responses or internal evidence. Credentials never enter audit/logs.

### 14e. Returns, voids, and receipts
1. Reuse shared return records and exact stock/account/tax rules. Sales adjustment references our original FBR invoice and gets separate status/ID; ordinary purchase return keeps supplier-issued adjustment evidence, not our outbound acceptance.
2. Current API advertises Debit Note/invoiceRefNo, while legal guidance mentions debit/credit notes. Missing reason-field names, signs and partial-adjustment rules require verification. Until then mark NEEDS_ATTENTION; never send numeric old types, guessed Credit Note, negative lines or invented fields.
3. Fiscal-managed void requires online backend preparation/reservation, serialized with dispatcher. Unknown/sending blocks; never-accepted reservation prevents send; accepted requires certified reversal. Only then commit local void effects and upload same reservation/operation atomically. No fiscal-managed offline stock/refund reversal based on stale cache; reservation stays blocked until consumed/explicitly resolved.
4. Keep original ACCEPTED evidence after local void and show reversal pending/failed independently. Never equate a local stock reversal with FBR cancellation.
5. Receipts use immutable fiscal addenda/revisions for accepted ID/approved QR; pre-acceptance output says pending/needs attention/off. Current specification requires DI logo and 1-inch/version-2 QR; encoding/provisional-copy legality still need approval, never invent a verification URL.

### Acceptance
- Offline posting makes zero calls; one later eligible upload creates one backend initial attempt. Duplicate upload/command produces zero extra calls. After failed/unknown attempt, restart/reconnect/time passing produces zero automatic second calls.
- Backend raw audit stays PG-only; safe original/adjustment IDs/status survive restart and replicate without changing money/stock/payment counts. Raw audit and secret material are inaccessible to desktop/replication role.
- Re-enabling never reports off-period history; paused work requires a click. Unknown outcomes cannot be blindly retried.
- See [milestones](./fbr-integration-plan.md#10-milestones-implementation-sized-dependency-ordered) and [verification matrix](./fbr-integration-plan.md#11-verification-and-rollout-checklist) for implementation order and failure tests.
