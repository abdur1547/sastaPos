# FBR integration: milestone implementation plan

Planned repository deliverable: `docs/fbr-integration-plan.md`. This session copy is the source of truth until plan approval; no repository implementation has started.

## 1. Problem, scope, and agreed behavior

Report completed sales, supplier restocking purchase bills, and verified fiscal adjustments through a separate REST service installed on the originating store PC. Persist every outbound request and its outcome locally, upload the audit records to PostgreSQL, and synchronize store history through PowerSync. Keep internal invoice numbers and supplier invoice numbers separate from the FBR tracking number.

Confirmed scope:

- Sales, supplier purchases, sales returns, and purchase returns are in scope. Return workflows follow the reviewed scenarios in `docs/fbr_scenarios.md`; exact FBR document types, tax treatment, and submission paths remain subject to M1 provider/tax-owner verification.
- Customer receipts/refunds and supplier payments/refunds are accounting events, not new invoices. Partial-payment workflows and broader receivables/payables management remain future scope; payments never trigger a second FBR invoice.
- General invoice corrections/cancellations and debit notes remain future scope. A sales return is a separately linked return/credit-note workflow, not a silent edit or cancellation of its original invoice.
- Add supplier master data, purchase bills/items, and stock-in. Existing stock adjustments are not equivalent to purchase invoices.
- Store owners can enable/disable FBR independently per store. Disabled by default.
- Disabling prevents new fiscal submissions and pauses pending work without deleting history. Re-enabling resumes existing pending work, but does not automatically backfill transactions completed while disabled.
- Each originating PC submits only its own invoices. Other devices receive audit history but must not dispatch those invoices.
- Valid fiscal metadata is mandatory for FBR-enabled stores; disabling FBR preserves ordinary POS behavior and optional fiscal fields.
- A store-configured default customer is selected for sales. Do not invent a CNIC/NTN or silently use placeholder identities. The local provider must confirm accepted treatment of walk-in/default customers.
- Complete valid business transactions locally even when the FBR service or internet is unavailable, then queue reporting. This does not waive required fiscal metadata.
- A request with a possibly delivered body and no trustworthy response enters `OUTCOME_UNKNOWN`; reconcile before resubmitting. No blind retries.
- Existing sale void behavior remains unchanged. A local void is not an FBR reversal; any fiscal correction/cancellation requires a separate, audited workflow and an explicit operational/compliance decision before production.

The scenario workflows are accepted as planning requirements. This does not establish that every described action, document type, or tax treatment is legally applicable to every store; provider and tax-owner confirmation remains a production gate.

### Return workflow requirements

- A sales return references the original sale and records returned items/quantities, reason, values, and tax adjustment. Preserve the original invoice and its audit trail. Submit the applicable credit note or adjustment only through the verified provider workflow. Return saleable stock, then record the refund or customer credit; reduce the receivable for an unpaid credit sale.
- A purchase return references the original supplier purchase and records returned items/quantities, reason, values, and tax adjustment. Obtain and retain the supplier's required credit note/supporting tax document; do not submit the supplier's invoice as our sales invoice or assume the return cancels it. Reduce stock and payable, or record a supplier refund/credit if already paid. Apply input-tax adjustments only where permitted.
- Cash-versus-credit settlement changes the accounting result, not the original invoice. Returns do not overwrite or delete accepted invoices, and retries/reconciliation remain governed by the existing no-blind-retry rules.

## 2. Evidence and current implementation

These observations are based on checked-in schema/migrations and application code, not a connection to a running database. Validate deployed migration versions before implementation.

