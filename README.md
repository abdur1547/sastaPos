# Sasta POS

Sasta POS is a desktop point-of-sale system being built for shops and businesses in the Pakistani market. It is designed to keep day-to-day sales and stock workflows available even when the internet is unreliable, while synchronizing data with the central backend whenever connectivity returns.

The application is intended to support common retail operations such as store management, products, units of measure, tax categories, sales, stock movements, and business settings. The backend already contains domain modules for these areas; the desktop UI and offline data workflow are still under active development.

## Table of Contents

- [Architecture](#architecture)
- [Repository Structure](#repository-structure)
- [Getting Started (development)](#getting-started)
  - [Prerequisites](#prerequisites)
  - [One-time configuration](#one-time-configuration)
  - [Run everything (3 terminals)](#run-everything-3-terminals)
  - [Environment configuration](#environment-configuration)
- [Production Compose](#production-compose)
  - [Production prerequisites](#production-prerequisites)
  - [Configure once, start with one command](#configure-once-start-with-one-command)
  - [Environment variables by service](#environment-variables-by-service)
  - [Public access and TLS](#public-access-and-tls)
  - [Persistence, updates, and shutdown](#persistence-updates-and-shutdown)
  - [Packaged desktop and services on the same machine](#packaged-desktop-and-services-on-the-same-machine)
  - [First-use flow](#first-use-flow)
  - [Verify sync without the app](#verify-sync-without-the-app)
  - [Local SQLite database (desktop)](#local-sqlite-database-desktop)
  - [Adding a synced table](#adding-a-synced-table)
  - [Store settings and invoice synchronization](#store-settings-and-invoice-synchronization)
  - [Build a production desktop bundle](#build-a-production-desktop-bundle)
- [Component Documentation](#component-documentation)
- [Development Notes](#development-notes)
- [Technology References](#technology-references)

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
├── docker-compose.yml   Development Postgres + PowerSync (hardcoded local settings)
├── docker-compose.prod.yml Backend + persistent Postgres + PowerSync for production
├── .env.example         Production infrastructure settings
├── powersync/           PowerSync service.yaml, sync-config.yaml, postgres-init.sh
├── backend/             Spring Boot API
└── frontend/            Angular app and Tauri project (src-tauri/)
```

## Getting Started

### Prerequisites

- Docker + Docker Compose (v2.20+), Java 25, Node.js + Yarn 1.22, Rust (1.77.2+) and [Tauri system dependencies](https://v2.tauri.app/start/prerequisites/)

### One-time configuration

```bash
cp frontend/.env.example frontend/.env   # Angular build-time API URL
cp frontend/src-tauri/.env.example frontend/src-tauri/.env
```

Development infrastructure needs no `.env` files. The root
[docker-compose.yml](docker-compose.yml) runs only PostgreSQL and PowerSync with
hardcoded local credentials: database `sastaPos`, owner `postgres` / `postgres`,
and replication role `powersync_role` / `powersync`. Ports are fixed at `5432`
and `8081`. PowerSync's JWT key matches the backend's default development secret;
do not override `JWT_SECRET` unless you also update `PS_JWK_K` in Compose.
Keep `POWERSYNC_ENDPOINT` in `frontend/src-tauri/.env` at `http://localhost:8081`.
These credentials are for local development only; production uses its separate
Compose file and root `.env`.

### Run everything (3 terminals)

**1. PostgreSQL + PowerSync**

```bash
docker compose up -d
docker compose ps                  # both services should become healthy
docker compose logs -f powersync
```

The DB init script runs only on a fresh database. The dev stack has no named
database volume. To discard local data and reinitialize after changing credentials,
run `docker compose down -v && docker compose up -d` (deletes development data).

**2. Backend** (listens on <http://localhost:8090>, Swagger at `/swagger-ui/index.html`)

```bash
cd backend
SPRING_PROFILES_ACTIVE=dev bash ./mvnw spring-boot:run
```

The backend runs independently, using its default local database credentials.
The `dev` profile creates the tables with Hibernate; the backend must have started once so tables exist (PowerSync picks them up automatically, no restart needed).

**3. Desktop app**

```bash
cd frontend
yarn install
yarn tauri dev
```

### Environment configuration

Every `.env.example` identifies **REQUIRED** values and **NOT REQUIRED** overrides.
Not required means the documented default is sufficient, so leave the variable
unset; an empty value is not always equivalent to an unset variable.

| Scope | Reference | How it is loaded |
| --- | --- | --- |
| Production infrastructure | [.env.example](.env.example) | Production Compose interpolation and container environment; development uses hardcoded settings |
| Standalone backend | [backend/.env.example](backend/.env.example) | Export to the process/IDE, or pass to Docker with `--env-file`; Spring does not auto-load `.env` |
| Angular / TypeScript | [frontend/.env.example](frontend/.env.example) | Yarn start/build/test/Storybook scripts generate build-time config from `frontend/.env`; process environment takes precedence |
| Rust / Tauri | [frontend/src-tauri/.env.example](frontend/src-tauri/.env.example) | Process environment, then dotenvy working-directory/parent search |
| Custom PowerSync deployments | [powersync/.env.example](powersync/.env.example) | Reference only; neither root Compose file loads this file |

Before shipping a remote desktop build, set `API_BASE_URL` in `frontend/.env`
or the build process environment to the public HTTPS backend URL, then run
`yarn build:prod` from `frontend/`. The URL is embedded in the Angular bundle.
Set Rust's `API_BASE_URL` to that same URL and `POWERSYNC_ENDPOINT` to the public
HTTPS PowerSync URL through the desktop launcher environment. The Rust `.env` is
not embedded in the packaged app. Never distribute server secrets to clients.

## Production Compose

The root [docker-compose.prod.yml](docker-compose.prod.yml) runs the backend,
PostgreSQL and PowerSync together on one host, without importing the development
stack or any component environment files. This starts **server services only**,
not the desktop app or a TLS reverse proxy.

### Production prerequisites

- Docker Engine with Docker Compose v2.20+ and permission to run Docker.
- OpenSSL for generating secrets, a text editor, and this repository on the host.
- Internet access on first build/pull for container images and Maven dependencies.
- Available host ports `8090` and `8081`, or overrides in the root environment file.
- A fresh production database volume for the first deployment.

Java, Maven, Node, Yarn, and Rust do **not** need to be installed on the host:
Compose builds the backend in Docker. The development prerequisites above apply
only when running/building components outside Docker.

### Configure once, start with one command

Run these commands from the repository root. Do not overwrite an existing
production environment file.

1. Copy the template and restrict access (it contains server secrets):

   ```bash
   cp .env.example .env
   chmod 600 .env
   ```

2. Edit the root `.env`. It is grouped by service, then **REQUIRED** and
   **NOT REQUIRED**. Replace all four blank secrets:

   | Required secret | Generate a fresh value for this field |
   | --- | --- |
   | `POSTGRES_PASSWORD` | `openssl rand -hex 32` |
   | `JWT_SECRET` | `openssl rand -hex 32` |
   | `POWERSYNC_DB_PASSWORD` | `openssl rand -hex 32` |
   | `PS_API_TOKEN` | `openssl rand -hex 32` |

   Run the command separately for each field and paste its output after `=`.
   Each command generates 32 random bytes represented as 64 hex characters.
   Use that text as-is; do not decode the JWT secret. Never reuse secrets or
   distribute this file to desktop clients.

   `CORS_ALLOWED_ORIGINS` is required but already filled with exact packaged
   Tauri origins: `tauri://localhost,http://tauri.localhost,https://tauri.localhost`.
   Remove origins your clients do not use; add the exact HTTPS origin of any
   hosted web UI. No wildcard is needed. All **NOT REQUIRED** settings can stay
   commented out.

   If manually choosing secrets containing `$` or other interpolation characters,
   single-quote their values in the Compose env file to preserve them literally.
   Do not `source` the file; Compose reads it directly. Already-exported shell
   variables take precedence over this file; unset conflicting overrides.

3. Start all production backend services with **one command**:

   ```bash
   docker compose -f docker-compose.prod.yml --env-file .env up -d --build --wait
   ```

   This builds the backend, starts PostgreSQL, initializes its PowerSync role
   and publication, runs backend migrations/schema validation, and then starts
   PowerSync. `--wait` returns success only after all three services are healthy;
   subsequent runs reuse the production data. A first build can take several minutes.
   Missing or empty required values cause Compose to stop with the variable name.

4. Verify or diagnose startup:

   ```bash
   docker compose -f docker-compose.prod.yml --env-file .env ps
   curl --fail http://127.0.0.1:8090/
   curl --fail http://127.0.0.1:8081/probes/liveness
   # If startup fails, inspect logs before retrying:
   docker compose -f docker-compose.prod.yml --env-file .env logs --tail=100 postgres backend powersync
   ```

   Adjust the curl ports if you override them. The backend API is at
   <http://127.0.0.1:8090>, with Swagger at
   <http://127.0.0.1:8090/swagger-ui/index.html>. PowerSync listens at
   <http://127.0.0.1:8081>. These are loopback endpoints, not public URLs.

### Environment variables by service

The root [.env.example](.env.example) lists **every environment input accepted by
production Compose**. Optional values below show the defaults used when unset.
Shared credentials are defined only once, in the service section that owns them.

| Service | Required (set/review) | Not required (defaults) |
| --- | --- | --- |
| PostgreSQL | `POSTGRES_PASSWORD` (also backend JDBC password) | `POSTGRES_DB=sastaPos`, `POSTGRES_USER=postgres`, `POSTGRES_IMAGE=postgres:18-alpine` |
| Backend | `JWT_SECRET` (also PowerSync auth), `CORS_ALLOWED_ORIGINS` (prefilled desktop origins) | `BACKEND_PORT=8090`, `BACKEND_IMAGE=sasta-pos-backend:prod`, `JWT_EXPIRATION_SECONDS=3600`, `PASSWORD_RESET_TOKEN_EXPIRATION_MINUTES=15`, `DEFAULT_CURRENCY_CODE=PKR`, `DEFAULT_TIMEZONE=Asia/Karachi` |
| PowerSync | `POWERSYNC_DB_PASSWORD` (also PostgreSQL role initialization), `PS_API_TOKEN` | `PS_PORT=8081`, `POWERSYNC_IMAGE` (pinned digest in the template/Compose file) |
| Shared networking | None | `SERVICE_BIND_ADDRESS=127.0.0.1` |

Compose constructs the backend's `JDBC_DATABASE_URL`, `JDBC_DATABASE_USERNAME`,
and `JDBC_DATABASE_PASSWORD` from PostgreSQL settings. It fixes
`SPRING_PROFILES_ACTIVE=prod` and production-safe JPA/Flyway settings.
`BACKEND_PORT` sets the backend's host port, container `SERVER_PORT`, and health
check URL together (default `8090`).
The Docker image supplies `JAVA_TOOL_OPTIONS`; it is not a root env override.

For PowerSync, Compose supplies `POWERSYNC_CONFIG_PATH`, `PS_POSTGRES_DB`,
`PS_DATABASE_PASSWORD`, and `NODE_OPTIONS`. `PS_PORT` sets PowerSync's host port,
container listening port, and health check URL together (default `8081`).
Choose distinct available unprivileged ports (`1024`-`65535`) for both services.
`POWERSYNC_CONFIG_PATH` points to `/config/service.yaml` inside the container,
mounted from [powersync/service.prod.yaml](powersync/service.prod.yaml) on the host.
Do not add duplicate JDBC credentials,
`PS_DATA_SOURCE_URI`, `PS_STORAGE_SOURCE_URI`, or `PS_JWK_K` to the root file:
those are standalone/custom-deployment settings, not additional root inputs.

PowerSync's startup command derives the HS256 JWK from the shared JWT secret.
Its [production config](powersync/service.prod.yaml) uses explicit database
credential fields, preserving special-character passwords without URI encoding.
No duplicate URI/password/key values need to be maintained. The separate
replication role is intentional; PowerSync does not receive the PostgreSQL
owner's password. Standalone/dev URI configuration needs URI-safe passwords
(e.g. random hex) because the pinned PowerSync version does not decode passwords.

PostgreSQL 18 persists to a named volume mounted at `/var/lib/postgresql`.
Its first-start script enables the replication role/publication; backend Flyway
migrations and Hibernate validation complete before PowerSync starts. Backend
health checks use the existing public `/` endpoint (not a full dependency-health
endpoint); PowerSync uses `/probes/liveness`. Production overrides the permissive
JPA settings in the `prod` YAML and disables SQL logging.

### Public access and TLS

For clients on other machines, configure a TLS reverse proxy to the loopback
endpoints `http://127.0.0.1:8090` (backend) and `http://127.0.0.1:8081` (PowerSync).
Support streaming/WebSockets for PowerSync and restrict its admin/API routes.
Point remote clients at the resulting HTTPS URLs, not `localhost`. CORS controls
allowed **client origins**, not the server's listening address.

PostgreSQL has no published port. Both HTTP services bind to loopback by default;
do not publish plaintext services on a public interface. Override
`SERVICE_BIND_ADDRESS` only when needed for private ingress. A containerized
reverse proxy needs appropriate private networking; its own `localhost` is not
the Docker host.

This is a single-host baseline, not high availability. Database connections use
`sslmode: disable` only within the private Compose network.
For databases outside that host/network, configure verified TLS in
`powersync/service.prod.yaml`. Use backups, monitor replication lag/WAL growth, and
plan separate PowerSync storage/worker scaling as load grows. PowerSync is pinned
to an image digest; approve/test updates before overriding `POWERSYNC_IMAGE`.
Pin PostgreSQL and backend/base images to approved digests in your release process.

### Persistence, updates, and shutdown

Use a fresh production volume, or review and explicitly baseline an existing
database before enabling Flyway; do not reuse development data blindly. Init
scripts run only once: editing a password in `.env` does not change existing DB
roles. Rotate passwords in PostgreSQL and update the env together; likewise,
changing `POSTGRES_DB` / `POSTGRES_USER` does not rename existing databases/roles.
Changing `JWT_SECRET` invalidates existing client tokens; clients must sign in again.
Take and restore-test backups independently before deployments or credential changes.

After reviewing/pulling a release or changing non-database settings, rerun the
same startup command to rebuild/recreate affected services. `docker compose restart`
does **not** reload environment values. Do not change a live database's credentials
solely by editing the file.

```bash
# Stop/remove containers and the network, but keep the named database volume.
docker compose -f docker-compose.prod.yml --env-file .env down
```

**Do not add `-v`** unless you intend to delete production data. The default
project name is `sastapos-prod`; keep the project name stable to reuse its volume.
Compose validates missing required values but cannot judge secret strength.

### Packaged desktop and services on the same machine

The production Compose services bind to loopback by default. A desktop app on
that same machine can use `API_BASE_URL=http://localhost:8090` in
`frontend/.env`; build it with `cd frontend && yarn tauri build`.
Rust's default backend and PowerSync URLs are `http://localhost:8090` and
`http://localhost:8081`, so no launcher overrides are needed for this setup.
`POWERSYNC_ENDPOINT` in `frontend/.env` is not embedded in the Angular bundle,
and a packaged app does not bundle the Rust `.env`.

The packaged webview has a different origin from `yarn tauri dev`. On Linux,
allow `tauri://localhost` in the root `.env`'s `CORS_ALLOWED_ORIGINS`. Retain
`http://localhost:4200` only if development clients should also access this
backend. Windows clients normally need `http://tauri.localhost` instead
(`https://tauri.localhost` when configured to use HTTPS).

After changing the root `.env`, recreate the backend to apply it; a container
restart alone does not reload Compose environment values:

```bash
docker compose -f docker-compose.prod.yml --env-file .env up -d --no-deps --wait backend
curl -i -X OPTIONS http://localhost:8090/api/auth/login \
  -H 'Origin: tauri://localhost' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: content-type'
```

Expect HTTP 200 and `Access-Control-Allow-Origin: tauri://localhost`. HTTP 403
with `Invalid CORS request` means the backend rejected the webview origin, not
that Docker networking failed. Retry sign-in in the already running desktop app;
a CORS-only server configuration change does not require rebuilding it.
Keep these plaintext ports bound to loopback. A desktop installed on another
machine needs reachable HTTPS service URLs, not `localhost`.

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

**Reset the local DB** (it is only a replica; synced data is re-downloaded on next login): close the app, then run in the `frontend` directory:

```bash
yarn clean:db
# or to reset and restart dev mode fresh:
yarn tauri:dev:clean
```

Alternatively, delete the files manually:

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

Set `POWERSYNC_ENDPOINT` for the deployed PowerSync URL; use the root production
Compose stack and configure TLS ingress as described above.

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
