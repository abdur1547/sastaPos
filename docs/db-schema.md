# DB Schema

> This document includes the planned vendor, purchase, return, inventory, costing, and offline contracts. These additions are not a claim that migrations or application code already implement them. See [use-cases.md](./use-cases.md) for validation and transaction rules.

## Shared rules
- All business rows have an id UUID, generated on the terminal before writing to local SQLite; createdAt and updatedAt UTC datetimes where not listed separately.
- Store-scoped rows have store_id UUID, can't be null. Child rows must reference parents in the same store; the backend validates this even for sync uploads.
- Money uses NUMERIC(18,2), quantity uses NUMERIC(18,2), unit costs and average costs use NUMERIC(18,6). Calculate with decimal arithmetic, not binary floating point; round final money amounts to 2 decimals, half-up. SQLite must use exact scaled-integer/decimal handling, not REAL arithmetic for financial calculations.
- Posted financial rows, stock movements, and ledger entries are append-only; only documented status/audit fields may change. Reversals preserve and reference originals.
- Zero monetary effects create no zero-amount payment/ledger rows; a free goods receipt/return may still have a positive-quantity stock movement.
- Only one writing terminal per store is supported for now. Multi-terminal stock conflicts, concurrent numbering, and cost reconciliation are deferred, not silently resolved by last-write-wins.
- A business can have separate customer and vendor accounts. Their balances are never automatically netted.
- For both customers and vendors: accountBalance = sum(DEBIT amounts) - sum(CREDIT amounts), including original and reversing entries, even when an original is marked voided.
- Positive balance means the party owes the store; negative means the store owes the party. UI uses explicit labels and absolute amounts, not raw signs.
- Business transaction identity and retry handling are defined in table 20; local writes and backend uploads must preserve the whole transaction.
- Required posting fields/child rows below apply to completed documents. Drafts retain incomplete proposals in draftData, initialize header money to zero where necessary, and create no posted payment/movement/ledger rows.

## All tables and properties

### 1. users
- name string, can't be null
- email string, globally unique
- password_hash text, can't be null
- role enum (OWNER, CASHIER, GLOBAL_ADMIN), default to CASHIER
- status enum (ACTIVE, IN_ACTIVE), default to ACTIVE

- can have one store, store_id UUID, can be null, default to null, (it will be null when user signed up but store is not yet created)
- can have many sales, sales done by this user
- can have many purchases, returns, payments, and stock movements recorded by this user

### 2. stores
- name string, can't be null
- ntn string, can't be null, globally unique
- address string, default to null
- currencyCode string, default to PKR
- timezone string, default to Asia/Karachi
- status enum (ACTIVE, IN_ACTIVE), default to ACTIVE
- salesTaxRegistrationStatus enum (REGISTERED, UNREGISTERED), can't be null, default to UNREGISTERED
- strn string, can be null, default to null (separate from ntn; required when salesTaxRegistrationStatus = REGISTERED)

- have many users, all staff and owners
- have one store_setting, can't be null
- can have many products
- can have many customers
- can have many vendors
- can have many sales
- can have many purchases and returns
- can have many stock_movements

### 3. products
- name string, can't be null
- sku string, default to null, unique in store (store specific code)
- barCode string, default to null
- pctCode string, can't be null, unique per store
- description text, default to null
- unitPrice NUMERIC(18,2), can't be null, default to 0.0 (default selling price; a sale may explicitly override its own snapshotted price)
- stockQuantity NUMERIC(18,2), default to 0.0
- averageCost NUMERIC(18,6), can be null until cost is known; system-managed moving weighted-average cost, never a replacement for purchase-item history
- inventoryValue NUMERIC(18,2), can be null for unvalued historical stock; system-managed carrying value
- costStatus enum (KNOWN, UNKNOWN), can't be null, default to UNKNOWN (unknown cost is never silently treated as zero)
- status enum (ACTIVE, IN_ACTIVE), default to ACTIVE (store can hide a product instead of deleting it)
- createdAt datetime, can't be null, default to current date time