| Area | Existing state | Consequence |
| --- | --- | --- |
| Backend schema | Flyway V1-V7; `business_settings` is the actual settings table, linked by `stores.store_settings_id` | Do not create/use the conceptual `store_settings` name from the schema overview |
| Store identity | `stores.name`, `ntn`, nullable `address`, currency, timezone | Reuse identity; add FBR-specific configuration and validation |
| Products | Store-unique `pct_code`, optional SKU/barcode, unit relation, many tax categories | PCT is only a candidate HS-code source, not proof of a valid FBR code; ensure a stable product code if SKU is absent |
| Units and tax | Units have string `code`; tax categories have rate/code/calculation type; sale lines snapshot an aggregated rate | Add explicit FBR UoM/code mapping and classified fiscal line breakdown |
| Sales | Local transactional completion writes sale, items, payment, stock/ledger effects and `receipt_commits` | Create fiscal snapshot/outbox atomically with completion; no network inside transaction |
| Sales API | Backend also creates/updates/voids sales | Define origin rules for all entry points; backend cannot reach a store PC through its own localhost |
| Purchases | No supplier, purchase header, or purchase item module found; stock movement enum includes `STOCK_IN` | Purchase foundation is required, not merely another FBR trigger on stock changes |
| Local DB | Native PowerSync/Tauri SQLite accessed through existing database abstraction; schema described in `app-schema.ts` | Keep native ownership, no new browser DB or JS HTTP/queue owner |
| Upload | Rust connector posts queued mutations to `/api/sync/upload`; completion waits for no rejections | Frontend AGENTS note describing non-persisting upload is stale; use actual implemented path |
| Backend sync | `SyncTableConfig` routes table-specific bulk services; table grouping/coalescing and partial rejection exist | Register new tables in dependency order; immutable audit services must tolerate replay |
| Downloads | `powersync/sync-config.yaml` scopes operational data by signed `store_id` | Add scoped queries, avoid secret replication |
| Publication | `postgres-init.sh` uses `CREATE PUBLICATION powersync FOR ALL TABLES` | New tables are covered in that setup; verify deployed publication/grants rather than assume explicit table-list edits |
| Receipts | Rust-managed immutable `receipt_snapshots`, print jobs/attempts; current data/layout has no FBR identity/QR | Add fiscal receipt revisions/addenda; never overwrite original financial snapshot |
| Voiding | Local sale void returns stock/reverses accounts without fiscal document | Keep distinct from the planned linked return/credit-note workflow; accepted/unknown invoices can diverge from FBR until an explicit cancellation policy is approved |

Primary implementation anchors:

- `backend/src/main/resources/db/migration/V1__baseline_schema.sql` through `V7__sales_register_integrity.sql`
- `backend/src/main/java/com/sastapos/sasta_pos/store/`, `business_setting/`, `sale/`, `sale_item/`, `product/`, `stock_movement/`, `sync/`, `bulk/`
- `frontend/src/app/features/sell/data/sale.repository.ts`, `features/sell/domain/sale-calculator.ts`
- `frontend/src/app/features/sales/`, `features/store/`, `features/customers/`, `features/products/`
- `frontend/src/app/core/database/database.service.ts`, `core/powersync/app-schema.ts`, `core/powersync/powersync.service.ts`
- `frontend/src-tauri/src/lib.rs`, `upload.rs`, `printing.rs`, `receipt.rs`, `receipt-schema.sql`
- `powersync/sync-config.yaml`, `powersync/postgres-init.sh`

## 3. Supplied API contract: confirmed details and gaps

Sources: `docs/Technical-Specification-Digital-Invoicing.txt`, especially sections 2.1-2.6 and annexures; `docs/fbr_digital_invoicing_reference.json` is a derived reference, not an independent authority. Specification issue date is November 2023; confirm its applicability with the installed provider before production.

Confirmed from supplied contract:

- POST JSON; purchase `invoiceType = 1`, sale `invoiceType = 2`. Internal `sales.sale_type` values `DEBIT/CREDIT` are payment/accounting semantics, not this field or FBR `saleType`.
- The document identifies remote sandbox and production URLs ending in `PostInvoiceData_v1`. It mentions installed software, but supplies no localhost host/port/path or installed-service API contract.
- Success body contains `statusCode`, `errorMessage`, `result` (a string FBR tracking/invoice number), `timestamp`, and errors. HTTP success alone is insufficient.
- The original response example uses `errors.$values`; the derived JSON uses `errors.values` and describes a string list. Confirm actual shapes, then normalize explicitly while retaining the original body.
- Source requires tracking number and verification QR on the invoice, but gives no authoritative QR payload/verification URL specification.
- Source table says numeric `invoiceType` while its sample sends a string. `saleType` is described as numeric but annexure codes include `T1000017`. Do not silently strip prefixes/coerce values.
- No documented idempotency key, invoice lookup/reconciliation API, status endpoint, health endpoint, or safe replay contract.
- Source sample embeds a token and disables certificate validation. Do not copy either; no live calls or credentials are needed for planning.

Contract-validation blockers:

