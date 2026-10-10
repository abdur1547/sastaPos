# Sasta POS

Sasta POS is a desktop point-of-sale system being built for shops and businesses in the Pakistani market. It is designed to keep day-to-day sales and stock workflows available even when the internet is unreliable, while synchronizing data with the central backend whenever connectivity returns.

The application is intended to support common retail operations such as store management, products, units of measure, tax categories, sales, stock movements, and business settings. The backend already contains domain modules for these areas; the desktop UI and offline data workflow are still under active development.

## Architecture

```text
Tauri desktop app (Angular UI + Rust + local SQLite via PowerSync)
        │  sync (HTTP stream, :8081)         │  REST + login (:8090)
        ▼                                    ▼
PowerSync service (Docker, self-hosted)   Spring Boot backend
        │  logical replication               │  JPA
        └──────────────► PostgreSQL (Docker, source of truth) ◄──┘
```

- **Desktop app:** Tauri 2 + Angular. SQLite lives on the Rust side (PowerSync Tauri plugin); the UI reads/writes it through the plugin.
- **Backend:** Spring Boot (port `8090`) issues HS256 JWTs at login. The token carries `aud=powersync`, `role` and `store_id`.
- **PostgreSQL:** runs from the root `docker-compose.yml` with `wal_level=logical`. On first start `powersync/postgres-init.sh` creates the `powersync_role` user and the `powersync` publication.
- **PowerSync service:** self-hosted (`powersync/`), replicates Postgres, validates the same backend JWT (`PS_JWK_K` = base64url of `JWT_SECRET`) and syncs only rows of the user's `store_id` (`powersync/sync-config.yaml`).
- **Desktop sync auth:** the Rust connector reuses the JWT stored in the OS keyring at login, so syncing starts after sign-in.

> **Write path:** `upload_data` (`frontend/src-tauri/src/upload.rs`) batches queued local writes and POSTs them to `POST /api/sync/upload` (set `API_BASE_URL` in `frontend/src-tauri/.env`). Synced/uploaded tables: `products`, `customers`, `stock_movements`, `product_tax_categories`. 400/413/422 batches are dropped; 401/5xx/network errors are retried.

## Repository Structure

```text
.
├── docker-compose.yml   Postgres + PowerSync (includes powersync/docker-compose.yml)
├── .env                 Postgres / backend vars (copy from .env.example)
├── powersync/           PowerSync service.yaml, sync-config.yaml, .env, postgres-init.sh
├── backend/             Spring Boot API
└── frontend/            Angular app and Tauri project (src-tauri/)
```

## Getting Started

### Prerequisites