- have one unit_of_measure, -> unit_of_measure_id UUID, can't be null
- can have many tax_categories, a product can have many texes on it
- can have many stock_movements
- belongs to store or have one store
- can have many sale_items
- can have many purchase_items and return_items

### 4. unit_of_measures
- name string, can't be null
- symbol string, can't by null
- allowsFraction boolean, default to true
- status enum (ACTIVE, IN_ACTIVE), default to ACTIVE

- can have many products

### 5. sales
- invoiceNumber string, required when posted, null on draft, unique per store
- saleType enum (DEBIT, CREDIT), can't be null
- subtotal NUMERIC(18,2), can't be null
- discountAmount NUMERIC(18,2), can't be null, default to 0.0
- taxableAmount NUMERIC(18,2), can't be null
- taxAmount NUMERIC(18,2), can't be null
- totalAmount NUMERIC(18,2), can't be null
- currencyCode string, can't be null, default to PKR
- soldAt datetime, can't be null, defaults to current UTC time; PostgreSQL stores UTC in a timestamp without time zone
- saleStatus enum (COMPLETED, IN_PROGRESS, VOIDED), default to COMPLETED (IN_PROGRESS when this sale is saved as draft)
- totalPaid NUMERIC(18,2), can't be null (buyer paid on the spot, debit sale)
- remaining NUMERIC(18,2), can't be null, default to 0.0, (if buyer buy at credit, how much buyer will pay in fututre)
- description text, can be null
- draftData JSON, can be null, incomplete item/payment proposals only while IN_PROGRESS; JSON text in SQLite
- totalReturned NUMERIC(18,2), can't be null, default to 0.0, system-managed
- totalRefunded NUMERIC(18,2), can't be null, default to 0.0, system-managed (does not include retained account credit)
- voidReason text, can be null, default to null, required (validated at application level) when saleStatus is set to VOIDED
- voidedAt datetime, can be null, default to null, set when saleStatus is set to VOIDED
- voidedBy UUID, can be null, default to null, references the user who voided the sale

- can have one customer, optional for DEBIT sales, required for CREIDT sales
- have one user, staff member whoe performed this sale
- have many sale_items, each sale will have at minimum one sale item
- can have many payments; a positive-total DEBIT sale has at least one actual receipt, a zero-total sale has none
- can have many ledger_entries, required for nonzero financial effects whenever a customer is attached
- have many stock_movements
- can have many returns
- totalPaid/remaining describe payments allocated to the original invoice, not the customer's whole-account balance; standalone settlements do not rewrite them
- can have one correctionOfReturnId UUID, optional FK to an immutable return corrected by this compensating sale, same store/type/customer

### 6. sale_items
- productName string, can't be null
- sku string, default to null
- quantity NUMERIC(18,2), can't be null
- unitPrice NUMERIC(18,2), can't be null
- taxRate NUMERIC(18,2), can't be null, default to 0.0 (percentage, 18 means 18%; sales tax is exclusive)
- taxableAmount NUMERIC(18,2), can't be null
- discountAmount NUMERIC(18,2), can't be null, default to 0.0, allocated share of invoice discount
- taxAmount NUMERIC(18,2), can't be null
- lineTotal NUMERIC(18,2), can't be null
- unitCost NUMERIC(18,6), can be null for explicitly unknown historical cost; snapshot at posting, not current product cost
- costOfGoodsSold NUMERIC(18,2), can be null for explicitly unknown historical cost
- costStatus enum (KNOWN, UNKNOWN), can't be null

- have one product, can't be null
- have one sale, can't be null
- have many stock_movements (one original SALE when posted, plus any void reversal; none for drafts)