1. Installed service product/version, local base URL, exact submission path, request/response samples, authentication ownership, and supported operating environments.
2. Whether service acceptance means final FBR registration or only local queuing, and how eventual tracking numbers are retrieved.
3. Documented duplicate protection, lookup/reconciliation, retry semantics, and error classification.
4. Exact code/type/date/decimal rules, FBR account/POS binding, header/line total meanings, and purchase counterparty/destination semantics.
5. Approved default-customer treatment and required customer identity values.
6. Required QR encoding/verification rules and treatment of receipts printed before FBR acceptance.

No fabricated localhost default: introduce `FBR_CLIENT_BASE_URL` and `FBR_CLIENT_INVOICE_PATH` in the Rust runtime environment, with provider-verified local defaults fixed in milestone M1. Those exact values are currently a blocker. Do not default to a remote government endpoint or silently fall back to one.

## 4. Target architecture and lifecycle

```text
Angular feature repositories
  -> existing native SQLite write transaction
       business document + stock/ledger effects
       immutable fiscal source snapshot + fiscal document + origin outbox
  -> Rust app-scoped dispatcher
       durable attempt-start record before I/O
       -> local installed FBR REST service
       durable completion/error record + fiscal status
  -> existing Rust PowerSync uploader -> backend bulk services -> PostgreSQL
  -> PowerSync store-scoped downloads -> store-wide audit UI
```

Backend is persistence, tenant validation, settings, and audit/query authority; it is not a second FBR dispatcher. A backend-created transaction must have an explicit originating registered terminal or remain visibly awaiting origin assignment; never silently omit fiscal reporting or dispatch on a random PC.

Suggested document states: `QUEUED`, `SENDING`, `ACCEPTED`, `RETRY_WAIT`, `REJECTED`, `OUTCOME_UNKNOWN`, plus `NOT_REQUIRED` for explicit disabled-at-completion eligibility. A paused queue is a dispatch condition, not a rewrite of accepted/rejected history.

- Freeze eligibility, origin, settings version, source identity and fiscal snapshot at completion. Do not auto-enroll old non-FBR documents after enablement.
- Claim eligible local-origin work atomically. Single Rust worker shared by windows; use a stable persisted installation ID and process-safe claim/lock.
- Before each network request, commit exact body, sanitized URL/headers and attempt-start event. If that persistence fails, do not send.
- Append response/error outcome after I/O. If the app dies after start, on recovery conservatively mark unknown; absence of a response does not prove non-delivery.
- Automatically retry only provider-documented safe cases, including proven pre-delivery connection failures; use bounded exponential backoff/jitter and persistent next-run scheduling. Do not assume every 5xx is safe.
- Nonretryable validation/auth errors remain visible with specific remediation. Unknown outcomes require owner reconciliation, evidence/reference and an audited decision.
- `ACCEPTED` requires contract-confirmed business success and a nonempty tracking number. An initial local acknowledgement is not fiscal success unless provider guarantees that meaning.
- Do not process invoices downloaded from another terminal. Replacement/lost-PC recovery is an explicit owner-led reconciliation/reassignment procedure; never automatic failover.
- Backend sync and FBR queue state are independent: show both. Business writes, fiscal snapshots and audits must survive offline operation and app restarts.

## 5. Field mapping and required data changes

### Store, parties, products and reference data

| API field / concern | Current source | Planned source/change |
| --- | --- | --- |
| Reporting account/legal identity | Store NTN/name/address | Reuse; require provider-valid identity/address for enabled stores; snapshot at completion even if not all fields appear in JSON |
| `bposId` | Missing | Store FBR configuration; if provider binds POS ID per PC, add terminal override with explicit provisioning |
| `invoiceType` | No fiscal enum | Explicit mapping from sales/purchases; never from `DEBIT/CREDIT` |
| `invoiceDate` | Sale `sold_at`; no purchase date | Store timezone date conversion; purchases store invoice date and receipt time separately; provider-verified formatting |
| `ntN_CNIC`, `buyerSellerName` | Customer optional NTN/name; no supplier | Sales selected/default customer's validated identity/name; purchases supplier identity/name; snapshot |
| `destinationAddress` | Store address; no customer address | Add customer/supplier address; determine proper transaction-specific destination in M1, not automatically copy counterparty address |
| `saleType` | Missing | Approved transaction code reference plus store default/document selection, validated against supported profile |
| Distributor identity/name | Missing | Optional store/document configuration only where relevant; snapshot, do not require universally |
| `hsCode` | `products.pct_code` candidate | Validate actual HS/PCT format against approved list; do not use store-unique PCT as generic product code |
| `productCode` | Optional SKU | Use SKU where valid, otherwise stable internal product ID if provider accepts; settle rule in M1 |
| `productDescription` | Product/sale item name | Immutable line description snapshot |
| `uoM` | Units string `code` | Add `fbr_uom_code` mapping; existing unit IDs/codes are not assumed numeric FBR IDs |
| `rate` | Aggregated fractional sale rate | Explicit supported tax classification; verified fraction-to-percentage conversion, not direct copy |
| `quantity` | Decimal(18,2) | Snapshot exact quantity and conversion; provider-required precision validation |
| Fiscal reference lists | Attached transaction/UoM/HS/rate/SRO data | Versioned, reviewed reference data; searchable selectors, effective dates where supplied, no blind import of samples |

