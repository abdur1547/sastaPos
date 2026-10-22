# FBR integration design and implementation milestones

Status: **proposed implementation contract, not implemented**. Architecture updated on 22 October 2026: **the existing Spring Boot backend is the only FBR caller and credential owner**. This supersedes desktop-owned TypeScript mapping/dispatch, native FBR HTTP/credentials and local request-audit upload.

Targets **FBR DI API v1.12**, the newest API document linked by the official technical-assistance page when verified on 22 October 2026 (PDF updated 24 July 2025). This does not assert that no newer unpublished/portal-specific revision exists. No installed FBR service or legacy adapter is assumed.

Related contracts: [business use cases](./use-cases.md), [database schema](./db-schema.md), [transaction scenarios](./fbr_scenarios.md). The [2023 specification](./Technical-Specification-Digital-Invoicing.txt) and [derived JSON](./fbr_digital_invoicing_reference.json) are historical only, not current payload/reference-data seeds.

## 1. Scope and decisions

1. Sales, purchases, returns and approved voids remain local-first: commit business effects and fiscal intent atomically in native SQLite, then synchronize. Checkout never waits for backend/FBR availability.
2. **Backend Java owns authoritative FBR eligibility, request/response mapping, exact decimal serialization, HTTP, state transitions, attempts, manual retry authorization and reconciliation.** Reuse the existing Spring monolith; no new Node/TS microservice. The earlier all-business-logic-in-TS requirement is superseded for FBR integration.
3. Angular owns presentation, local business validation, capture of immutable fiscal source data/commands and cached status. Rust owns existing SQLite/PowerSync transport and printing, **not FBR HTTP, tokens, mapping, dispatch or scheduling**.
4. After an eligible operation is durably uploaded, backend performs **one initial attempt** asynchronously. Offline capture uploading later still receives its first attempt automatically; this is delayed initial processing, not a retry.
5. **No automatic FBR retries.** Failed/rejected/unknown attempts are never retried by timers, restart, PowerSync reconnect or duplicate upload. User Send/Retry is a durable idempotent command. Backend safe upload/job acquisition recovery is separate from retrying a possibly delivered request.
6. Exact sanitized requests, responses and transport errors stay **only in backend PostgreSQL**. No raw-exchange API, export, frontend inspector or PowerSync/SQLite replication in V1, including for OWNER. Only allowlisted status, returned invoice ID, timestamps and actionable diagnostics download. While disconnected the terminal shows cached status, not a claim of current FBR state.
7. Ordinary supplier purchases/returns/voids retain **supplier evidence**, not store-issued sales submissions. Special sector purchase profiles require separately verified support.
8. Registration and reporting enablement remain separate. Documents posted while off are permanently REPORTING_OFF in V1, with no backfill. Unregistered sources are NOT_REGISTERED. A switch is requested application behavior, **not a legal exemption**.
9. Turning off pauses queued/unattempted work. Re-enabling permits new eligible initial work, but previously paused work needs explicit Send/Retry; no automatic backlog drain. Already started calls may finish.
10. Save valid business documents despite missing fiscal metadata: show Needs attention and allow OWNER correction of fiscal metadata only. No invented identities, codes or amounts; posted financial changes require business correction.
11. OWNER configures public settings, corrects and reconciles using safe workflow summaries. OWNER/CASHIER may request known-safe Send/Retry. Credentials and raw audit are backend-operations concerns, not POS customer forms or raw-data endpoints.
12. Accepted-invoice void requires a verified linked fiscal reversal; unknown/sending originals require reconciliation. A cached desktop state cannot authorize cancellation of a backend job; section 6.6 defines the server gate.
13. Keep one writing terminal/store for financial operations. Backend workers may be replicated but use database claims/constraints. **No desktop fallback sender**, even during backend outage.
14. No settings-history table in V1. Each fiscal intent freezes nonsecret posting-time settings; latest current settings still gate actual dispatch.

Availability during backend outages, switching reporting off, manual-only retries, missing fiscal metadata, provisional receipts and time-of-supply obligations require compliance-owner approval before production.

## 2. Current implementation and prerequisite gaps

Source observations, not verification of a deployed DB:

| Surface | Existing evidence | Consequence |
| --- | --- | --- |
| Legacy POS metadata | [V8](../backend/src/main/resources/db/migration/V8__pos_info.sql) | Not part of FBR DI onboarding, payload, readiness or new integration APIs; no global POS setup dependency |
| Backend | [security](../backend/src/main/java/com/sastapos/sasta_pos/config/security/SecurityConfig.java), feature-based Spring modules | Add an `fbr` feature with injectable ports/services, not a second application |
| Posting | [SaleRepository](../frontend/src/app/features/sell/data/sale.repository.ts) uses native-backed transaction/receipt commit | Add immutable fiscal source intent to that transaction; no FBR call |
| Amounts | [current calculator](../frontend/src/app/features/sell/domain/sale-calculator.ts) taxes undiscounted lines with fractional rates; use case 5 plans allocated discounts/percentage rates | Complete shared calculator/schema migration with backend parity; no mapper-only tax fix |
| Native database | [gateway](../frontend/src/app/core/database/database.service.ts), [schema](../frontend/src/app/core/powersync/app-schema.ts), [service](../frontend/src/app/core/powersync/powersync.service.ts) | Reuse native SQLite, no browser DB/second driver |
| Upload | [Rust connector](../frontend/src-tauri/src/lib.rs), [transport](../frontend/src-tauri/src/upload.rs), [registry](../backend/src/main/java/com/sastapos/sasta_pos/sync/SyncTableConfig.java), [coalescing](../backend/src/main/java/com/sastapos/sasta_pos/sync/SyncChangeSet.java), [routing](../backend/src/main/java/com/sastapos/sasta_pos/sync/SyncUploadService.java) | Current flat per-table operations/partial acceptance are **not** use case 13's atomic operation boundary |
| Business foundations | Vendors/purchases/shared returns/costing/ordered operations documented in related contracts | Reuse these models, no duplicate suppliers or separate sales/purchase-return families |
| Void | [local void repository](../frontend/src/app/features/sales/data/sale-void.repository.ts) reverses local effects only | Add backend fiscal authorization before fiscal-managed void can change business effects |
| Receipts | [native immutable snapshots](../frontend/src-tauri/src/receipt-schema.sql) | Download fiscal addenda/acceptance; do not rewrite financial receipt snapshot |
| Replication | [streams](../powersync/sync-config.yaml), [publication](../powersync/postgres-init.sh) | Allowlisted safe projections only; raw audit/jobs/secrets must be excluded at DB privileges/publication as well as query level |
| Mock | [legacy mock](../mock-fbr-api/README.md) always returns obsolete success | Replace with current contract/fault fixtures for backend tests |

Forward migrations follow the actual deployed latest version (checked-in migrations currently through V8). Documentation is not a claim these foundations already work.

## 3. Verified FBR contract, hosting and credentials

### 3.1 Official evidence