### 7. payments
- amount NUMERIC(18,2), can't be null, must be > 0
- direction enum (INCOMING, OUTGOING), can't be null (actual money received/paid by the store)
- referenceNumber string, can be null
- description text, can be null
- method enum (CASH, BANK), can't be null (CREDIT is a document type, not actual money movement)
- voided boolean, can't be null, default to false
- voidReason text, voidedAt datetime, voidedBy UUID: nullable, required together when voided
- reversalOfPaymentId UUID, can be null, unique when present; references the original payment for an actual cash/bank reversal
- belongs to store and user, can't be null
- can have one sale, one purchase, or one return; at most one document link on a payment
- can have one customer or one vendor, never both; optional only for anonymous fully paid document transactions
- a standalone settlement requires exactly one customer or vendor
- can have one ledger_entry, required when a customer/vendor is attached
- a recording-error void marks the original; a real refund creates an opposite-direction payment instead of pretending no money moved

- payments proposed on a draft are not posted money movements

### 8. stock_movements
- type enum (SALE, PURCHASE, SALE_RETURN, PURCHASE_RETURN, ADJUSTMENT_IN, ADJUSTMENT_OUT), can't be null
- quantity NUMERIC(18,2), can't be null, must be > 0, always stored positive
- quantityBefore NUMERIC(18,2), can't be null
- quantityAfter NUMERIC(18,2), can't be null
- description text, can't be null
- occurredAt datetime, can't be null, UTC posting time
- unitCost NUMERIC(18,6), can be null only for explicitly unknown historical cost
- valueChange NUMERIC(18,2), signed, can be null only for explicitly unknown historical cost
- inventoryValueBefore, inventoryValueAfter NUMERIC(18,2), nullable only for explicitly unknown historical cost
- averageCostBefore, averageCostAfter NUMERIC(18,6), nullable only for explicitly unknown historical cost
- costStatus enum (KNOWN, UNKNOWN), can't be null
- reversalOfMovementId UUID, can be null, unique when present, references the original movement for a void reversal
- reason enum (OPENING_STOCK, STOCKTAKE, DAMAGE, LOSS, OTHER), can be null, required for manual adjustments
- have one sale or one purchase, can be null, mutually exclusive; retained on void reversals
- belongs to store, or have one store, can't be null
- can have one sale_item or one purchase_item matching its source document
- can have one return_item, required for an actual SALE_RETURN/PURCHASE_RETURN, null for void reversals
- have one user, can't be null
- belongs to product, can't be null in any case
- SALE/PURCHASE_RETURN/ADJUSTMENT_OUT decrease stock; PURCHASE/SALE_RETURN/ADJUSTMENT_IN increase stock
- manual ADJUSTMENT_IN/ADJUSTMENT_OUT have no sale, purchase, return, payment, or ledger effects
- original posted SALE/PURCHASE movements are unique per source item; one void reversal per original movement
- legacy STOCK_IN without a supplier invoice becomes ADJUSTMENT_IN with its original description, not a fabricated purchase

### 9. store_settings
- invoicePrefix string, can't be null, default to ""
- invoiceNumberStart integer, can't be null, default to 1
- nextInvoiceNumber integer, can't be null
- receiptFooter string, can't be null, default to ""
- purchaseInvoicePrefix string, can't be null, default to "PUR-"
- purchaseInvoiceNumberStart integer, can't be null, default to 1
- nextPurchaseInvoiceNumber integer, can't be null, default to 1
- returnInvoicePrefix string, can't be null, default to "RET-"
- nextReturnInvoiceNumber integer, can't be null, default to 1
- costingMethod enum (MOVING_WEIGHTED_AVERAGE), can't be null, not editable after stock activity begins

- have one store, can't be null

### 10. customers
- name string, can't be null, unique per store
- phoneNumber string, can be null, default to null, unique globally
- ntn string, can be null, default to null
- accountBalance NUMERIC(18,2), can have sign, default to 0.0
- status enum (ACTIVE, IN_ACTIVE), can't be null, default to ACTIVE (soft-deleted/deactivated customers are hidden from default listing and can't be attached to new sales, but stay intact for historical sales/ledger)

- belongs to a store, can't be null
- have many sales
- have many ledger_entries
- can have many payments and returns; these references also prevent hard delete

Customer.balance > 0  → Customer owes Store
Customer.balance < 0  → Store owes Customer
Customer.balance = 0  → Settled