Recommended `store_fbr_settings` (one row/store): UUID ID, unique store FK, enabled default false, BPOS identity, default transaction code, default customer FK, optional distributor identity/name, configuration version, updated-by and timestamps. Reuse store identity rather than duplicate mutable legal fields without need. Owners update through store API; sync only nonsecret configuration. Validate all required settings as one enable operation.

Add `fbr_terminals` if server-side origin validation is not covered by an existing terminal registry: store FK, installation UUID, display name, active flag, optional provider-required BPOS binding, timestamps. Registration must not rotate on ordinary app restart/logout. No new terminal may claim old ambiguous work automatically.

Customer changes: destination/address support and `default_customer_id` configuration. A default must be active, in the same store, and have provider-approved data. Enabled stores must not fall back to a made-up taxpayer. Exempt/walk-in special rules require actual provider support.

### Fiscal amounts: all contract fields must have explicit ownership

| API fields | Planned mapping/validation |
| --- | --- |
| `valueSalesExcludingST`, `salesTaxApplicable`, `totalValues` | Immutable per-line taxable value, classified sales tax amount and fiscal line total |
| `retailPrice`, `totalRetailPrice` | Separate reference/fixed retail valuation where required; not automatically selling price or net invoice total |
| `stWithheldAtSource`, `totalSTWithheldAtSource` | Separate applicable line amount and exact header sum |
| `extraTax`, `totalExtraTax`; `fedPayable`, `totalFEDPayable`; `cvt`, `totalCVT` | Explicit classified line amounts and header sums; mandatory CVT can be zero only under a confirmed nonapplicable rule |
| `furtherTax` | Explicit line amount; do not invent a header field |
| `whiT_1`, `whiT_2`, `whiT_Section_1`, `whiT_Section_2`, `totalWithheldIncomeTax` | Separate amount/section snapshots; verify aggregation rule |
| `sroScheduleNo` | Validated optional schedule mapping; never send sample sentinel as a default |
| `totalSalesTaxApplicable` | Exact sum of line sales tax under verified rounding rules |

Use PostgreSQL NUMERIC and BigDecimal, local decimal text and existing scaled-decimal helpers; lossless Rust serialization to the API's numeric JSON types. Avoid floating-point arithmetic or accidental string-number conversions.

Current sales compute taxes per undiscounted line while applying discount only at header taxable amount. Consequently direct fiscal mapping can disagree with invoice totals. M1/M3 must specify deterministic per-line discount allocation and penny residual handling and test exact sums against existing business totals. Do not silently change existing checkout tax behavior. If the provider's tax formula cannot represent the existing amounts, stop affected profile rollout pending an explicit business decision and matching backend/frontend calculator changes.

For enabled stores, selected products need valid fiscal mappings and supported tax profiles at completion. New optional fiscal fields do not become globally NOT NULL for historical/disabled-store data. Snapshot calculated tax components, not just the current aggregated `sale_items.tax_rate`.

## 6. Backend and local data model

### Purchase foundation (new)