| Source | Verified information / limitation |
| --- | --- |
| [Technical-assistance page](https://www.fbr.gov.pk/di-technical-assistance/173967/173970), [API v1.12 PDF](https://download1.fbr.gov.pk/Docs/20257301172130815TechnicalDocumentationforDIAPIV1.12.pdf) | Current linked API, updated 24 July 2025; sections 3-5 describe bearer auth, submit/validate/references, section 6 logo/QR |
| [Manual page](https://www.fbr.gov.pk/di-technical-assistance/173967/174202), [onboarding v1.5 PDF](https://download1.fbr.gov.pk/Docs/20257301171649798DIUserManualV1.5.pdf) | Licensed integration/PRAL route, IP approval for PRAL, assigned sector/business scenarios, sandbox/production credentials |
| [FAQ](https://www.fbr.gov.pk/faqs/173967/173969) questions 10, 12, 15, 17, 20 | No downloadable local FBR service; licensed configuration; interruption obligations; legal debit/credit notes; time of supply |
| [Legal provisions](https://www.fbr.gov.pk/di-legal-provisions/173967/173968) | DI rules/notifications; tax owner establishes applicability, not a UI switch |

No live invoice/validate/reference calls were made for planning. Historical payloads/lists stay unchanged but are not implementation evidence.

### 3.2 Current contract and exact endpoints

Backend adapter: `FBR_DI_V1_12`. Host: `https://gw.fbr.gov.pk`.

| Operation | Method | Sandbox path | Production path |
| --- | --- | --- | --- |
| Submit | POST | `/di_data/v1/di/postinvoicedata_sb` | `/di_data/v1/di/postinvoicedata` |
| Validate only | POST | `/di_data/v1/di/validateinvoicedata_sb` | `/di_data/v1/di/validateinvoicedata` |

Use matching taxpayer/environment bearer credentials. PDF note says token-based same-URL routing while examples use distinct `_sb` paths; use explicit paths above and confirm issued IRIS details in certification. Never fall back to production after sandbox failure.

- Wire `invoiceType`: `"Sale Invoice"` or verified `"Debit Note"`, not numeric legacy 1..4. Table's "Sales Invoice" differs from examples/reference "Sale Invoice"; certify exact latter spelling.
- Use sample key `buyerRegistrationType`, not description table typo `buyeRegistrationType`.
- Rates/UoM/sale type are reference **descriptions**, not numeric IDs or old T/U/S codes. HS examples are dotted strings preserving zeros.
- Post uses `invoiceNumber`, `dated`, `validationResponse`, per-item results. HTTP 200/top-level `"00"` is insufficient.
- Validate-only does not issue fiscal acceptance or check whether an old POST succeeded.
- Ordinary purchases are not generic sales. SN009 cotton-ginner purchase and purchase-error section do not establish universal purchase POST.
- Legal credit-note terminology does not prove public API supports `"Credit Note"` or unspecified reason/sign fields.
- No current invoice `bposId`, `invoiceItemDetails`, header `saleType`/tax sums, `cvt`, or `whiT_*`. Never send obsolete fields.

### 3.3 Backend-only secrets and network configuration

Deployment runtime settings exist **only on backend**:

```dotenv
FBR_API_BASE_URL=https://gw.fbr.gov.pk
FBR_SANDBOX_SUBMIT_PATH=/di_data/v1/di/postinvoicedata_sb
FBR_PRODUCTION_SUBMIT_PATH=/di_data/v1/di/postinvoicedata
FBR_SANDBOX_VALIDATE_PATH=/di_data/v1/di/validateinvoicedata_sb
FBR_PRODUCTION_VALIDATE_PATH=/di_data/v1/di/validateinvoicedata
FBR_REQUEST_TIMEOUT_MS=
# Master-key/secret-manager access is backend deployment provisioning,
# never an Angular or Tauri ENV or synced config.
```

- Use a backend secret manager or envelope-encrypted credential store keyed by store + taxpayer + environment; credentials never enter native storage, SQLite, PowerSync, public GETs, jobs, audit bodies, frontend ENV, logs or telemetry.
- PRAL route needs approved **backend egress**, not each store's public IP. Provision stable production egress/HA routes and verify the licensed integrator's approved topology. Customers do not manage FBR IP/network setup.
- Documented auth is the taxpayer/environment `Authorization` bearer token, resolved only by the backend.
- Authorized central operations provision/rotate credentials out of band through secure backend tooling; GET exposes only readiness/expiry/version metadata, never ciphertext/plaintext or readback. No new public POS-info write/secret endpoint in V1. No POS customer token entry screen.
- A backend-only `fbr_credential_bindings` row holds UUID, store FK, taxpayer string, environment, opaque secret reference/key version, active flag and timestamps; unique active binding/account/environment. Ciphertext, if used instead of an external vault, belongs in a restricted schema with separately managed key, not normal business tables.
- Remove replication-role SELECT/default grants for secret tables/schema. The current FOR ALL TABLES publication is not an authorization boundary: ensure secret rows are not readable by replication infrastructure, and use an explicit publication/excluded schema as needed before deployment. No secret-bearing table in any PowerSync query.
- Use a dedicated backend FBR HTTP client, HTTPS only, allowlisted host/paths, no redirects, normal certificate validation, bounded timeout, no HTTP-library retry interceptor. Test mock exceptions require explicit test configuration and dummy secrets only.
- Credential rotation can change auth on a safe later attempt, never frozen environment/account/body. Missing/disabled credentials are Needs attention/readiness errors, not fabricated response success.

Backend outages delay reporting; FBR outages fail an attempted call or block readiness. Neither undoes local checkout. There is no fallback direct-desktop sender.

### 3.4 Current reference APIs and offline cache

All relative to `https://gw.fbr.gov.pk`; backend calls with the authorized environment credential. Reference IDs select data; descriptions go into invoices.

| Purpose | Published method/path | Context / wire mapping |
| --- | --- | --- |
| Provinces | GET `/pdi/v1/provinces` | stateProvinceCode -> stateProvinceDesc |
| Document types | GET `/pdi/v1/doctypecode` | Sample Sale Invoice / Debit Note |
| HS | GET `/pdi/v1/itemdesccode` | hS_CODE + description; preserve dot/zeros |
| Sale type | GET `/pdi/v1/transtypecode` | transactioN_TYPE_ID -> transactioN_DESC |
| UoM | GET `/pdi/v1/uom` | uoM_ID -> description |
| Rate | GET `/pdi/v2/SaleTypeToRate?date=...&transTypeId=...&originationSupplier=...` | ratE_ID / ratE_DESC / ratE_VALUE; date/type/seller province |
| HS/UoM | GET `/pdi/v2/HS_UOM?hs_code=...&annexure_id=...` | Sample annexure 3; certify applicable profile |
| SRO | GET `/pdi/v1/SroSchedule?rate_id=...&date=...&origination_supplier_csv=...` | rate/date/province-dependent srO_ID / srO_DESC |
| SRO item | GET `/pdi/v2/SROItem?date=...&sro_id=...` | srO_ITEM_ID / srO_ITEM_DESC |
| Less contextual SRO items | GET `/pdi/v1/sroitemcode` | Prefer contextual endpoint when required |
| ATL / registration | Published GET `/dist/v1/statl`, `/dist/v1/Get_Reg_Type` with JSON-request examples | Method/body/status ambiguity; verify before optional implementation |

OWNER requests reference refresh; backend audits each exchange, stages/validates a complete contextual response and atomically activates cache version. Read-only cache replicates to desktop. Retain last successful data/fetched/effective time and show staleness; no checkout reference calls, guessed substitutes or global writable client baseline. Admin global baseline and store-context rows remain separate. Query date formats vary by endpoint; verify individually.

#### Why these lookups exist, and what V1 actually needs

These are FBR's **approved dropdowns and tax-rule combinations**, not extra invoice submissions. They keep our catalog/setup values compatible with FBR. The backend fetches them during setup or explicit refresh, then downloads only normalized reference rows, never raw HTTP exchanges.

| Lookup | POS-language explanation / example | V1 scope |
| --- | --- | --- |
| Provinces | Official province options for store/customer addresses; selected code maps to FBR's exact province name | Required seller/buyer mapping |
| Document types | FBR's bill categories: normal sale versus supported adjustment | Certify/cache allowed types; not a call on each bill |
| HS | Government product classification, unlike our SKU; many products can share one classification | Required product mapping; validate existing pctCode before reuse |
| Sale type | Tax treatment of a product line, **not** our cash/credit saleType; e.g. the applicable standard/reduced/exempt treatment | Required for each enabled profile |
| UoM | FBR-approved quantity labels such as the returned unit description, rather than arbitrary local abbreviations | Required mapping from local units |
| Rate | Allowed tax-rate label/value for the sale type, invoice date and seller province; not simply appending `%` to taxRate | Required for enabled taxable profiles; backend revalidates posting-date context |
| HS/UoM | Checks whether the chosen selling unit is valid for that product classification/profile | Required where supported profile uses that relation; annexure must be confirmed |
| SRO | Government notification allowing a particular special tax treatment | Conditional: only when the product's certified treatment requires it |
| SRO item | Exact entry within that notification, like a tax-rule subcategory | Conditional with SRO; not a general product requirement |
| Less contextual SRO items | Broad item list without the full date/notification context | Defer unless certified profile needs it; do not fetch both lists by default |
| ATL / registration | Optional external checks of supplied taxpayer/registration information | Defer V1; supplied tax status is not advertised as live-verified |

V1 can support a narrow certified standard-sales profile instead of implementing every special treatment. It cannot replace required reference descriptions with guesses. Missing/expired context blocks fiscal preparation or flags Needs attention according to certified validity rules; it never silently substitutes zero tax. A cached list supports offline capture, but backend checks the actual invoice-date context before dispatch.

### 3.5 Required data and FBR onboarding

Implementation gaps below were checked against the current Store, CreateStoreRequest, Customer and Product models and the existing five-step onboarding. The broader DB-schema document also contains planned fields that are **not yet implemented**.

| Information | Current state | Required change / when required |
| --- | --- | --- |
| Legal seller name | stores.name required, but labelled generic store name | Confirm it matches registered taxpayer name; reuse as legal name in V1. Add separate display name only if that distinction becomes necessary |
| Seller NTN / applicable CNIC | stores.ntn required, currently only nonblank/length validation | Confirm identity and supported taxpayer format; preserve leading zeros, bind centrally provisioned credential to same account. Do not repurpose NTN to CNIC without explicit supported-profile/schema decision |
| Full business address | stores.address optional | Require nonblank actual seller address before FBR activation, not for every non-FBR store |
| Seller province | Not in current Store | Add seller_province_code in store_fbr_settings, selected from reference data |
| Sales-tax status / STRN | Planned in DB schema, absent from current Store | Add legal salesTaxRegistrationStatus and conditional strn; distinguish legal registration from integration onboarding. STRN supports legal/POS records, not an invented DI wire field |
| Currency / timezone | Present; create request optional, onboarding supplies defaults | Confirm valid timezone and supported PKR profile; freeze invoice date using store timezone. No implicit foreign-currency conversion |
| Business activity / sector / supported treatment | Missing | Capture business_activity and sector; central operations confirms supported scenario/profile and provider. Never guess from store name |
| DI environment / onboarding / credential readiness | Missing | Start SANDBOX/reporting off. Backend operations confirms provider, scenario assignment, taxpayer/environment credential and approved egress; no secret form |
| Products' fiscal classification | Product has required pctCode, local unit and tax categories | Validate/normalize existing classification into hs_code; add FBR unit/type/rate mapping and conditional retail/SRO/tax components. Current generic product setup hides taxes |
| Buyer details | Customer has name, optional ntn/phone; no address/province/tax status | Add actual buyer address, province and evidenced tax status; model identity type if CNIC is supported. Registered buyer requires applicable valid identity. Published unregistered identity optionality does not waive other required fields |
| Supplier evidence | Purchase/vendor foundations are planned | Capture supplier-issued FBR ID/date/adjustment evidence when available; not required to activate ordinary store sales and not our outbound invoice |

**Proposed resumable OWNER FBR setup**, separate from ordinary POS onboarding:

1. **Choose integration setup:** show applicability/support guidance and reporting-off default. Non-FBR stores may finish normal onboarding; unfinished FBR setup remains visible, not falsely Ready.
2. **Confirm legal store details:** name, identity, complete address, province, sales-tax status/conditional STRN, PKR/timezone. Reuse existing stored values rather than ask twice.
3. **Choose supported business profile:** business activity/sector and needed sale/adjustment treatments. Unsupported profiles remain explicitly blocked; no free-form guessed FBR sale-type strings.
4. **Prepare catalog:** bulk map active sellable products' HS, local-to-FBR unit, treatment and rate; reveal SRO/retail/fixed-price fields only when applicable. Track unmapped products. New/unmapped products later trigger Needs attention, not fabricated mappings.
5. **Prepare buyer capture:** add customer tax/address/province fields and checkout requirements for anonymous buyers. Configure a default buyer only when actual details and a certified end-consumer scenario allow it; never invent a universal "walk-in" identity/address.
6. **Sandbox verification:** central operations provisions credentials/egress and assigned scenarios; run explicit backend validation/sample submission under approved test procedures. UI receives readiness/check results only, never payloads. No unattended production test invoices.
7. **Production review and activation:** backend verifies legal/profile/catalog/reference/credential/egress gates; OWNER acknowledges pending/manual-retry/offline/receipt behavior and explicitly enables reporting after production approval. Sandbox history never becomes production acceptance.

Store drafts/completion in PostgreSQL using current settings plus existing product/customer rows and safe progress/check summaries. Resume derives from persisted requirements, not only a browser step number. No separate onboarding table needed in V1. Initial government checks/activation require connectivity; later allowed public edits may queue offline but cannot locally assert production readiness. Changes to identity/profile/mappings must invalidate relevant readiness checks.

The existing **Create store -> Store settings -> Staff -> Customers -> Products** wizard remains basic POS setup; staff creation stays optional. Link the FBR flow after store creation and from settings for existing owners. Do not expand the current numeric/localStorage checkpoint and accidentally force all existing stores to restart. Required per-invoice buyer fields and product mappings remain ongoing checks, not something onboarding can permanently guarantee.

## 4. Architecture and SOLID boundaries

```text
Angular business use case
  -> Rust-owned SQLite transaction:
       document/items/stock/payment/ledger + operation envelope + fiscal intent
  -> checkout succeeds; receipt may be pending

Rust PowerSync uploader -> POST /api/sync/upload
  -> backend atomic operation validation:
       financial operation receipt + immutable fiscal intent
       + canonical fbr_document + initial job when eligible
  -> commit; acknowledge upload (not FBR acceptance)

Backend durable job runner (after commit)
  -> claim/check current settings and document version
  -> Java request mapper -> immutable request revision
  -> commit exact attempt-start evidence before HTTP
  -> backend secret resolver / HTTP -> FBR
  -> Java response mapper -> commit result/event/summary/job completion

PostgreSQL safe projections -> PowerSync -> native SQLite -> Angular watches / fiscal receipt addenda
PostgreSQL raw requests/responses -> restricted backend storage only
```

Backend feature contracts use constructor injection and existing Spring patterns:

| Port/service | Responsibility |
| --- | --- |
| `FbrEligibilityPolicy` / snapshot validator | Authoritative supported profile, posting evidence and dispatch eligibility |
| `FbrRequestMapper` | Pure validated snapshot/overrides/references -> typed current-DI payload |
| `FbrResponseMapper` | Strict raw exchange -> accepted/rejected/unknown, line errors/IDs |
| `FbrTransport` / `FbrCredentialResolver` | Separate interfaces: one raw HTTP exchange versus account-bound secret resolution; no fiscal policy/retry |
| `FbrSubmissionService` / `FbrCommandService` / `FbrReconciliationService` | Separate application responsibilities: dispatch orchestration, user command authorization/idempotency, evidence-based unknown resolution |
| `FbrDocumentRepository` / `FbrJobRepository` / `FbrAuditRepository` / `FbrCommandRepository` / `FbrReferenceRepository` | Narrow persistence interfaces for state/CAS, claims, immutable evidence, command receipts and reference cache |
| Angular fiscal repository/use cases | Capture intent/commands, local advisory validation, read cached models; no wire mapping or credentials |

Use `BigDecimal`, typed DTOs/enums and existing validation/error patterns. Application services depend on these **interfaces through constructor injection**, never HTTP/JPA/vault implementation classes. Concrete Spring/JPA/HTTP/secret implementations live in infrastructure; Spring configuration composes the graph. Controllers and the polling entry point call application contracts, not repositories or FBR HTTP directly.

- **Single responsibility:** mapping, outcome interpretation, transport, credentials, persistence, commands and orchestration change independently; no all-purpose FBR service.
- **Open/closed:** pin contract version per document/revision. A future certified adapter implements the same mapping/transport contracts and is explicitly selected; never silently remap a pending/unknown historical request using the newest adapter.
- **Liskov substitution:** every transport implementation performs at most one call and reports delivery certainty consistently; test adapters cannot turn unknown into safe failure.
- **Interface segregation:** small use-case/port contracts; no giant interface requiring unrelated reference, dispatch and secret methods.
- **Dependency inversion:** domain/application rules use typed snapshots and ports; no Spring HTTP/JPA classes, token values or vendor DTOs in business policy.

Reuse Spring transaction boundaries for atomic orchestration; do not commit each repository write independently. A contract-version selector is sufficient for V1; no plugin framework, interface for every value object, generic job platform or second microservice. Contract/fixture tests apply equally to mocks and production adapters.

Rust changes are native schema/upload-envelope support and existing receipt rendering only. No `fbr_http_send`, FBR credential/config commands, installation dispatch claim or FBR worker on desktop.

## 5. Data model and ownership

All new rows use UUID identities. PostgreSQL uses FKs/checks/indexes, NUMERIC/BigDecimal, JSONB for structured snapshots, and UTC timestamptz. SQLite uses UUID/UTC/JSON/decimal text and booleans 0/1. Financial arithmetic is exact, never REAL/binary float.

### 5.1 Store settings

No global POS metadata/setup participates in this integration. Existing legacy runtime code is not removed by this documentation change; any cleanup is a separate implementation task, not a prerequisite or hidden dependency.

`store_fbr_settings`: deterministic ID = store UUID, unique store FK, registration_status UNREGISTERED/REGISTERED, reporting_enabled false by default, environment, integration_provider, business_activity/sector, onboarding_status, assigned_scenario_ids, seller_province_code, optional default_sale_type_id/default_customer_id, config_version, timestamps. Server-managed dispatch_generation and last_disable_config_version form the current dispatch boundary; safe metadata downloads read-only, no separate settings-history table.

- Reuse store legal name/NTN/address/timezone/currency and planned legal STRN/sales-tax status; no duplicate secret or taxpayer identity with competing authority.
- OWNER may edit reporting/default public data offline; backend validates roles/version/constraints on upload. Provider/certification/credential-readiness fields are **server-managed**, not client claims. Expose a separate safe read-only readiness DTO.
- No settings-history table; fiscal intents snapshot public configuration. Backend current settings remain authoritative for dispatch; a stale local enable cannot bypass a server disable.
- Production requires approved onboarding/credentials/backend egress and seller data. Environment/account is frozen per obligation; never retarget sandbox or old work to a new account.
- Missing store setup is explicit Needs setup; unregistered posting is NOT_REGISTERED.

### 5.2 Fiscal metadata and references

- Customers/vendors: names, supplied NTN/CNIC, address/province and evidenced tax registration. Buyer identity is optional for Unregistered per published table, but buyer name/province/address remain required. No fake walk-in particulars; certify applicable end-consumer scenarios.
- `product_fbr_mappings`: store/product identity, dotted hs_code, uom_id/sale_type_id/rate_id/sro_id/sro_item_id, validated tax_profile_json, version/timestamps. Snapshot exact current reference descriptions for wire; HS is not unique across products; SKU stays internal.
- `fbr_reference_data`: store scope or admin baseline, profile/kind/code/description, contextual date/province/type/HS inputs + hash, version/fetched/effective dates and metadata. **Backend-written, downloaded read-only**; no client upload overwrite.
- `tax_profile_json` records supported basis, statutory fixed/retail price and classified tax components, not an arbitrary free-form FBR body.
- Purchases/shared purchase returns retain supplier_fbr_invoice_id/supplier_fbr_issued_at/supplier_adjustment_fbr_id, evidence source/attachment and verification status RECORDED_UNVERIFIED unless actually verified. Never put supplier IDs in our returned acceptance field.

### 5.3 `fbr_reporting_intents` (offline capture, immutable upload)

UUID PK stable per source/kind, store/source FKs, source_kind, origin_terminal_id/original_actor, business_operation_id, source_snapshot_json/hash/schema version, posting public-config snapshot/version, eligibility proposal/reason, target environment/account identity, created_at.

Write in the local business transaction and upload in the same atomic operation. Backend validates against uploaded financial rows and recomputes canonical eligibility/hash. Same UUID/same content is no-op; different content conflicts. Do not trust client-supplied eligibility or arbitrary signed-less actor claims. Snapshots retain actual posting date/data, not current product/customer rows.

This is the only client-created original fiscal source record. Server canonical document uses a deterministic ID derived from intent (or the same UUID), avoiding duplicate identity and allowing pre-download local links. UI merges pending intent with server projection; clients never write canonical attempt/status fields.

#### What "fiscal intent" means, and whether V1 can skip it

In POS terms this is an **invoice reporting instruction plus a frozen posting-time copy**, saved with the sale. "Fiscal" means tax-reporting-related; "intent" means we recorded what must be evaluated, **not that FBR accepted or even received it**. It contains business facts/settings, not an FBR HTTP payload or secret.

Example: at 10:00 an offline terminal sells an item for Rs 1,000 plus Rs 180 tax while reporting is enabled. One local transaction saves the sale, stock/payment effects and reporting instruction with that buyer/product/tax/config snapshot. At 11:00 the owner changes a product mapping or disables reporting. At 12:00 upload preserves the **10:00** invoice facts, while the backend's **current** disable gate may pause sending. A crash between saving sale and scheduling work cannot lose the obligation because both were one transaction. Duplicate upload cannot create a second obligation because the identity is stable.

Without posting-time evidence, a backend scan of mutable products/customers/settings could send a different tax profile or misclassify reporting-off history. A frontend boolean such as `needsFbr = true`, an in-memory event or a job created after checkout is not an adequate replacement.

**V1 recommendation: keep the concept; the separate table is optional, not an FBR requirement.** It could instead be an immutable typed reporting section in the durable business-operation envelope, provided source snapshots, config version, identity/environment, atomic commit/upload and backend validation are all preserved. That changes storage shape, not the reliability requirement. The current plan retains the separate table for clear ownership/querying; no decision to remove it is implied by this explanation. Backend-only generation is safe only if the financial upload already freezes every needed field and posting policy atomically.

### 5.4 `fbr_documents` (backend-owned, safe projection downloaded read-only)

UUID PK/intent FK, store, exactly one sale/purchase/return FK matching source_kind SALE/PURCHASE/SALE_RETURN/PURCHASE_RETURN/SALE_VOID/PURCHASE_VOID; original_document_id for adjustments; origin terminal/actor; immutable source snapshot/hash/profile; frozen eligibility/environment/account; state/state_version; nullable string fbr_invoice_id/raw dated/accepted_at; timestamps.

Eligibility: REPORTABLE, REPORTING_OFF, NOT_REGISTERED, EVIDENCE_ONLY, LEGACY_NOT_EVALUATED. Unique source/kind and intent. Same-store FK checks/type constraints, no cycles; one void reversal/original, separate partial-return obligations by return UUID.

Server source fbr_status/fbr_invoice_id summaries are controlled projections, not ordinary source PATCH. Ordinary purchase IDs are supplier evidence; our returned ID stays NULL. Desktop provisional capture state is separate local metadata, never an independently writable canonical status.

### 5.5 Request revisions and submit evidence (backend-written)

- `fbr_request_revisions`: document/revision unique, exact nonsecret UTF-8 body text/hash, profile/mapper/reference versions, frozen environment/account, fiscal overrides, correction reason/actor/time. Preserve exact text, not only JSONB formatting. New verified correction creates revision, never changes posted financial snapshot.
- `fbr_attempts`: UUID, store/document/revision FKs, document attempt number unique, job/command FK, trigger INITIAL/MANUAL_SEND/MANUAL_RETRY, actor/origin provenance, backend worker identity, method/sanitized URL/headers, credential-binding **version/reference only**, started_at. Persist before I/O.
- `fbr_attempt_results`: UUID, unique attempt FK/store, transport certainty RESPONSE_RECEIVED/NOT_SENT/DELIVERY_UNKNOWN, HTTP status/sanitized response headers/exact body, typed error, normalized outcome/errors, header invoice ID, raw dated, item statuses/issued IDs/source ordinal, finished_at. No received response is SQL NULL, different from received empty body.
- `fbr_document_events`: immutable per-document sequence, transitions/version, attempt/revision/command links, actor/worker/reason/evidence/time. Reconciliation is an evidence event, not a free-form status edit. This is workflow audit, not settings history.

All exact bodies/results are backend-only evidence in PostgreSQL. Reject client PUT/PATCH/DELETE on canonical audit tables; idempotent upload only applies to intents/commands. No raw body, parsed copy of the entire response, transport headers, stack trace or internal audit row downloads or public read endpoint.

Expose only a dedicated allowlisted document summary/timeline projection: status/version, returned ID, public times, action availability and safe actionable error code/message. It must not select `*` from audit/document tables containing snapshots or raw data. Use a single attempt -> job FK and job/document partial-unique constraints, not circular mandatory job/attempt references that prevent insert ordering.

### 5.6 `fbr_submission_jobs` and commands

**Backend-only jobs:** id, store/document/revision, trigger, unique initial-intent key or manual-command ID, status PENDING/PAUSED/STARTED/FINISHED/CANCELLED, expected state/version, dispatch_generation, worker/claim token, created/claimed/finished times. Attempt references job, not a mandatory circular FK. One active job/document via constraint; no retry counter/backoff/next-retry schedule.

Jobs are inserted atomically with accepted upload/command. A lightweight durable runner may poll **never-started PENDING jobs** and recover unclaimed initial work after restart; that is processing a first attempt, not retrying FBR. After durable attempt start, a lost worker/expired claim becomes OUTCOME_UNKNOWN, never another worker resend.

**`fbr_action_commands`:** UUID PK idempotency identity, store/document/intent, action SEND/RETRY/CORRECT_METADATA/RECONCILE/VALIDATE/REFRESH_REFERENCES/VOID_PREPARE, expected canonical state_version, target attempt/revision when applicable, immutable payload/hash/reason/evidence, actor/terminal, source operation sequence, created_at. Server-owned processing receipt records accepted/rejected/blocked/completed and result/version.

- Offline-capable actions queue in native SQLite and upload as authorized operations. Same ID/content returns same receipt/job; same ID/different payload conflicts. A command queued offline uses frozen expected version; reject stale state rather than submitting a now-accepted invoice.
- Commands captured offline are intent only, not proof of current permission/state. Backend revalidates current actor/device/store rules at execution. Distinct command IDs cannot bypass one-active-job/document or accepted-state rules.
- Online endpoints use the same command handler/idempotency ID; do not both POST and upload duplicate side effects. Prefer the offline pipeline for desktop Send/Retry/correction.
- Reconciliation/VOID_PREPARE require online authoritative state; queued drafts must not locally mark accepted/reversed. V1 does not claim these complete while offline.

### 5.7 Non-submit exchanges and restricted secrets

`fbr_api_exchanges` + unique append-only `fbr_api_exchange_results`: backend records every actual validate/reference/verified registration request, store/environment/action/actor/context, optional document/revision, exact sanitized request and response/status/error/UTC times. References require no document FK; validation never accepts an invoice.

`fbr_credential_bindings`/vault material and `fbr_submission_jobs`/claims are backend-only. No local dispatch/credentials table or client FBR ENV. Local-only upload/command UI metadata tracks captured/awaiting upload/awaiting backend/last downloaded version.

Index source/store/state/date, original document, document revision/attempt/event sequence, job state/created time, command/document/version and idempotency keys. Restrict secrets by DB privileges, not only by omitting sync queries.

### 5.8 Table/field dictionary in POS terms

This is the proposed logical inventory, not executed DDL. Comma-separated names are separate columns unless explicitly described as a JSON object. All tables have UUID `id`; store-owned tables have `store_id` with same-store foreign keys. Mutable setup rows have `created_at`/`updated_at`; immutable evidence has creation/start/finish time as specified. Enums are validated strings; identity/codes/returned invoice numbers remain strings, not integers. Bodies use exact sanitized UTF-8 text; structured snapshots use JSONB. Conditional fields remain NULL until applicable, not invented defaults.

**1. `store_fbr_settings` = store's reporting preferences/readiness.** Safe settings projection syncs; no secret data.

| Fields | Meaning / why retained |
| --- | --- |
| id, store_id | Same store UUID; one settings row/store |
| registration_status, reporting_enabled | Integration registered? Send new eligible invoices? Separate from legal sales-tax status |
| environment, integration_provider | Sandbox/production target and approved connection provider |
| business_activity, sector, onboarding_status, assigned_scenario_ids | Supported business use, setup stage and backend-assigned sandbox test scenarios |
| seller_province_code, default_sale_type_id, default_customer_id | Address/reference selector and optional genuine defaults; defaults never override actual invoice facts |
| config_version, dispatch_generation, last_disable_config_version | Optimistic edit version, server queue boundary, last disable boundary; stop stale uploads/commands reviving paused work |
| readiness_checks_json | Safe typed check results with checked time and validated config/profile versions; no bodies/secrets. Backend invalidates affected checks on setup changes |
| created_at, updated_at | Setup timestamps |

**2. `product_fbr_mappings` = government classification/tax settings for a catalog item.** Safe normalized mapping downloads; owner changes require backend validation.

| Fields | Meaning / why retained |
| --- | --- |
| id, store_id, product_id | Stable mapping identity; unique store/product |
| hs_code, uom_id, sale_type_id, rate_id | Government product class, selling unit, tax treatment and contextual rate selectors; not our SKU or cash/credit type |
| sro_id, sro_item_id | Nullable special-tax notification and entry; only required for applicable treatment |
| tax_profile_json | Typed supported basis, conversion if needed, statutory retail/fixed value and classified tax components; no arbitrary HTTP payload |
| version, created_at, updated_at | Change detection; invoice snapshots retain the mapping/version actually used |

**3. `fbr_reference_data` = approved dropdown/tax-rule cache.** Normalized active rows download read-only; raw refresh responses do not.

| Fields | Meaning / why retained |
| --- | --- |
| id, scope, store_id | GLOBAL baseline or STORE context; store_id NULL only for admin baseline |
| environment, profile, kind, code, description | Contract/reference family and exact permitted code/label |
| context_json, context_hash | Canonical query inputs: invoice date, seller province, sale type, HS, annexure, rate or notification as relevant |
| version, fetched_at, effective_from, effective_to, is_active | Atomic cache activation, staleness and any documented validity window; unknown effective bounds stay NULL |
| metadata_json | Typed normalized rate values/relationships; not a raw response copy |

Unique reference identity includes scope/store/environment/profile/kind/context/code/version. Cache activation must replace a complete context, never mix half-refreshed versions.

**4. `fbr_reporting_intents` = saved reporting instruction.** Created offline/uploaded atomically; contains business facts, not FBR wire data.

| Fields | Meaning / why retained |
| --- | --- |
| id, store_id, source_kind, sale_id, purchase_id, return_id | Stable reporting identity; exactly one matching source FK; void kind uses original sale/purchase FK |
| origin_terminal_id, original_actor_id, business_operation_id | Who/which terminal posted it and the atomic financial operation; server verifies provenance |
| source_snapshot_json, source_hash, snapshot_schema_version | Frozen seller/buyer/items/amounts/line UUIDs/date; hash detects conflicting replay, schema version permits safe interpretation |
| posting_config_json, posting_config_version, posting_dispatch_generation | Public posting policy; generation nullable when a local config proposal has no server-confirmed generation |
| eligibility_proposal, eligibility_reason | Client explanation only; backend independently evaluates |
| environment, taxpayer_identity, created_at | Original target/date; never redirected using today's account |

**5. `fbr_documents` = backend reporting tracking record for one source.** Internal snapshots remain PG-only; allowlisted status/ID projection downloads.

| Fields | Meaning / why retained |
| --- | --- |
| id, store_id, intent_id, source_kind, sale_id, purchase_id, return_id | Canonical identity/source; unique intent and source/kind |
| original_document_id, origin_terminal_id, original_actor_id | Original accepted bill for an adjustment; posting provenance |
| source_snapshot_json, source_hash, snapshot_schema_version, posting_config_json | Validated immutable posting evidence, not current catalog values |
| contract_profile, eligibility, environment, taxpayer_identity | Certified mapper contract and frozen reporting classification/target |
| state, state_version | Current workflow status and concurrency version |
| fbr_invoice_id, fbr_dated_raw, accepted_at | Nullable issued ID, original provider time and confirmed acceptance time; raw provider date stays backend-only |
| created_at, updated_at | Tracking timestamps |

**6. `fbr_request_revisions` = exact prepared invoice versions. Backend PG only.**

| Fields | Meaning / why retained |
| --- | --- |
| id, store_id, document_id, revision_number | Unique version/document; corrections do not overwrite old requests |
| request_body_text, request_hash | Exact sanitized body/hash; send persisted bytes unchanged |
| contract_profile, mapper_version, reference_versions_json | Which API/mapping/reference rules built it |
| environment, taxpayer_identity | Frozen destination account; secrets not included |
| fiscal_overrides_json, correction_reason, actor_id, created_at | Typed nonfinancial correction evidence; initial revision need not have correction reason |

**7. `fbr_attempts` = one actual send start. Backend PG only.**

| Fields | Meaning / why retained |
| --- | --- |
| id, store_id, document_id, revision_id, attempt_number, job_id, command_id | Source/body/job linkage; unique attempt number/document and job_id; command nullable for initial attempt |
| trigger, actor_id, origin_terminal_id, worker_id | INITIAL/MANUAL_SEND/MANUAL_RETRY and provenance; system initial trigger has no fabricated human retry actor |
| method, sanitized_url, sanitized_request_headers | Exact target/HTTP context without authorization or secrets |
| credential_binding_id, credential_version, started_at | Internal credential provenance only and durable send boundary |

**8. `fbr_attempt_results` = one send's recorded result. Backend PG only.**

| Fields | Meaning / why retained |
| --- | --- |
| id, store_id, attempt_id | Unique result/attempt; no overwrite or multiple contradictory result rows |
| transport_certainty, http_status, sanitized_response_headers, response_body_text | Response received / proved not sent / delivery unknown; status/body NULL if no response |
| transport_error_code, transport_error_detail | Typed network failure and sanitized backend diagnostics |
| outcome, normalized_errors_json, fbr_invoice_id, fbr_dated_raw, item_results_json | Strict interpretation and each submitted line ordinal/UUID/status/issued ID; issued line IDs are not separate header invoices |
| finished_at | When backend received/classified exchange |

**9. `fbr_document_events` = append-only reporting activity log.** PG source; only a safe status timeline projection downloads.

| Fields | Meaning / why retained |
| --- | --- |
| id, store_id, document_id, sequence_number | Ordered immutable activity/document |
| from_state, to_state, state_version | Explain state changes and prevent stale updates |
| attempt_id, revision_id, command_id, actor_id, worker_id | Nullable causal/provenance links |
| reason_code, reason_text, evidence_json, created_at | Transition/reconciliation evidence; internal evidence never included wholesale in timeline |

**10. `fbr_submission_jobs` = durable backend work queue. Backend PG only.**

| Fields | Meaning / why retained |
| --- | --- |
| id, store_id, document_id, revision_id, trigger | What to send; revision nullable before preparation, fixed before attempt start |
| initial_intent_id, command_id | Exactly one trigger identity; unique initial intent or manual command prevents duplicate work |
| status, expected_state, expected_state_version, dispatch_generation | PENDING/PAUSED/STARTED/FINISHED/CANCELLED and dispatch gate |
| worker_id, claim_token, heartbeat_at | Nullable worker ownership/liveness; expiry detects a problem, never authorizes a resend |
| created_at, claimed_at, finished_at, blocked_reason | Queue age/start/end and visible reason if blocked |

No `retry_count`/`next_retry_at`; only user commands authorize subsequent send attempts. Unique active job/document plus unique attempt/job.

**11. `fbr_action_commands` = user's durable reporting action and server receipt.** Immutable user command uploads; allowlisted receipt downloads.

| Fields | Meaning / why retained |
| --- | --- |
| id, store_id, document_id, intent_id, action | Stable idempotency key and action; document links nullable for store reference refresh |
| expected_state_version, target_attempt_id, target_revision_id | Prevent a cached retry/correction targeting a newer accepted state |
| payload_json, payload_hash, reason, evidence_json | Typed immutable request; no user-supplied FBR bodies or credentials |
| actor_id, terminal_id, business_operation_id, operation_sequence, created_at | Validated provenance; online-only actions may have no terminal operation sequence |
| receipt_status, receipt_code, receipt_message, result_state_version, result_job_id, processed_at | Server-controlled processing outcome; do not echo internal evidence into public message |
| reservation_id, reserved_document_version, reserved_operation_id, reservation_status | Conditional VOID_PREPARE receipt: durable one-use authorization and consume/abort state; no separate reservation table in V1 |

Command payload stays immutable; only designated server receipt/reservation columns transition. Reservation IDs are unique and scoped to source/store/actor/operation. Refresh context is in typed payload; reference refresh does not require a document version.

**12. `fbr_api_exchanges` = non-submit call start; 13. `fbr_api_exchange_results` = its result. Both backend PG only.**

| Table / fields | Meaning / why retained |
| --- | --- |
| exchanges: id, store_id, command_id, environment, taxpayer_identity, operation_kind, actor_id, worker_id | Reference refresh / validate / any later verified registration check and provenance |
| exchanges: document_id, revision_id, context_json | Optional invoice link and exact requested lookup context |
| exchanges: method, sanitized_url, sanitized_request_headers, request_body_text, request_hash, credential_binding_id, credential_version, started_at | Same pre-I/O durability and secret exclusion as submission |
| results: id, store_id, exchange_id, transport_certainty, http_status, sanitized_response_headers, response_body_text | Unique result/exchange and exact response; NULL versus empty retained |
| results: transport_error_code, transport_error_detail, normalized_outcome_json, finished_at | Explicit diagnostic/outcome; validate success never becomes invoice acceptance |

**14. `fbr_credential_bindings` = backend's pointer to the correct account secret. Backend restricted PG only.**

| Fields | Meaning / why retained |
| --- | --- |
| id, store_id, taxpayer_identity, environment | Account binding; match document target before sending |
| secret_reference, key_version, credential_version | Opaque backend vault/encrypted-storage pointer and rotation provenance; never in public DTO/log |
| active, expires_at, created_at, updated_at | Enable/expiry/rotation state; expiry nullable if not supplied |

At most one active binding/store/account/environment. If encrypted credential material is held in PG, it is separate restricted secret storage, not any public table or audit body.

**Existing-table changes, not more FBR tables:** Store legal registration/STRN; customer/vendor actual identity type, registration/address/province; immutable sale/return seller/buyer/item tax snapshots (may be in the intent instead of duplicate columns); supplier evidence fields on purchases/returns; backend-owned source status/issued-ID projections. Add legal-name storage only if separate shop branding is needed. `sync_transactions` remains the shared atomic upload receipt, not a second FBR-only receipt table.

**Terms:** fiscal document = invoice reporting record; fiscal intent = saved reporting instruction; submission = send to FBR; acceptance = FBR registered it and issued an ID; reconciliation = verify an uncertain send using independent evidence; HS/PCT = government product classification; SRO = special tax notification; tax profile = product tax treatment; outbox = durable database work queue. None means payment was received or tax was remitted.

## 6. State machine and processing algorithms

### 6.1 Status and UI interpretation

Canonical states: NOT_REGISTERED, REPORTING_OFF, EVIDENCE_ONLY, LEGACY_NOT_EVALUATED, NEEDS_ATTENTION, READY, SENDING, ACCEPTED, FAILED_NOT_SENT, REJECTED, OUTCOME_UNKNOWN, CANCELLED_BEFORE_SEND.

- READY is prepared/eligible or awaiting preparation; PENDING/PAUSED job condition is separate. UI: Awaiting upload / Queued at backend / Paused / Needs attention / Accepted.
- Captured locally without canonical download means **Awaiting backend**, never server READY/ACCEPTED guessed locally.
- NEEDS_ATTENTION -> READY after validated correction; READY/known-safe failure -> SENDING only via authorized job; SENDING -> accepted/rejected/not-sent/unknown; unknown -> accepted or rejected only with reconciliation evidence.
- Excluded states and ACCEPTED are terminal for that obligation; reversal is separate. Every canonical transition uses expected state/version and backend transaction.
- Backend acceptance and desktop freshness differ: Accepted on server may not be visible offline. Always show last sync time and pending action separately.

### 6.2 Local posting, upload and initial attempt

1. Validate/calculate normal business operation locally; advisory fiscal checks may flag missing fields without failing a financially valid sale.
2. In one native SQLite transaction write business rows/effects, operation sequence/envelope and immutable reporting intent with available fiscal metadata/config. Roll back if local persistence fails.
3. Commit and return normal checkout success. No backend/FBR HTTP in this transaction.
4. PowerSync retries uploading the **same stable operation** when connectivity returns. Backend authorizes and validates all financial rows/intent atomically; duplicate operation cannot create a second canonical document/job.
5. Within accepted backend transaction derive canonical eligibility and snapshot, map or mark Needs attention, insert initial PENDING job once when eligible. Commit; upload response means durable backend receipt, not fiscal acceptance.
6. Runner starts only after commit and after currently available ordered store operations/settings are applied; section 6.5 prevents disable/backlog races. Later first upload of an offline valid sale is automatically eligible for its one initial attempt, unless paused/off-at-posting/invalid.
7. Failure of initial job creation rolls back backend operation, retaining local upload for safe replay. Mapping validation failure instead persists business success + Needs attention; infrastructure errors are explicit, not silently hidden.

### 6.3 One backend HTTP attempt

1. Transactionally lock/claim PENDING job + canonical document, verify current reporting/generation/readiness/account/environment/original reference, and expected state/version; database constraints prevent two backend replicas dispatching the same document.
2. Freeze exact mapper output/revision and allocate attempt UUID/number. Commit attempt start, SENDING transition/event/source summary and STARTED job **before HTTP**. Do not hold a transaction/row lock across network.
3. Resolve matching secret and perform exactly one bounded HTTP call; no redirect/library retry/failover to desktop. Configuration failure detected before attempt creates visible blocked/readiness result, not a fabricated FBR response.
4. Retain raw exchange, apply strict Java response mapper, then atomically insert immutable result/event, update canonical/source summaries and finish job.
5. If persistence fails after HTTP, never resend. Retain response for storage-only retry, stop further work on affected obligation, alert operations. On process loss durable start with no result recovers as unknown, with explicit event. PostgreSQL availability is necessary for dispatch.
6. Graceful shutdown stops new claims and persists in-flight results where possible. Only an orphaned prior worker attempt may recover as unknown; another live replica's attempt must not be stolen by lease expiry and resent.
7. PowerSync downloads only safe canonical status/ID/timestamp/diagnostic projections; desktop watchers update. Raw request/response evidence stays in PG. Client crash/logout/device replacement does not change backend attempt ownership.

### 6.4 Manual Send/Retry, corrections and unknown outcomes

- Send starts never-attempted paused/READY work; Retry requires known-safe failure/rejection and expected attempt/state version. Both create one command-derived job, not a second source invoice.
- At most one job/attempt per command. Duplicate online request, upload acknowledgement loss, two windows and repeated sync never multiply sends. Two different Retry commands against same version: first reserves transition, second stale/conflict.
- Offline Send/Retry is **Requested locally - awaiting upload**, not retried at FBR. Once accepted, backend performs the command's single authorized attempt even if desktop has closed. Backend denial/stale version returns visible command receipt, no silent fallback.
- OWNER corrections produce immutable request revisions after definitive nonacceptance only. No edit after acceptance/sending/unknown; price/tax changes require business correction.
- Proven pre-send refusal may be FAILED_NOT_SENT. Timeout, disconnect after write, crash, partial/malformed success or mixed issued/failed lines are unknown unless verified evidence proves nonacceptance. Certify auth/error semantics; HTTP 500/empty result alone is not proof.
- No documented idempotency key/lookup in v1.12. Validate checks proposed payload, not previous delivery. OWNER uses IRIS/integrator/support evidence: accepted -> retain existing ID; confirmed not registered -> reject-with-evidence and unlock manual retry; still uncertain -> block retry.
- Unknown resolution uses an online server command and CAS; local cached ID/status cannot overrule backend.
- A backend restart may pick up PENDING jobs with no attempt start. It must never requeue STARTED/finished-failed/unknown as an automatic second attempt. This distinction is tested by HTTP call counts.

### 6.5 Reporting toggle, delayed uploads and races

1. OWNER saves public reporting settings offline in the same ordered operation stream. Locally off immediately freezes new intents as REPORTING_OFF; those remain excluded after re-enable.
2. Backend only learns offline toggles after upload. UI must say **Off locally - backend confirmation pending**; it cannot promise an already queued backend job has stopped.
3. Backend disable atomically advances server-managed dispatch_generation, marks existing PENDING jobs PAUSED and clears initial permission for them. A later enable never converts them to automatic initial jobs. New valid enabled-generation documents may receive initial permission.
4. A delayed intent with posting config older than last_disable_config_version (or stale dispatch generation) is stored but requires manual Send, even if upload occurs after re-enable. Carry generation/version in safe cached settings and intent; backend tracks current generation/last-disable version and validates ordered config changes without a settings-history table. Offline-local config proposals never invent server generations: resolve accepted config version to current boundary, conservatively pause unresolved old work. Same upload batch applies all available operations before waking jobs; job claim rereads final current gate.
5. Serialize claim and disable through the same store dispatch lock/generation boundary: if claim wins, started HTTP may finish; if disable wins, no new attempt starts. Never cancel an in-flight call and assume it was undelivered.
6. Other clients' stale public settings cannot re-enable reporting via last-write-wins; backend expected-version conflict is visible. Non-reporting defaults do not independently reset the server generation.
7. A disabled store may inspect evidence/reconcile. New required reversal of an already accepted original remains a reportable obligation but paused, not off-period exempt. Re-enable + manual Send required.

### 6.6 Returns and void reversals

- Actual returns commit stock/refund/account effects locally once. Create sales adjustment intent linked to original; missing/unaccepted original reference is Needs attention/Waiting for original. No automatic dependent retry after original resolution.
- API advertises Debit Note/invoiceRefNo; legal FAQ mentions debit/credit notes. Error codes require reason/remarks but model omits exact keys; signs/issuer/multiple partial adjustments remain certification gates. Do not invent Credit Note, negative lines, reason fields or universal deadline.
- Ordinary purchase returns/voids retain supplier evidence, no outbound store call. Special purchase profiles need explicit certified handling.
- **Fiscal-managed sale void is online-gated in V1** because local state may be stale and backend may already have dispatched. Offline user may save a void request/draft, but must not reverse stock/payment/ledger or mark source VOIDED yet. Explain that ordinary sale/return posting still works offline.
- OWNER VOID_PREPARE online command locks canonical document with dispatch gate: unknown/sending -> reject until reconciled; accepted -> require verified reversal mapping; definitively never accepted -> reserve cancellation and prevent initial/manual send.
- Return a one-use reservation bound to document/version/business operation/actor. No lock spans user interaction; reservation is durable and prevents dispatch until committed or explicitly aborted. Do not expire and re-dispatch while a local void upload may be pending.
- Authorized terminal commits normal business void effects + reservation ID + reversal intent (if original accepted) atomically locally, then uploads. Backend validates/consumes reservation in the atomic void operation; it cancels unaccepted obligation or creates one linked SALE_VOID reversal/job. Preserve original accepted ID.
- Lost acknowledgement/terminal crash recovers same reservation/operation, not another void. Online server abort releases unused reservation only after proving no committed local void is pending. Device handover must resolve reservations; never silently expire a financial permission.
- Accepted reversal failure leaves **Voided locally - fiscal reversal pending/failed**; never undo stock/refunds automatically or pretend FBR canceled. Fiscal contracts unverified -> block accepted-original void at preparation.
- Direct API void uses same gate/business pipeline. Excluded/non-fiscal sources may keep ordinary offline void under existing business rules, but backend verifies exclusion and current canonical state on upload; stale local absence alone is never proof a source is excluded.

### 6.7 Background jobs, durability and the unavoidable uncertainty window

**V1 mechanism:** a PostgreSQL transactional outbox (`fbr_submission_jobs`) plus a small Spring scheduled poller with bounded worker concurrency. No Redis/in-memory queue, external broker, or desktop worker is needed. Polling is automatic job discovery, **not automatic FBR retry**. An after-commit wakeup may reduce latency but is never the only delivery mechanism.

1. Local SQLite durably commits business rows + operation + intent together. Do not acknowledge checkout before commit. Keep the existing immutable receipt/operation until confirmed backend receipt; prevent sync/download cleanup from deleting unacknowledged local work.
2. Backend commits operation receipt + financial rows + canonical document + initial job in **one PostgreSQL transaction**. Upload ACK follows commit. If ACK is lost, replay returns the same durable receipt without reapplying effects or adding jobs.
3. Poller selects PENDING rows with row-level locking (`FOR UPDATE SKIP LOCKED` or equivalent), takes the same store dispatch gate as disable/void and checks version/readiness. In a bounded transaction it prepares the immutable revision and commits STARTED + one attempt/event before I/O. If this transaction rolls back, there is no authorized send.
4. Worker calls FBR once outside the transaction, with bounded connection/read timeouts and no HTTP retry interceptor. HTTP completion is not completion of the job until PG stores result/event/status/job completion atomically.
5. Failure to store a received result triggers **storage-only retry of that same immutable result**, explicit alert and dispatch pause for the affected obligation. Never call FBR again as a persistence fallback. On loss of the worker before result durability, preserve the durable attempt and recover as unknown.
6. Startup/recovery sweeps durable rows, not memory: PENDING/no committed start can receive first processing; orphaned STARTED becomes unknown after proving worker ownership lost; completed/failed/unknown is never requeued automatically. A heartbeat timeout alone must not race a live worker: fence its stale ownership for further dispatch/state writes and reconcile a late result against that exact attempt. The response evidence is retained even if the state already moved through an unknown event.
7. Commands and result writes use stable IDs/unique constraints/CAS so replayed receipt/result persistence is idempotent. Malformed input, blocked settings and runner failures remain actionable; no silently dropped/deleted "poison jobs". Paused/unknown jobs are kept for investigation.

| Failure point | Durable surviving truth / recovery |
| --- | --- |
| Before local commit | No checkout success; SQLite rollback, no partial financial effects |
| Local commit, before backend acceptance | Local operation/intent remains uploadable with same ID |
| Backend commits, upload ACK lost | Durable receipt/job; duplicate upload is a no-op |
| Job preparation transaction fails | No committed attempt; recover PENDING work without an FBR call having been authorized |
| Attempt start commits, worker dies before/after HTTP | Cannot prove which side of HTTP; OUTCOME_UNKNOWN, no blind resend |
| Response received, PG unavailable | Retry saving result only; if worker also dies, raw response may be unrecoverable, durable attempt remains unknown |
| Result commits, terminal offline | PG acceptance/result survives; safe summary downloads later |

**Honest no-data-loss boundary:** we can and must durably preserve acknowledged business operations, reporting obligations, commands and attempt history. We cannot atomically commit a government HTTP response and our PG transaction. Without FBR-provided idempotency/lookup or a certified delivery/reconciliation mechanism, a crash can lose the exact not-yet-persisted response bytes. Do not claim exactly-once external delivery or guaranteed retention of every received byte. The safe outcome is an explicitly retained unresolved obligation, not a dropped sale or duplicate invoice. If "no data loss" also requires those in-flight raw bytes to survive every failure, this is an unresolved production requirement; neither an outbox nor adding a message broker solves that boundary.

**Operations requirements before release:**

- Durable local SQLite settings (including appropriate WAL/synchronous configuration) and tested restart recovery; device/disk destruction before upload still needs a supported backup/device-recovery policy. Offline local-only data cannot be recovered from backend backups.
- Production PG must not ACK commits without durable WAL. For zero loss of acknowledged commits on primary-host failure, require synchronous replication to an independent failure domain and fail closed when required durability is unavailable; asynchronous replicas alone do not meet that target.
- Encrypted backups plus continuous WAL/PITR, monitored archive lag, capacity alerts, restore drills and documented retention. Backups mitigate disaster but do not by themselves promise RPO zero for every disaster.
- Restore/failover **with dispatcher disabled**. A backup may predate an externally accepted invoice; reconcile all work in the affected loss window before enabling dispatch. Never restore old PENDING rows and assume they are safe first attempts.
- Alert on oldest eligible PENDING age, unexpected SENDING duration, unknown count/age, blocked jobs, local upload age, audit-write failures, storage/WAL/backup failures. Backend operations resolves incidents; no silent queue expiry, TTL deletion or bounded-retry discard.
- Approve explicit RPO/RTO/failure domains, backup retention, offline-device recovery and the unknown-outcome support procedure before production. These are acceptance gates, not configurable promises already delivered by this repository.

## 7. Current DI v1.12 mapping and response contract

Backend maps from validated immutable posted snapshots, not current mutable party/product values or arbitrary frontend JSON.

| API field / type | Source / rule |
| --- | --- |
| invoiceType string | Our sale `"Sale Invoice"`; certified adjustment `"Debit Note"`; no old numeric types/generic purchase |
| invoiceDate date string | Issuance YYYY-MM-DD from frozen business timestamp/store timezone, never retry date |
| sellerNTNCNIC / sellerBusinessName | Authorized legal taxpayer/name; seven-digit NTN/thirteen-digit CNIC where applicable, preserve zeros |
| sellerProvince / sellerAddress | Reference description and store business-address snapshot |
| buyerNTNCNIC | Actual identity; optional for Unregistered per table; certify omission versus null, never example placeholder |
| buyerBusinessName / buyerProvince / buyerAddress | Actual required name/reference province/address, including applicable unregistered profile |
| buyerRegistrationType | Registered / Unregistered from evidence, not merely NTN presence |
| invoiceRefNo | Empty on normal sale per sample; original FBR invoice ID for note, not internal bill number |
| scenarioId | Assigned applicable sandbox scenario only; omit in production |
| items | Stable source-line UUID/ordinal association |
| hsCode / productDescription | Current dotted HS/leading zeros and immutable description |
| rate | Exact ratE_DESC; not numeric ID, fractional DB rate or guessed label |
| uoM | Exact allowed reference description, certified HS/UoM relation |
| quantity decimal number | Actual quantity/verified conversion; sample four decimals, current business two-decimal limit remains until deliberate shared change |
| valueSalesExcludingST / salesTaxApplicable | Recorded discounted taxable base and classified ST/FED-in-ST-mode excluding extra/further tax |
| fixedNotifiedValueOrRetailPrice | Actual statutory retail/fixed basis; zero only for established nonapplicability |
| salesTaxWithheldAtSource | Required classified amount, zero only when nonapplicable |
| extraTax / furtherTax / fedPayable | Optional actual amounts; no duplicated FED or invented headers |
| discount | Optional actual allocated line discount; certify discounted-base semantics to avoid double subtraction |
| saleType | Exact per-line transaction description; not one header code |
| sroScheduleNo / sroItemSerialNo | Applicable contextual reference descriptions/serials, not old numeric sentinels |
| totalValues | Required including-tax total per description; samples contradict with zero, so certify supported profile formula |

Use BigDecimal and configured rounding shared with business calculations. Allocate header discount proportionally with stable residual paisas; sum mapped components to internal totals with **zero paisa discrepancy**. Do not send unsupported header sums or recompute statutory retail tax from generic selling price. Composite rate labels are not automatically percentages; withholding/FED/totals require certified formula.

Backend serializer emits numeric JSON tokens losslessly, exact body text persisted then sent unchanged. Frontend snapshot decimals are strings/scaled values, never unsafe JS Number conversions. Historical financial totals are not rewritten by new mapper.

Response algorithm:

1. Store raw HTTP body/status/headers then parse `validationResponse.statusCode/status/errorCode/error` and `invoiceStatuses[]` (`itemSNo/statusCode/status/invoiceNo/errorCode/error`).
2. ACCEPTED requires nonempty string top-level invoiceNumber, top-level `"00"`/Valid without contradictions and complete valid `"00"` issued item results exactly once per submitted ordinal. Status text casing may normalize, IDs/codes remain strings.
3. Consistent Invalid with no issued header/item IDs -> REJECTED, even if top-level `"00"`; mixed issuance/error, missing/duplicate ordinals or partial body -> OUTCOME_UNKNOWN, no whole-invoice blind resend.
4. `dated` sample lacks timezone. Preserve raw string and received-at UTC; normalize only after FBR timezone confirmation.
5. Validate-only success never sets ACCEPTED/source FBR ID or clears uncertainty. It is separately audited and user-triggered.
6. Item invoiceNo values are line evidence, not separate invoice headers. Retain source mapping for certified future adjustments.

## 8. Backend APIs, sync and access boundaries

### 8.1 Endpoint surface

Only store-scoped setup/actions and safe summaries are part of the FBR API surface.

| Endpoint | Contract |
| --- | --- |
| GET/PATCH `/api/store/fbr-settings` | Safe current-store settings; OWNER changes editable public fields with expectedVersion; server-owned readiness excluded from PATCH |
| GET `/api/store/fbr-readiness` | Safe credential-present/onboarding/environment/egress readiness, never token/secret reference |
| Extended POST `/api/sync/upload` | Atomic ordered business/intents/commands; stable operation identity/receipt; no client canonical audit/status mutation |
| POST `/api/fbr/documents/{id}/actions` | Online command handler: action, commandId, expectedStateVersion, reason/typed payload. Same handler as uploaded commands; 202 receipt/command ID, never fake acceptance |
| GET `/api/fbr/actions/{commandId}` | Same-store command receipt/version/errors; local cache also receives it |
| POST `/api/fbr/reference-refreshes` | OWNER one-shot command, stable commandId/context/environment; audited backend call, no checkout dependency |
| GET `/api/fbr/documents` and `/{id}` | Scoped summaries/timeline with consistent local filters/pagination, environment and freshness |
| Existing source detail APIs | Separate internal/vendor/FBR IDs and adjustment/supplier evidence summaries |

Server returns clear 400 invalid payload, 401/403 auth, 404 same-store-not-found, 409 stale/conflicting identity/state; accepted command still has execution receipt/job result. Network timeout of action POST retries same command ID, never a new action identity.

Example action body:

```json
{
  "commandId": "ea169308-947d-4d3e-ad45-ce2c44cfcd86",
  "action": "RETRY",
  "expectedStateVersion": 7,
  "targetAttemptId": "ad72f5fa-9172-4de8-b00c-c671384cab27",
  "reason": "Previous request was confirmed not sent"
}
```

No public credential or raw-exchange endpoint in V1, including OWNER access/export. Central secure provisioning handles secrets separately from customer settings. If later adding credential onboarding API, design dedicated privileged write-only secret intake; never overload business settings or sync.

### 8.2 Atomic upload and authoritative ownership

1. Implement use case 13 operation envelope: operationId/terminal sequence/original actor/type/expected before-state/canonical hash + ordered mutations. Rust currently flattens transactions; preserve boundaries and contiguous accepted acknowledgements.
2. Financial source + intent + applied-operation receipt + canonical document/initial job creation commit atomically in PostgreSQL. No job visible before complete source/children/intent.
3. Backend does not call FBR in sync/controller transaction or before receipt commit. Failure after commit cannot roll back financial operation or make upload appear rejected.
4. Duplicate operation/command same identity/content returns prior receipt/job; changed payload conflicts. Append-only intent/commands; reject canonical document/request/attempt/result/event writes from clients.
5. Apply available ordered operations before scheduling; ensure pending settings disable/cancel within accepted batch gates earlier source jobs. Future offline toggles cannot instantly affect already-claimed backend work; UI states this honestly.
6. Backend validates source/tenant/actor/terminal relationships, frozen values, config versions, return allowances and restrictions. New server events/readiness/downloads do not consume terminal financial operation sequence; compare financial versions, not timestamps changed by server fiscal summary updates.
7. Upload validation reuses authoritative business pipeline. Direct API financial writes obey the single-writer restriction, never a second independent writer racing pending desktop effects.
8. Server projections live in read-only fiscal tables/DTO joins; if source summary columns are materialized, exclude them from client aggregate overwrite/conflict logic and restrict them to backend projector.
9. Permanent rejection remains actionable by operation/document/command; never silently discard queue or acknowledge unpersisted evidence. Independent FBR failure does not block already-accepted ordinary financial uploads.

### 8.3 Download/access

- Replicate public settings/readiness, normalized reference cache, allowlisted canonical status/timeline, command receipts and supplier evidence scoped by signed store identity/parent links.
- Server-created job/mapping/validation failures produce explicit workflow/readiness diagnostics; no missing download or empty status is treated as success. Global reference/context refresh completes atomically or retains previous active version.
- Raw requests/responses, revisions, attempts/results, API exchanges/results, internal event evidence, transport headers/errors and full parsed response copies remain backend PG only. No raw-data stream, endpoint, export or frontend inspector for any role in V1.
- Credentials/bindings/vault rows, raw audit and internal jobs/worker claims are not downloadable. Disable replication-role access at source and exclude from publication; existing FOR ALL TABLES plus query omission is insufficient. Publish dedicated safe projection relations if canonical source tables also contain private columns.
- Desktop requires no FBR token, endpoint, egress whitelist or FBR CORS handling; its only network integration is existing backend/PowerSync.
- Backend may accept FBR while terminal is disconnected. Safe status/ID arrives later; local cached pending/unknown is not authoritative. No simultaneous local status writer.
- Origin terminal identifies posting provenance, not dispatch ownership. Backend continues processing while terminal closes; replacements download history but never become alternative FBR senders.

## 9. UI/UX and receipts

Use existing dense Angular Material/Tailwind POS conventions, typed repositories, translated labels and signal-owned state.

| Surface | Required behavior |
| --- | --- |
| Setup | Resumable legal details -> supported profile -> catalog -> buyer capture -> sandbox checks -> production activation; see section 3.5. Central readiness indicator; no customer token/IP/endpoint form |
| Checkout | Immediate local success; Awaiting upload / Queued at backend / Needs attention / Accepted; no FBR network modal or failed-sale toast |
| Offline toggle | Off locally, backend confirmation pending; explain started remote calls may finish. Off-period new documents excluded; re-enable does not auto-send paused history |
| Activity | Offline cached history, last sync/known backend version, separate command pending badge and server state; environment prominent |
| Actions | Send/Retry queued with stable identity, duplicate-click guard; server stale/denial visible. Correction does not change money. Reconcile/fiscal void requires online authoritative gate |
| Purchases | Supplier evidence-only labels/IDs/verification, not our accepted submission |
| Diagnostics | Safe actionable status/error summary and support reference; no raw inspector/export or request/response download |
| Returns/void | Original links, return allowance/settlement preview, original vs adjustment IDs; fiscal-managed offline void unavailable with clear reason |

Receipts preserve immutable financial source. After downloaded acceptance, Rust renders a fiscal addendum/copy keyed to canonical accepted evidence; never modify original financial totals. Pre-acceptance output explicitly states pending/needs attention/off; legal provisional-copy approval required. Offer user-requested later copy; printing/reprint Retry never requests FBR submission.

v1.12 specifies DI logo and QR version 2 (25x25), one-inch square. Authoritative encoding/verification URL is not specified in text; confirm approved payload/capacity/layout, do not invent a URL. Test real QR on 58/80mm printers and preview. Sandbox IDs are visibly test-only.

## 10. Milestones (implementation-sized, dependency ordered)

Future work, not completed features:

| ID | Deliverable / implementation algorithm | Depends on | Exit evidence |
| --- | --- | --- | --- |
| M1 | Certify current API/onboarding, supported sales/note/purchase exceptions/amount/QR cases; approve backend egress, central taxpayer/environment credentials and sandbox scenarios | None | Redacted valid/invalid/item/unknown fixtures, no guessed note fields |
| M2 | Complete/reuse business foundations, decimal snapshot parity, stable terminal sequence and atomic aggregate upload with durable intent | Existing use cases 5, 8-13 | Exactly-once financial posting, child failure atomic rollback, no flat partial fiscal uploads |
| M3 | Add backend credential bindings/vault, public settings/readiness, onboarding persistence and reference refresh/cache/audit; replicate safe setup | M1 | No secret/raw-audit grants/publication/client data; central rotation/environment tests; required-field/readiness invalidation tests |
| M4 | Add immutable intents/canonical fiscal schema/revisions/audit, backend jobs and idempotent commands/receipts, safe projection replication only | M2, M3 | Ownership/mutation denial, same-ID replay/conflict, source links and canonical state/version tests |
| M5 | Implement Java mapper pair/BigDecimal serialization and Spring HTTP port using official fixtures/reference context | M1, M4 | Exact v1.12 fields, lossless amounts, item-status/partial unknown cases, no old result parser |
| M6 | Wire atomic upload -> one durable initial job -> after-commit runner with database claims, evidence-before-I/O and secret resolution | M4, M5 | Delayed offline upload gets one first call; duplicate upload/replica gets none extra; checkout independent; no auto second attempt |
| M7 | Implement Send/Retry/correction/reconciliation + disable generation/backlog gates and online void reservation/reversal workflow | M6 | Stale commands/claims/disable races safe; no retry of unknown; offline fiscal void blocked; no duplicate side effects |
| M8 | Deliver resumable FBR onboarding, Angular intent/command UX and safe watches, native schema/upload updates, fiscal receipt addenda and summary APIs | M3, M4, M6, M7 | Required setup fields, offline capture/cached statuses, no raw payload exposure, no native FBR HTTP/token, approved output |
| M9 | Fault/round-trip/tenant/load tests, synchronous PG durability/backup/restore drills, secret rotation, migration and production runbook/pilot | M7, M8 | One backend sender, acknowledged-write durability, restore dispatch interlock, resolved unknown-outcome/support gates and compliance approval |

M1 and business-only M2 can progress in parallel. Do not release backend dispatcher until atomic upload, secret isolation and durable attempt evidence are verified.

## 11. Verification and rollout checklist

- **Call counts:** offline posting zero calls; later first upload eligible -> one initial attempt. Duplicate upload/command, reconnect, two replicas/window clicks -> no extra calls. Failed/unknown/start-orphan restart -> zero automatic second attempts; PENDING never-started job recovery -> one first attempt.
- **Financial isolation:** local/backend/FBR failures do not repeat stock/payment/cost/ledger; FBR result changes no terminal financial sequence or posted amount.
- **Ownership:** client cannot forge ACCEPTED/result/FBR ID, update job or access secret; backend mapper revalidates uploaded snapshot against source.
- **Credentials/network:** store/environment isolation, safe readiness DTO, key rotation/missing secret/IP denial, no redirects/retries/token logs, secret tables inaccessible to replication role/publication consumers.
- **Raw-data isolation:** no raw endpoint/export for OWNER or CASHIER; PG grants/publication exclude raw audit; sync schemas/SQLite/network DTO tests contain no request/response/header/internal-evidence data. Safe diagnostics never echo whole provider responses.
- **Onboarding:** current and new owners resume from persisted requirements; required address/province/identity/profile/catalog/buyer checks; conditional STRN/SRO; server readiness cannot be forged; changes invalidate checks; non-FBR onboarding unaffected.
- **Money/contract:** exact line/internal sums, discount residuals, statutory retail/composite rates, FED/withholding, lossless numeric JSON, leading zeros, correct keys/ordinals, raw naive dated and received-at UTC.
- **Outcomes:** top-level 00 with invalid item, mixed issued/invalid lines, wrong profile, partial/HTML/malformed responses, missing ID, validation-only success, timeout and body-persistence failure.
- **Jobs:** crash before claim, after claim/before attempt commit, after durable start/before send, after delivery/before result, after result/before desktop sync; never conflate unsent job with unknown delivery.
- **Durability:** storage-only result retries make zero extra HTTP calls; lost ACK replay; worker fencing/late results; synchronous failover; restore with dispatch disabled; offline device-loss boundary; alerts and restore drills against agreed RPO/RTO.
- **Toggle:** off-period exclusion, offline disable pending acknowledgement, accepted-batch disable ordering, claim-versus-disable race, late old-generation upload, re-enable new work versus paused backlog, no automatic backfill.
- **Commands:** offline queue/role revocation/stale version/server rejection, same ID/different payload, two IDs/same version, upload/direct endpoint deduplication, user correction/reconcile evidence.
- **Void/returns:** stale local unknown/accepted, online reservation versus job, crash/handover pending void, source awaiting original reference, partial quantities, supplier evidence-only, reversal pending/failed no auto financial rollback.
- **Sync/UI:** backend accepts while terminal closes, later safe status download, no raw-data access for any app role, all clients see same server version, no local audit upload writer, pending receipt/accepted addendum and no printer-triggered FBR retry.
- **Migration:** next forward migration, disabled defaults, historical LEGACY_NOT_EVALUATED, no fabricated IDs. Since prior designs were documentation-only, do not manufacture migration of nonexistent native tokens/jobs.

Focused Maven unit/integration/HTTP fault tests cover server policy/mappers/jobs/transactions/tenant gates. Jest covers local intent/command capture, status merge and UI; Rust tests only native DB/upload/printing integration; Playwright covers offline posting -> upload -> server result -> receipt/manual retry. Update legacy mock to DI v1.12 faults before use. No live government calls in CI.

## 12. Explicit open gates

| Gate | Required evidence / safe behavior |
| --- | --- |
| Latest issued contract | v1.12 is newest publicly linked verified document; compare issued IRIS/integrator details before production |
| Hosting/credentials | Approved backend egress/integrator topology, central taxpayer/environment token provisioning and rotation |
| Notes/voids | Reason-field names/signs/issuer/partial adjustments; advertised Debit Note is not generic Credit Note support. Error-list 180-day/reference restrictions are not universal legal constants |
| Purchases | Ordinary evidence-only; separately certify cotton-ginner/sector exceptions before outbound enablement |
| Reference ambiguity | Per-endpoint dates/query spelling, HS_UOM annexure, registration-check GET-body/status inconsistencies |
| Totals/tax | totalValues sample zero vs description, discount semantics, withholding/FED-in-ST-mode/retail/composite formulas; certified profiles only |
| Walk-in | Unregistered buyer ID optional; required other particulars/end-consumer treatment still needs supported scenario |
| Duplicate/lookup | No documented replay key/lookup; manual evidence-based reconciliation for ambiguous delivery |
| QR/receipts | Logo/size/version stated; encoding, capacity and provisional-copy legality require approval |
| Operational policy | Save-first/manual-only retry/off-period exclusion/advance time-of-supply and online fiscal-void limitation need compliance acceptance |
| Retention | Approved size limits, backups, encryption/access/retention and alerts; never truncate/drop audit silently |
| Durability | Agreed RPO/RTO/failure scope, synchronous PG failover, local device recovery, restore dispatch interlock and acceptance of the non-atomic FBR-response window; see section 6.7 |

Unknown contract facts remain production gates. Backend architecture is now decided; no task should revive desktop FBR credentials/dispatch as an outage workaround.