Display: "Customer owes you Rs X", "You owe customer Rs X", or "Settled".

### 11. ledger_entries
- direction enum (DEBIT, CREDIT), can't be null
- amount NUMERIC(18,2), can't be null, must be > 0; zero-value financial effects create no ledger row
- type enum (SALE, PURCHASE, PAYMENT, SALE_RETURN, PURCHASE_RETURN, ADJUSTMENT), can't be null
- reference_number string, can be null, default to null
- description string, can be null, default to null
- voided boolean, can't be null, default to false (set true only on an original `PAYMENT` entry that has been reversed; `ADJUSTMENT`/reversal entries themselves are never voided again)
- voidReason text, can be null, default to null, required (validated at application level) when `voided` is set to true
- voidedAt datetime, can be null, default to null, set when `voided` is set to true
- voidedBy UUID, can be null, default to null, references the user who voided the entry
- reversalOfEntryId UUID, can be null, unique when present; references the original entry being reversed
- occurredAt datetime, can't be null, UTC posting time
- belongs to store and user, can't be null

- belongs to exactly one customer or vendor: customer_id/vendor_id nullable individually, exactly one non-null; real FKs, not an unvalidated polymorphic party ID
- can have one sale or one purchase, mutually exclusive; SALE requires sale/customer and PURCHASE requires purchase/vendor
- can have one return, required for SALE_RETURN/PURCHASE_RETURN; original document link is retained
- can have one payment, required for PAYMENT; one original PAYMENT ledger entry per payment
- ADJUSTMENT reversals preserve the original party/document/payment links and reference reversalOfEntryId
- document links must match the party and store; all financial fields and links are immutable in bulk uploads
- standalone settlements are not allocated to an invoice; invoice remaining and account balance are separate concepts
- legacy RETURN entries require provenance review before mapping to SALE_RETURN; do not infer original items or amounts from descriptions

### 12. tax_categories
- name string, can't be null, globally unique
- symbol string, can be null, globally unique
- rate NUMERIC(18,2), can't be null
- calculationType string, can't be null

- can have many products

### 13. pos_info
- Existing single global row (not store scoped) holding nonsecret POS/software identity; synced read-only to provisioned devices via PowerSync and served by `GET /api/pos-info` to any authenticated user, including users without a store
- pos_id, pos_name, registration_number, software_name, software_version, vendor_name, vendor_ntn: all nullable strings. This documents existing legacy storage only; it is outside the new FBR DI setup, readiness and payload contract
- is_active boolean, can't be null
- date_created, last_updated timestamptz
- No token/secret fields, public write endpoints, or accepted upload mutations. Existing global admin provisioning is unrelated to store FBR activation
- See [FBR design](./fbr-integration-plan.md) for backend-owned current DI reporting, official sources, delayed offline upload, and taxpayer/environment credential separation

### 14. vendors
- name string, can't be null, unique per store
- phoneNumber string, can be null, default to null, unique globally within vendors when provided (mirrors the existing customer rule; separate from customer phone uniqueness)
- ntn string, can be null, default to null
- strn string, can be null, default to null; required for REGISTERED status
- salesTaxRegistrationStatus enum (REGISTERED, UNREGISTERED), can't be null, default to UNREGISTERED
- address text, can be null, default to null
- accountBalance NUMERIC(18,2), signed, can't be null, default to 0.0
- status enum (ACTIVE, IN_ACTIVE), can't be null, default to ACTIVE

- belongs to store, can't be null
- can have many purchases, payments, returns, and ledger_entries
- hard delete only with zero balance and no document/payment/ledger history; otherwise retain history and deactivate under the same rules as customers

Vendor.balance > 0 → Vendor owes Store → "Vendor owes you Rs X"
Vendor.balance < 0 → Store owes Vendor → "You owe vendor Rs X"
Vendor.balance = 0 → Settled