- `suppliers`: UUID, store, name, NTN/CNIC, address, contact fields, active status, timestamps. No implicit customer/supplier merge.
- `purchases`: UUID, store, originating terminal, supplier, internal purchase number, supplier invoice number, invoice date, received-at time, currency, subtotal/discount/tax/total, `DRAFT/COMPLETED` status, creator, timestamps.
- `purchase_items`: UUID, purchase/product relations, immutable product name/code/unit/quantity, unit cost, taxable/tax/line totals, fiscal breakdown snapshot as needed. Purchasing cost is not product selling price.
- `stock_movements`: nullable `purchase_id`, `purchase_item_id` with indexes and same-store relationship checks. Use `STOCK_IN`; no sale/payment/ledger rows manufactured for purchases.
- Finalize once atomically: header/items, stock increments, stock movements, fiscal snapshot/outbox when enabled. Draft edits have no stock or FBR effects. Completed purchase financial data is immutable; changes use a separately linked purchase return, while other corrections remain deferred.
- Document supplier invoice duplicate policy and numbering uniqueness in M1. Suggested internal uniqueness is store + originating terminal + local sequence; handle supplier reference duplicate warnings explicitly.

### Return records (new)

- `sales_returns` / `sales_return_items`: UUIDs, store and originating terminal, original sale and original sale-item references, reason, quantities, immutable value/tax adjustment snapshots, status, actor and timestamps. Finalize once; atomically record the stock disposition and refund/customer-credit or receivable adjustment. Only saleable quantities return to available stock.
- `purchase_returns` / `purchase_return_items`: UUIDs, store and originating terminal, original purchase and purchase-item references, reason, quantities, immutable value/tax adjustment snapshots, status, actor and timestamps. Finalize once; atomically reduce stock and payable or record supplier refund/credit. Retain supplier-issued credit-note/supporting document details and evidence.
- Enforce same-store ownership, quantity/value limits against the original unreturned balance, and idempotent finalization. A return cannot mutate its source invoice or be finalized twice.
- A sales return may create a fiscal adjustment document linked to the return and original sale, but only if M1 confirms the applicable provider endpoint and contract. Extend `fbr_documents` with a mutually exclusive sales-return source rather than overloading or rewriting the original sale. Purchase returns record supplier-provided fiscal evidence; they do not create an outbound sales submission unless the verified rules explicitly require one.

### Fiscal persistence (new, same logical records locally and centrally)

1. `fbr_documents`: UUID, store, exactly one supported source among `sale_id`/`purchase_id`/`sales_return_id`, optional original-invoice relation for adjustments, document type, origin terminal, actor, settings/schema versions, eligibility snapshot, source-snapshot JSON + hash, state, string tracking number, FBR timestamp, accepted-at, created/updated timestamps. Add a return source only for the verified sales credit-note workflow; supplier-issued purchase-return evidence is not an outbound document.
2. `fbr_request_revisions`: UUID, document FK, revision number, exact immutable serialized request body, body hash, endpoint/config version, correction reason/actor/time. Allows explicit correction of a rejected payload without rewriting prior evidence.
3. `fbr_attempts`: UUID, store/document/revision FKs, origin terminal, durable attempt index, method, sanitized resolved URL/headers, exact body or immutable revision reference, started-at. Insert-only, persisted before every HTTP call.
4. `fbr_attempt_events`: UUID, attempt FK, kind (`RESPONSE`, `TRANSPORT_ERROR`, `RECOVERED_UNKNOWN`, `RECONCILIATION`), HTTP status, raw response body where received, parsed business code/errors/result/timestamp, transport details, recorded-at, actor/evidence for manual decisions. Append-only; do not overwrite a start record with its outcome.
5. Terminal-local outbox/claim table: document, owning terminal, next attempt time, backoff count, dispatch claim/session information. This scheduler is not the audit source and is never used on other terminals after downloading history.
6. `fbr_config_events` / document state events: store, entity, actor/terminal, old/new state or nonsecret settings revision, reason, event time. Audit enable/disable, correction, requeue, reconciliation and reassignment actions.

Use explicit relational FKs/checks for mutually exclusive fiscal-document sources and same-store ownership; UUID IDs generated offline. Add uniqueness for one fiscal document per source, document/revision, and attempt identity/index. Scope tracking-number uniqueness to the provider's documented account/environment, not a guessed global guarantee.

Expose tracking number/status to sale, purchase, and applicable sales-return detail DTOs through the canonical fiscal document relation; keep existing invoice numbers unchanged. Avoid maintaining a second independently writable FBR number on source documents; if a summary column is needed, it is a controlled projection updated atomically.

FBR payloads contain sensitive party data: persist necessary exact body/response for audit, restrict role-based access/export, never store bearer/session headers or secrets. Secure provisioning belongs in native credential storage if local auth is required. Set body-size limits with explicit failures, not silent truncation, and define retention/backup policy before production. Local immutable records are an operational audit trail, not proof against a malicious device administrator.