- Docker + Docker Compose (v2.20+), Java 25, Node.js + Yarn 1.22, Rust (1.77.2+) and [Tauri system dependencies](https://v2.tauri.app/start/prerequisites/)

### One-time configuration

```bash
cp .env.example .env                     # Postgres + backend settings
cp powersync/.env.example powersync/.env # PowerSync settings
cp frontend/src-tauri/.env.example frontend/src-tauri/.env
```

Keep these consistent:

| Value | Where |
| --- | --- |
| `POWERSYNC_DB_PASSWORD` (root `.env`) | must equal the password inside `PS_DATA_SOURCE_URI` / `PS_STORAGE_SOURCE_URI` in `powersync/.env` (user `powersync_role`) |
| `JWT_SECRET` (backend env, default is a dev value) | `PS_JWK_K` in `powersync/.env` must be its base64url encoding: `printf '%s' "$JWT_SECRET" \| base64 -w0 \| tr '+/' '-_' \| tr -d '='` (the `.env.example` value matches the default dev secret) |
| `PS_PORT` (`powersync/.env`) | `POWERSYNC_ENDPOINT` in `frontend/src-tauri/.env` (default `8081`) |

### Run everything (3 terminals)

**1. PostgreSQL + PowerSync**

```bash
docker compose up -d
docker compose logs -f powersync     # wait for "Activated new replication stream"
```

The DB init script runs only on a fresh database. If you change the role password or start from an old container: `docker compose down -v && docker compose up -d`.

**2. Backend** (listens on <http://localhost:8090>, Swagger at `/swagger-ui/index.html`)

```bash
cd backend
set -a && . ../.env && set +a   # exports JDBC_* variables
./mvnw spring-boot:run
```

The `dev` profile creates the tables with Hibernate; the backend must have started once so tables exist (PowerSync picks them up automatically, no restart needed).

**3. Desktop app**

```bash
cd frontend
yarn install
yarn tauri dev
```

### First-use flow

1. Sign up in the app (or `POST /api/auth/signup`), then create a store (`POST /api/store`).
2. **Log in again** after creating the store: `store_id` is only put in the JWT at login, and PowerSync syncs data per `store_id`.
3. The Tauri console logs `[PowerSync] status` once syncing.

### Verify sync without the app

```bash
TOKEN=$(curl -s localhost:8090/api/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"..."}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["accessToken"])')
curl -s -m 5 -X POST localhost:8081/sync/stream -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" -d '{"buckets":[],"include_checksum":true,"raw_data":true,"client_id":"t"}'
```

### Local SQLite database (desktop)

The file is `powersync.db` in Tauri's app data dir for the identifier `com.sastapos`. `yarn tauri dev` and a packaged build use the **same file**, so they share data.

| OS | Path |
| --- | --- |
| Linux | `~/.local/share/com.sastapos/powersync.db` (plus `-wal` / `-shm`) |
| macOS | `~/Library/Application Support/com.sastapos/powersync.db` |
| Windows | `%APPDATA%\com.sastapos\powersync.db` |

Inspect it with `sqlite3 ~/.local/share/com.sastapos/powersync.db '.tables'` (read-only use only, while the app is closed or idle).

**Reset the local DB** (it is only a replica; synced data is re-downloaded on next login): close the app, then

```bash
rm ~/.local/share/com.sastapos/powersync.db*
```

Local-only tables (`product_unique_keys`, `customer_unique_keys`, etc.) and any un-uploaded local writes are lost. Login tokens live in the OS keyring, not in this folder, so you stay logged in.

**Seed / clear test data (dev only):** in `yarn tauri dev`, open devtools (right-click -> Inspect, or `Ctrl+Shift+I`) and run in the console:

```js
await seedLocalDb()    // adds sample units of measure, tax categories and products
await clearLocalSeed() // removes only the seeded products (matched by seed SKU)
```

These are registered only in non-production builds (`app.config.ts`), so they are unavailable in a packaged app. Seeded rows are ordinary local writes and are uploaded to Postgres like any other change.

### Adding a synced table

1. Add a `SELECT` for it in `powersync/sync-config.yaml` and restart PowerSync (`docker compose restart powersync`).
2. Add the table to `frontend/src/app/core/powersync/app-schema.ts`.
3. The publication is `FOR ALL TABLES`, so no database change is needed.

### Store settings and invoice synchronization

The auto-subscribed store stream includes the current `stores` row, its linked
`business_settings`, credential-free staff identities, products and their lookup
tables, customers, sales, sale items, payments, stock movements, and ledger entries.
Child tables are scoped through their store-owned parent. Password hashes and
password-reset tokens are never sent to clients; staff management remains a backend
API workflow.

Completed sales resolve settings through `stores.store_settings_id` for the current
store, then increment `next_invoice_number` in the same local transaction as the sale.
Drafts do not require invoice settings. If invoice settings have not synced, check
that the store has a linked settings row, restart PowerSync after changing the stream
configuration, and allow the desktop app to sync. Rebuild/relaunch the desktop app
after changing its local schema; do not delete the local database or pending writes.

This local counter is not a cross-device invoice reservation mechanism. Coordinating
invoice numbers and persisting their increments on the backend are still required
before relying on concurrent/offline invoicing across multiple devices.
The backend upload registry accepts customers, products, product-tax links, sales,
sale items, payments, ledger entries, stock movements, and invoice-counter updates.
Parent rows are uploaded before children; ledger balances are recomputed from
persisted entries so retries do not double-charge customers. Settings uploads can
only advance the linked store's counter; other settings remain managed by the store
API. Store and staff identity projections are download-only.

The desktop acknowledges an upload only after a valid response with no rejected
rows. Rejected or failed batches stay queued and report the reason for correction;
already-applied rows are safely retried by their original IDs. Older desktop versions
discarded rejected rows after a successful HTTP response: those missing writes will
not automatically retry after an upgrade. Reconcile affected local sales and their
original IDs against the backend before requeueing them; do not recreate completed
sales or apply stock movements a second time.

### Build a production desktop bundle

```bash
cd frontend && yarn tauri build
```

Set `POWERSYNC_ENDPOINT` for the deployed PowerSync URL; production config (TLS, secrets, `sslmode`) is managed separately.

## Component Documentation

- [PowerSync setup](powersync/README.md): self-hosted service details.
- [Frontend and desktop setup](frontend/README.md): Angular, Tauri, Rust, local development, and desktop builds.
- [Backend setup](backend/README.md): Spring Boot, profiles, Docker Compose, Maven builds, and deployment.

## Development Notes

- The frontend uses Yarn 1 and its scripts are defined in `frontend/package.json`.
- Spring Boot's Docker Compose integration is disabled; Postgres comes from the root `docker-compose.yml`. Flyway for database migrations as the schema evolves.
- Keep local credentials and environment-specific values out of version control. Use local environment or profile configuration for database and synchronization services.

## Technology References

- [Angular](https://angular.dev)
- [Tauri](https://v2.tauri.app/)
- [Rust and Cargo](https://doc.rust-lang.org/cargo/)
- [Spring Boot](https://docs.spring.io/spring-boot/docs/current/reference/htmlsingle/)
- [Spring Data JPA](https://docs.spring.io/spring-data/jpa/reference/jpa.html)
- [PostgreSQL](https://www.postgresql.org/docs/)
- [PowerSync](https://docs.powersync.com/)