### 15. purchases
- invoiceNumber string, can't be null when posted, unique per store, system-generated internal purchase number; draft has no posted number
- supplierInvoiceNumber string, can be null, default to null (supplier's reference, not the internal sequence)
- supplierInvoiceDate date, can be null, default to null
- purchasedAt datetime, null on draft, required UTC posting time on completion; supplier invoice date does not reorder valuation history
- purchaseType enum (DEBIT, CREDIT), can't be null (DEBIT = paid in full now; CREDIT = some/all due)
- purchaseStatus enum (COMPLETED, IN_PROGRESS, VOIDED), can't be null, default to COMPLETED
- subtotal, discountAmount, taxableAmount, taxAmount, totalAmount NUMERIC(18,2), can't be null; discountAmount defaults to 0.0
- freightAmount, handlingAmount NUMERIC(18,2), can't be null, default to 0.0; these are non-recoverable acquisition charges included in supplier payable in this version
- recoverableTaxAmount, nonRecoverableTaxAmount NUMERIC(18,2), can't be null, default to 0.0
- totalPaid, remaining NUMERIC(18,2), can't be null, remaining defaults to 0.0
- totalReturned, totalRefunded NUMERIC(18,2), can't be null, default to 0.0
- currencyCode string, can't be null, default to PKR
- vendorName, vendorNtn, vendorStrn, vendorAddress string snapshots, can be null for an anonymous purchase
- vendorTaxRegistrationStatus enum (REGISTERED, UNREGISTERED), can't be null, invoice-time snapshot
- storeTaxRegistrationStatus enum (REGISTERED, UNREGISTERED), can't be null, invoice-time snapshot
- storeStrn string, can be null, required snapshot for recoverable treatment
- description text, can be null
- draftData JSON, can be null, incomplete item/payment proposals only while IN_PROGRESS; JSON text in SQLite
- voidReason text, voidedAt datetime, voidedBy UUID: nullable, required together when VOIDED

- belongs to store and user, can't be null
- can have one vendor, required for CREDIT, optional for DEBIT; selected vendor must be ACTIVE on a new purchase
- have many purchase_items, at least one for posting
- can have many payments, ledger_entries, stock_movements, and returns
- no stock, cost, payment, or ledger effects for drafts; completed financial fields are immutable
- (store, vendor, supplierInvoiceNumber) unique when vendor and nonblank supplierInvoiceNumber are present, including voided purchases
- can have one correctionOfReturnId UUID, optional FK to an immutable return corrected by this compensating purchase, same store/type/vendor

### 16. purchase_items
- productName string, can't be null; sku string, can be null; invoice-time snapshots
- quantity NUMERIC(18,2), can't be null, must be > 0
- unitPrice NUMERIC(18,6), can't be null, must be >= 0, supplier's quoted unit price before line discount; inclusive/exclusive meaning is snapshotted below
- taxMode enum (EXCLUSIVE, INCLUSIVE, NO_SEPARATE_TAX), can't be null
- taxBasis enum (TRANSACTION_VALUE, RETAIL_PRICE, OTHER_DOCUMENTED), can't be null
- taxRate NUMERIC(18,6), can be null for explicit invoice tax; percentage, e.g. 18 means 18%
- includedTaxAmount NUMERIC(18,2), can be null, documented tax embedded in the pre-discount inclusive quote; distinct from final discounted taxAmount
- taxBase NUMERIC(18,2), can't be null, documented base (not necessarily the discounted purchase value for retail-price goods)
- taxDetails JSON, can be null; immutable invoice tax components/evidence, stored as JSON text in SQLite
- discountAmount NUMERIC(18,2), can't be null, allocated share expressed on an exclusive basis after inclusive-price extraction
- taxableAmount, taxAmount, lineTotal NUMERIC(18,2), can't be null
- inputTaxTreatment enum (NON_RECOVERABLE, RECOVERABLE, PARTIALLY_RECOVERABLE), can't be null, default to NON_RECOVERABLE
- recoverableTaxAmount, nonRecoverableTaxAmount NUMERIC(18,2), can't be null, default to 0.0
- taxTreatmentReason text, can be null, required for any recoverable treatment
- freightAllocation, handlingAllocation NUMERIC(18,2), can't be null, default to 0.0
- inventoryCost NUMERIC(18,2), can't be null (discounted exclusive value + non-recoverable tax + freight/handling allocations)
- unitCost NUMERIC(18,6), can't be null (inventoryCost / quantity)

- belongs to product and purchase, can't be null, same store
- product unique per purchase, matching sale duplicate-product rules
- have many stock_movements, one original PURCHASE when posted; none for drafts
- can have many return_items

### 17. returns
- invoiceNumber string, can't be null, unique per store, internal return sequence
- type enum (SALE_RETURN, PURCHASE_RETURN), can't be null
- returnedAt datetime, can't be null, UTC posting time
- reason text, can't be null, not blank
- taxableAmount, taxAmount, totalAmount NUMERIC(18,2), can't be null; positive amounts credited/reversed against the original document
- recoverableTaxReversal NUMERIC(18,2), can't be null, default to 0.0
- inventoryCost NUMERIC(18,2), can be null only for explicitly unknown historical costs
- costVariance NUMERIC(18,2), can be null only for explicitly unknown historical costs
- settlementType enum (ACCOUNT_CREDIT, IMMEDIATE_SETTLEMENT, MIXED), can't be null
- settlementAmount NUMERIC(18,2), can't be null, default to 0.0
- currencyCode string, can't be null, default to PKR
- supplierCreditNoteNumber string, can be null, purchase returns only

- belongs to store and user, can't be null
- belongs to exactly one original sale or purchase matching type, must be COMPLETED
- has the original customer/vendor, can be null only for an anonymous original document with immediate full settlement
- have many return_items, at least one
- can have many payments and ledger_entries
- immutable after posting; correction uses a separately referenced compensating sale/purchase, not deletion or reusing return allowance

### 18. return_items
- quantity NUMERIC(18,2), can't be null, must be > 0
- productName, sku invoice snapshots; name required
- taxableAmount, taxAmount, lineTotal NUMERIC(18,2), can't be null, original discounted/taxed amounts allocated to returned quantity
- recoverableTaxReversal NUMERIC(18,2), can't be null, default to 0.0
- restock boolean, can't be null (SALE_RETURN may be false for damaged goods; PURCHASE_RETURN always false because goods leave the store)
- unitCost NUMERIC(18,6), inventoryCost NUMERIC(18,2), can be null only for unknown historical cost
- costVariance NUMERIC(18,2), can be null only for unknown historical cost (difference between original acquisition-cost credit and carrying value removed on a purchase return)
- for non-restocked sale returns inventoryCost is zero (no COGS reversal); known-cost sale returns have costVariance zero

- belongs to return and product, can't be null
- belongs to exactly one original sale_item or purchase_item, matching return type and product
- original item unique per return
- can have one stock_movement: SALE_RETURN only when restock = true; PURCHASE_RETURN always
- cumulative return quantity must not exceed original item quantity; financial/tax allocations must not exceed original amounts

### 19. inventory_cost_adjustments
- occurredAt datetime, can't be null
- reason text, can't be null, required
- quantitySnapshot NUMERIC(18,2), can't be null, current stock quantity, unchanged by this operation
- inventoryValueBefore NUMERIC(18,2), can be null for unknown history
- inventoryValueAfter NUMERIC(18,2), can't be null, must be >= 0
- averageCostBefore NUMERIC(18,6), can be null
- averageCostAfter NUMERIC(18,6), can't be null
- belongs to product, store, and user, can't be null; OWNER only
- append-only opening-valuation/correction audit, not a stock movement, payment, or party-ledger adjustment
- does not rewrite historical sale costs or make previously unknown profit known

### 20. sync_transactions
- id UUID, terminal-generated business operation ID, stable across retries
- store_id, user_id, terminal_id UUID, can't be null
- sequenceNumber integer, can't be null, monotonically increasing per terminal, unique per store/terminal
- operationType string, can't be null (e.g. POST_PURCHASE, POST_RETURN, VOID_SALE, PARTY_PAYMENT)
- payloadHash string, can't be null, backend-computed canonical payload hash
- appliedAt datetime, can't be null, backend receipt time
- backend receipt/idempotency record committed atomically with every row of the operation; same ID/same payload is acknowledged without reapplying, same ID/different payload is rejected
- offline queue/upload status is local metadata, not a replicated business receipt; failed operations remain visible and retryable
- each business effect row carries operationId UUID referencing its applied transaction on the backend; originals and reversals have different operation IDs
- strict per-terminal upload order; no partial operation acceptance or independent last-write-wins updates of product/account aggregates

## Planned FBR extensions

The following are implementation contracts, not existing migrations. Full columns, checks, relationships, permissions and algorithms are in [FBR integration design, section 5](./fbr-integration-plan.md#5-data-model-and-ownership), with a [field-by-field POS-language dictionary](./fbr-integration-plan.md#58-tablefield-dictionary-in-pos-terms). Reuse vendors, purchases, shared returns and sync_transactions above. Backend is the sole FBR sender/canonical audit writer; desktop uploads immutable intents/commands and downloads allowlisted status/ID/diagnostic projections. Raw FBR requests/responses remain backend PostgreSQL only, with no frontend API/export or PowerSync replication in V1.

### 21. store_fbr_settings
- id/store_id use the store UUID; one current row per store
- registration_status UNREGISTERED/REGISTERED, reporting_enabled default false; registration and reporting are separate from legal sales-tax/STRN status
- environment SANDBOX/PRODUCTION, integration_provider, business_activity/sector/onboarding_status, assigned_scenario_ids, seller_province_code, nullable default_sale_type_id/default_customer_id; config_version, dispatch_generation, last_disable_config_version and timestamps
- readiness_checks_json holds safe typed completion/check times and validated config/profile versions, invalidated by relevant setup changes; no raw bodies/secrets. Resumable [FBR onboarding](./fbr-integration-plan.md#35-required-data-and-fbr-onboarding) derives completion from persisted requirements, not only a browser step number
- Reuse store legal identity/STRN; no secret columns and no settings-history/audit table
- Owner edits public toggle/defaults offline; backend validates ownership/version/constraints. Onboarding/certification/readiness/dispatch_generation are server-controlled, not client-editable claims. Each posted intent freezes public settings
- All credentials stay backend-only, not in this table/SQLite/PowerSync. No global POS metadata/setup dependency

### 22. product_fbr_mappings and fbr_reference_data
- Product/store-specific HS, UoM/sale-type/rate/SRO selectors and structured tax profile, versioned and snapshotted at posting; current DI sends exact reference descriptions for rate/UoM/saleType, not numeric selector IDs
- Reference data includes provinces/document types and date/type/province/HS-dependent context; keyed by scope/profile/kind/code/context/version, with fetched/effective dates
- Backend reference refresh writes scoped cache/audited exchanges; admin global baseline is read-only. Both download read-only and support offline checkout without network lookups
- HS code can be shared across products; global units must not be overwritten by store-specific mappings

### 23. fbr_reporting_intents and fbr_documents
- Immutable intent written in local posting transaction and uploaded with the whole financial operation: source/snapshot/hash/schema version, posting config/version/generation, environment/account, origin actor/terminal and operation ID
- Backend validates against source and creates canonical document with deterministic identity; client cannot mutate canonical status/audit. UI merges pending intent with downloaded canonical projection
- Exactly one sale, purchase or shared return FK, matching source_kind SALE/PURCHASE/SALE_RETURN/PURCHASE_RETURN/SALE_VOID/PURCHASE_VOID
- Original-document self FK for adjustments/reversals; same-store relationships and per-source/kind uniqueness
- Origin terminal/actor, immutable source/config snapshot and hash, contract/snapshot version, frozen eligibility, current state/version, nullable string FBR ID/timestamps
- Excluded posted documents retain NOT_REGISTERED or REPORTING_OFF; historical records are LEGACY_NOT_EVALUATED, never automatically queued
- Ordinary vendor purchases/purchase returns/voids are EVIDENCE_ONLY, not our outbound invoices. Special purchase profiles require separate certification. Freeze taxpayer/environment; sandbox acceptance is never production acceptance
- Sales/purchases/returns expose backend-controlled fbr_status/fbr_invoice_id summaries; read-only client projection, not a client aggregate write or financial-version change. Original/reversal IDs remain distinct
- Supplier-issued invoice/adjustment IDs use separate supplier_fbr_invoice_id/supplier_adjustment_fbr_id/evidence-source/verification-status fields; RECORDED_UNVERIFIED is not our ACCEPTED

### 24. fbr_request_revisions
- Backend-created immutable exact sanitized serialized request body/hash plus fiscal metadata, profile/mapper/reference versions, frozen account/environment, document/revision, actor/reason/time; backend PG only, never downloaded/exposed
- Correction creates a new revision, never overwrites an old payload or changes posted financial data

### 25. fbr_attempts and fbr_attempt_results
- Backend-only writer: insert attempt start with revision/target/actor/worker/job/command/number/time before HTTP; never accept client-uploaded attempt/results
- At most one immutable result per attempt: HTTP status, exact received body, sanitized response headers, transport certainty/error, normalized outcome/errors/ID/timestamps and per-item status/issued ID linked to source-line ordinal
- Missing result after crash means outcome unknown, not safe retry; no response NULL differs from received empty body
- Current success uses invoiceNumber plus consistent top-level/item validationResponse, never old result or only a top-level code

### 26. fbr_document_events, fbr_submission_jobs and fbr_action_commands
- Backend-written append-only state/reconciliation events with sequence/actor/worker/attempt/revision/command/reason/evidence/time; only allowlisted status timeline downloads, never internal evidence
- Backend-only durable jobs have unique initial intent or manual command, one active job/document, state/generation/version and claim/attempt references; no retry/backoff scheduling or desktop dispatch table
- Runner may recover never-started PENDING work for its first attempt. Durable STARTED without result becomes unknown and never automatically resends
- Client-created immutable action commands have stable UUID/hash/action/expected document version/target attempt/payload/actor/sequence; server receipts distinguish queued/accepted/stale/rejected/completed
- Duplicate upload/action same ID/content returns existing receipt/job. Distinct retries against same version cannot both execute. Off/re-enable pauses old-generation work until explicit user Send
- Fiscal-managed void requires online server reservation tied to document/version/actor/business operation before local business effects; reservation blocks conflicting dispatch until consumed/explicitly resolved, never auto-expires into resend
- Raw audit/internal event evidence is backend PG only, not accessible through app endpoints/export or PowerSync for any role. Only safe status timeline/command receipts download
- VOID_PREPARE reservation identity/document version/operation/status are durable server-owned command receipt fields; no separate reservation table in V1

### 27. fbr_api_exchanges and fbr_api_exchange_results
- Backend separately audits explicit reference refresh, validation-only and any verified registration check; every actual exchange persists start before I/O and append-only result afterward, both backend PG only
- Store/environment/actor, operation kind, optional document/revision FK, exact nonsecret request/context, raw response/status/error/transport certainty/timestamps
- References need no document link; validate-only never sets an invoice's ACCEPTED state or FBR ID. Do not use validation as lookup/deduplication

### 28. fbr_credential_bindings (backend-only restricted storage)
- Store/taxpayer/environment binding, opaque vault/encrypted-secret reference/key version, active state/timestamps; unique active account/environment binding
- Central provisioning/rotation, no POS customer entry/readback endpoint in V1; backend resolves taxpayer/environment bearer credentials
- Secret values/refs and jobs/claims never enter SQLite/PowerSync/public DTO. Secret values never enter audit; restricted internal attempts may retain binding/version references only. Remove SELECT/default grants for secret/raw-audit tables from replication role and exclude them from publication; query omission alone is not protection