### Persistence and replay rules

- New feature bulk services enforce tenant ownership, valid enums/precision, source-document relationships, terminal ownership and permitted state transitions.
- Audit PUT replay with same UUID/content is accepted as a no-op; conflicting content is rejected. Audit PATCH/DELETE is rejected. Document state projection updates must be monotonic/validated; a stale device must not regress accepted state.
- A successful local API response cannot be independently verified by the backend from client data alone. Label recorded acceptance as client-reported unless provider-signed evidence/verification exists.
- Parent/child order: suppliers/terminal/settings -> purchases -> purchase items -> purchase returns/items and sales returns/items -> fiscal documents -> request revisions -> attempts -> attempt events; stock movements after their source items. Avoid circular foreign keys through a last-attempt pointer.
- Existing grouped uploads do not preserve a whole business transaction atomically on the server. Make each operation replay-safe and dependency-aware, and either add an aggregate-aware validation boundary for purchase completion/fiscal transitions or stage projection until required children exist. Do not consider a partially uploaded purchase eligible for remote processing.
- Immutable audit rows must bypass destructive coalescing semantics and survive rejected/replayed batches; verify `SyncChangeSet` behavior before wiring them. No acknowledgement while any evidence is rejected.
- Preserve local evidence under prolonged backend outages. Permanently rejected audit writes need actionable diagnostics and a repair path; do not silently discard the batch or deadlock ordinary sync without surfacing it.

## 7. Layer-by-layer implementation

### Backend / PostgreSQL

- Add forward-only Flyway migrations after the current deployed latest version, not edits to V1-V7. Add FKs/indexes/defaults/backfill eligibility safely; historical transactions are not automatically queued.
- Add feature-local supplier/purchase/fiscal models, DTOs, resources/services/repositories/bulk services and table registry entries; reuse existing bulk/validation conventions.
- Extend store settings API with owner-only FBR provisioning/enable/disable and same-store default-customer validation.
- Add store-scoped paginated fiscal history/detail APIs if backend browsing/export is needed; locally populated UI remains offline-first. No general endpoint that tells the cloud backend to call localhost.
- Audit recovery/correction/reassignment commands require authorization, reason and event evidence. Exact endpoints finalized alongside existing API conventions.
- Update OpenAPI, schema overview, backend docs and sync tests.

### Native Rust / SQLite / PowerSync

- Extend PowerSync table schema and indexes through existing native schema lifecycle. Add Rust-owned versioned DDL for terminal-local scheduler/config; no separate database engine.
- Initialize dispatcher alongside native database initialization, independently of successful cloud connection, once per app/database and shared across windows.
- Separate FBR service credentials/client from backend bearer auth; validate resolved URL and path, maintain TLS verification, reject credential-bearing URLs, expose invalid ENV values as errors. Permit intended local HTTP; network-accessible nonloopback endpoints need an explicit supported deployment rule.
- Use `FBR_CLIENT_BASE_URL` and `FBR_CLIENT_INVOICE_PATH` runtime ENV, shipped verified defaults and example config. Changes restart/reconfigure explicitly, cannot retarget an in-flight revision without an audit event.
- Stop/partition workers on logout/store switch, validate current store and origin for every claim, preserve in-flight unknown outcomes, resume only eligible origin work. A cached store disable takes effect locally; disconnected PCs learn remote changes only on sync, which must be visible.
- Extend PowerSync store-scoped streams with supplier/purchase/fiscal tables and parent scoping where necessary. Secrets and dispatch claims do not sync.
- Verify publication/default privileges in deployed PostgreSQL and restart/reload PowerSync rules according to repository deployment practice.

### Angular / operational UI

