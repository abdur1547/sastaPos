# Point of Sale

A desktop point-of-sale application built with Angular 22 for the frontend and Tauri 2 for the native desktop shell. The app uses a local SQLite database owned by the Rust/Tauri side, with PowerSync handling remote synchronization.

On startup, the app restores the locally stored session. Users with a valid session open on the Sell page; users with an expired or missing session are directed to sign in. Authentication pages also redirect users with a valid session to Sell.

## Stack

- Angular 22
- Tauri 2
- Rust 2021
- SQLite (local operational database)
- PowerSync + Supabase-backed sync
- Yarn 1.22.22

## Prerequisites

Before building the app for production, install:

- Node.js 22.23.2
- Yarn 1.22.22
- Rust stable toolchain
- Tauri system dependencies for your OS

## Install dependencies

```bash
yarn install
```

> This project uses Yarn and does not use npm lockfiles.

## Run in development

```bash
yarn start
```

or run the desktop app with Tauri:

```bash
yarn tauri dev
```

## Production build

### 1) Build the Angular frontend

```bash
yarn build:prod
```

This creates the production bundle in the `dist/` directory.

### 2) Build the Tauri desktop app

```bash
yarn tauri build
```

This compiles the Rust backend and packages the desktop application for production. The output is typically generated under:

```bash
src-tauri/target/release/bundle/
```

### 3) Optional backend verification

```bash
cargo check --manifest-path src-tauri/Cargo.toml
```

## Useful commands

```bash
yarn build
# standard Angular build

yarn build:prod
# optimized production frontend build

yarn tauri build
# production desktop binary/package build

yarn lint
# lint TypeScript, Angular templates, and SCSS

yarn lint:eslint
# lint TypeScript and Angular templates

yarn lint:scss
# lint SCSS

yarn lint:fix
# automatically fix supported lint issues

yarn test
# run Jest tests
```

## Important architecture notes

- Store settings (`/store-settings`, available to owners) are online-only. The page loads
  `GET /api/store` and saves changed profile fields with `PATCH /api/store` or invoice/receipt
  fields with `PATCH /api/store/settings`, using the authenticated HTTP client. No local
  database writes, offline queue, or PowerSync mutations are used. The two sections save
  independently; failures retain edits for retry, and leaving with unsaved changes requires
  confirmation.

- SQLite is managed exclusively by the Rust/Tauri layer.
- Angular never directly owns or manages the SQLite database.
- The frontend initializes the local database and then invokes the Rust `connect` command for PowerSync.
- Products are synchronized from the backend only for the authenticated store, using the
  JWT `store_id` claim. The Rust upload handler batches queued local
  mutations to the backend's `POST /api/sync/upload` (`API_BASE_URL`).
- Hardware integration such as barcode scanners and printers must be implemented in Rust and exposed through Tauri commands.

## License

This project is licensed under the MIT License.