- Store settings: FBR enable switch, setup readiness errors, BPOS/default customer/transaction code, optional distributor data, status of nonsecret configuration. Owner-only actions; runtime endpoint is shown read-only, not an unrequested per-store URL override.
- Suppliers: list/search/create/edit/deactivate with fiscal identity/address validation when used for enabled purchases.
- Purchases: register/filter, draft entry, supplier selection/reference/date, item quantity/cost/tax entry, totals/readiness, explicit receive/finalize action, details with stock links and FBR status/number.
- Checkout: select the configured default customer, allow explicit override, show required fiscal-data errors before completion; no network dependency for checkout.
- Products/units/taxes: searchable FBR code mappings and profile validation; show incomplete mappings before activation/transaction completion.
- Sales/purchase lists and detail: separate internal/supplier/FBR numbers, reporting state, last attempt/error, origin terminal, backend sync pending indicator. Do not use one green status for both sync and FBR.
- FBR activity: per-document timeline and immutable request/response inspector, filters for pending/rejected/unknown/accepted/paused, safe retry only when eligible, owner reconciliation/correction UI, access-controlled export.
- Add linked sales-return UI: select the original invoice, choose returnable items/quantities, enter reason, show tax/stock/refund-or-credit effects, and display any separately submitted FBR adjustment status. Preserve the existing void UI/behavior; never present a local void as an FBR reversal.
- Add linked purchase-return UI: select the original supplier invoice, choose returnable items/quantities, record reason and supplier credit-note evidence, show stock/payable/refund effects, and display the original purchase's FBR status without implying the supplier invoice was canceled.
- Typed gateway services invoke Rust commands; components use domain models, repositories and Material controls. Keep translations/accessibility consistent.

### Receipts

- Preserve original immutable receipt source and financial amounts.
- Add fiscal metadata snapshot/revision/addendum keyed by sale and accepted document; render FBR tracking number and provider-approved QR from that evidence.
- Original receipt printed before acceptance must clearly show reporting pending, not an invented number/QR; approved later copy/addendum includes accepted identity. Legal permissibility requires provider confirmation.
- Extend native layout/ESC-POS generation and preview, supported 58/80mm profiles and print retry/reprint history. QR is a real printer/preview capability, not merely a line of text.
- Purchase invoice/details display tracking number too; clarify whether purchase print/export is required before adding a new purchase print pipeline.

## 8. Milestones, dependencies and exit criteria

These are execution todos, not completed features.

| ID | Milestone | Depends on | Detailed deliverables and exit criteria |
| --- | --- | --- | --- |
| M0 | Publish approved plan | Plan approval | Copy this milestone document to `docs/fbr-integration-plan.md`; preserve unresolved decisions. No implementation implied by publishing |
| M1 | Verify local provider contract | M0 | Obtain installed service samples; fix verified ENV defaults; resolve types/codes/auth/async acceptance/QR/default customer/amount semantics and replay rules; contract fixtures pass without live secrets |
| M2 | Add settings, terminal identity and reference mappings | M1 | Forward migrations, native schema, owner-only store config, default customer, unit/product/tax mappings, mandatory-when-enabled validation and versioned configuration audit; disabled-store behavior unchanged |
| M3 | Define fiscal snapshots and audit persistence | M1, M2 | Complete field mapper and decimal/discount reconciliation; shared sales/purchase snapshot contract; durable append-only documents/revisions/attempt events, replay validation and source relations; exact amount/immutability tests |
| M4 | Build supplier purchase foundation | M2 | Supplier CRUD, purchase draft/finalize backend and local repositories/UI; atomic stock-in and immutable completed bill; no supplier ledger; same-store and finalize-once tests |
| M5 | Wire PowerSync and backend replay | M3, M4 | New bulk services/registry, ordering and coalescing validation, store-scoped download rules, backend projection consistency, rejected-audit recovery, deployed publication checks; offline round-trip and replay/isolation tests |
| M6 | Implement native FBR dispatcher | M3, M5 | Runtime ENV/client, stable origin claims, durable-before-send, retry/backoff, unknown recovery, disable pause/resume and session lifecycle; mock-server crash/restart tests prove no blind replay |
| M7 | Connect transaction completion and audit UI | M4, M5, M6 | Atomic sales/purchase outbox hooks; mandatory metadata/default selection; read-only synced histories; origin-only dispatch, pending/error/reconciliation workflows and role checks; backend-created transaction origin policy enforced |
| M8 | Add sales return and credit-note workflow | M1, M3, M5, M7 | Backend/native return records and sync; linked immutable return records; quantities/tax adjustments; atomic stock and refund/customer-credit/receivable effects; provider-approved credit-note submission, audit and reconciliation; original invoice remains unchanged |
| M9 | Add purchase return and supplier-credit workflow | M1, M4, M5, M7 | Backend/native return records and sync; linked immutable return records; quantity/value constraints; atomic stock/payable/refund effects; supplier credit-note evidence and permitted input-tax adjustment; no assumed outbound sales submission |
| M10 | Add fiscal receipts and end-to-end readiness | M7, M8, M9 | Immutable addendum/reprint/QR implementation, exact payload/number persistence and sync, targeted backend/frontend/Rust/E2E validation, pilot/runbook and documented local-void/cancellation policy |

M3 and M4 can proceed independently after their stated prerequisites. M5 gates end-to-end persistence; no production dispatcher before that gate is verified.

## 9. Verification matrix and rollout

- Contract: purchase/sale discriminator, exact key case (`ntN_CNIC`, `uoM`, `whiT_*`), accepted/failed/malformed responses, actual errors wrappers, UTF-8 party data, string tracking IDs, numeric serialization and timezone date boundaries.
- Money: fractional quantities, rate fraction/percentage, multiple tax categories, 0/exempt profiles, retail/fixed value vs price, discounts and rounding residuals; each required header equals approved line aggregation with zero-cent discrepancy.
- Business: enabled metadata required, disabled metadata optional, default-customer validation, drafts never report, finalization idempotent, one stock effect, no fiscal report from manual adjustment/initial stock or customer payment; each return links to the correct source, cannot exceed its unreturned quantity/value, preserves source invoices, and produces exactly one stock/accounting effect.
- Returns: cash and credit sales returns, paid and unpaid credit-sale returns, saleable versus unsaleable stock disposition, supplier returns before/after payment, supplier credit-note evidence, permitted input-tax adjustment, partial returns, duplicate finalization, and offline retry/reconciliation.
- Durability: kill/restart before send, after attempt commit, after request delivery, before response persistence and before backend acknowledgement; retain evidence and route ambiguous cases to unknown. Disk failure before audit commit prevents HTTP.
- Sync: offline -> online -> backend -> another same-store device; stable UUID replays, conflicting replay rejection, late/out-of-order events, partial parent failures, stale accepted-state regression, publication/grants and rule migration.
- Tenant/role: cross-store IDs and terminal impersonation rejected, no credential sync/logging, owner settings/reconciliation, restricted sensitive payload access and export.
- Origin: two windows and two PCs, downloaded invoice not dispatched, stable origin across restart, store switch/logout, lost originating PC with audited recovery, remote disable visibility while offline.
- Receipts: pending vs accepted, real QR, later reprint without mutating source, number present on details, 58/80mm layouts, printer uncertainty remains separate from fiscal uncertainty.
- Void risk: test/document existing behavior without silently changing it; show that local void does not reverse FBR. Production sales readiness requires an explicit decision on this unresolved gap.
- Run focused Maven feature integration tests, Jest repositories/services, existing lint/type/build commands, Cargo tests/check, and targeted desktop E2E. Use mocked local FBR for automated tests; provider-approved sandbox only for controlled pilot.

Deploy backend/migrations first, then PowerSync rules and desktop schema/client; keep all stores disabled through rollout. Validate older clients and avoid enabling settings until every participating terminal supports the contract. Pilot one configured store/origin terminal with provider-approved fixtures before broader enablement.

Rollback is disable + pause, not deleting invoices/audits. Preserve accepted/unknown records, local outboxes, backups and recovery instructions. Audit sync is eventual: total PC/disk loss before synchronization cannot guarantee recovery of offline-only requests. Document that limit and backup expectations.

## 10. Open decisions / production risks

1. Exact local URL/path/defaults and service behavior remain unavailable. M1 blocks implementation of real transport.
2. Walk-in/default customer approval, precise fiscal formulas/code mappings and QR rules must be confirmed with provider/tax owner.
3. Linked sales and purchase returns are planned, but the applicable credit-note/adjustment workflow and tax treatment require M1 provider/tax-owner verification. The existing local void remains distinct; production sales use requires an explicit policy for voiding invoices already accepted or in `OUTCOME_UNKNOWN`.
4. Partial-payment and broader receipt/payment workflows remain future scope; they must not create additional FBR invoices. General invoice corrections/cancellations and debit notes also remain future scope pending separate research and approval.
5. Purchase supplier-reference duplicate rules, internal numbering, purchase printing needs and supported initial tax profiles need confirmation during M1.
5. Origin-device loss, audit retention/access/backup policy, remotely disabled offline devices and backend-origin document routing require an operational runbook.
