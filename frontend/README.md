# Point of Sale

A desktop point-of-sale application built with Angular 22 for the frontend and Tauri 2 for the native desktop shell. The app uses a local SQLite database owned by the Rust/Tauri side, with PowerSync handling remote synchronization.

On startup, the app restores the locally stored session. Signed-in users who need
store setup open onboarding; other valid sessions open Sell. Users with an expired
or missing session are directed to sign in. Login and authentication-page redirects
use the same setup requirement.

### New-owner onboarding

After signup, users complete a five-step setup at `/onboarding`: create a store,
configure store/invoice settings, then optionally create staff, customers, and
products. Owners without a store or with an unfinished setup checkpoint are
redirected to setup before entering the workspace. Signup creates a storeless
`CASHIER` account; it can enter onboarding and becomes an `OWNER` when the backend
creates the store. Creating a store advances to settings, not Sell. Sell is
available after completing or skipping the remaining setup steps.

Setup is online-only. All reads and creates go directly to the backend; no local
database writes or offline mutation queue are used. Each record is created
individually and immediately shown in the reused management table. PowerSync
downloads server records independently. Only a per-user step checkpoint is kept
on the device, not records or form drafts. Interrupted store creation checks for
an existing server store before offering another create.
Recovery reloads the user's role and store from `/api/auth/me` and persists the
updated session, so an interrupted role promotion does not leave them as a cashier.

Store settings reuse the administration page, with suggested invoice prefix and
receipt footer when unset. Staff, customer, and product steps have separate
create and next/skip controls. Product units come from the backend; tax assignment
is deferred to the normal product editor because there is no tax-category lookup
endpoint in the current API. Existing offline-first management pages are unchanged.

## Stack

- Angular 22
- Tauri 2
- Rust 2021
- SQLite (local operational database)
- PowerSync + Supabase-backed sync
- Yarn 1.22.22

## Environment configuration

Copy the [TypeScript env example](.env.example) to `frontend/.env`:

```sh
cp .env.example .env
yarn build:prod
```

Run these commands from `frontend/`. Set the required `API_BASE_URL` to the public
HTTPS backend URL before building a remote desktop client. The example uses
`http://localhost:8090` for local development. Exported process variables override
the `.env` value, so CI can also use `API_BASE_URL=https://api.example.com yarn build:prod`.

Yarn start, build, test, and Storybook scripts generate the ignored
`src/environments/environment.generated.ts` file before invoking their tools.
Both development and production environments use this generated configuration.
Only `API_BASE_URL` is included; missing or invalid values stop generation.
Changing `.env` requires restarting the dev server or rebuilding. For direct
Angular CLI commands, run `yarn env:generate` first. Run `yarn test:env` to test
the generator. Node.js 22.23.2 or newer is required by the frontend toolchain.

The [Rust env example](src-tauri/.env.example) documents `API_BASE_URL` and
`POWERSYNC_ENDPOINT`. Neither needs setting for local development; remote
production clients must override both. `API_BASE_URL` must match Angular's
`apiBaseUrl`. Rust reads the runtime environment and dotenvy searches the launch
working directory and its parents; `.env` is not bundled or located relative to
the installed binary automatically. Use a launcher environment for packaged apps.
Never put database passwords, JWT signing secrets or PowerSync admin tokens in
the client.

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

### Tauri build errors after moving the project

Cargo build outputs can contain absolute paths. If a Tauri build reports
`failed to read plugin permissions` with a missing file under an old project
directory, stop the development process and clear the stale Rust build cache.
Run from `frontend/`:

```sh
cargo clean --manifest-path src-tauri/Cargo.toml
yarn tauri dev
```

This removes generated Rust build artifacts, not source files or application
data. The next launch rebuilds the native dependencies and may take several
minutes. Do not copy `src-tauri/target/` when moving the project.

### Development-only Receipt Preview

Run `yarn tauri dev`, sign in, and select **Receipt Preview (dev)** in the sidebar
(`/dev/receipt-preview`). Select a 58 mm / 32-column or 80 mm / 48-column text
profile, edit the ASCII header/footer, and toggle customer, SKU, and barcode
visibility. Click **Render sample receipt**.

Rust validates structured input, wraps text, calculates totals with integer
minor units (two decimal places), and returns the shared layout. Angular displays
those exact lines in a monospace paper preview; it does not format receipt totals
or wrap text independently. The sample includes a long product name, discount,
tax, partial payment, and an outstanding balance. Settings are temporary,
not persisted or synchronized, and reset when the page is reopened.

No real sale or print job is created, and no physical receipt is printed.
The renderer does not yet produce ESC/POS bytes, logos, emphasis, or multilingual
output. Text profiles are explicit preview assumptions, not verified printable
widths for every device. There is no browser fallback. Production Angular builds
omit the route/navigation; release Rust builds omit the preview command.

For manual review, render both widths and confirm wrapping changes while totals
remain `PKR 396.00` with `PKR 96.00` outstanding. Show barcode to verify
`036000291452` retains its leading zero. Toggle fields and render again; modify
settings to confirm the old preview clears. Try non-ASCII header text to see an
explicit error. Native mock-IPC and Jest tests cover the command contract and
presentation, but do not certify physical printing or a real native webview.

### Development-only Test Scan

Run `yarn tauri dev`, sign in, and select **Test Scan (dev)** in the sidebar
(`/dev/test-scan`). The screen is explicitly simulated: it does not connect a
physical scanner, look up products, or change carts.

- **Scan Once** sends the barcode plus CR (carriage return) to Rust.
- Rust buffers partial input until CR, then emits a scan or an explicit error
  only to the requesting webview window. Every completed scan has its own ID,
  even if its barcode is identical to the previous scan.
- The typed Angular gateway displays events from its active Rust session only.
  Leaving the screen removes the listener and stops the session, discarding
  unfinished input.
- Barcodes preserve leading zeros and spaces. This milestone accepts printable
  ASCII, rejects empty/space-only frames, and limits barcodes to 255 bytes and
  individual input chunks to 4096 bytes. No EAN/UPC checksum is required.
- On malformed or oversized barcode input, the parser discards through the next
  CR before accepting a new frame. An oversized input *chunk* is rejected before
  parsing and leaves previously buffered input unchanged.

Review examples:

1. Scan `036000291452` twice: the leading zero remains, the count increases
   twice, and the scan ID changes.
2. Expand **Advanced**, send `036000`, then `291452`, then **Send CR**:
   no scan is produced until CR; the final barcode is `036000291452`.
3. Send the literal chunk `A\rB\r`: two scans arrive. Only literal `\r` is
   decoded into CR; other characters are sent unchanged.
4. Scan an empty barcode or send a chunk containing a newline: an error appears,
   not a successful scan. Send CR to finish a rejected partial frame.
5. Send partial input, leave the screen, and reopen it: the previous partial
   input must not carry over.

`yarn start` alone cannot exercise native parsing; the page reports that the
Tauri desktop app is required rather than falling back to browser simulation.
Production Angular builds omit the route/navigation. Release Rust builds do not
compile or register simulator commands. Desktop packaging uses `yarn build:prod`
to keep these gates aligned. Neither simulator input nor sessions are persisted
or synchronized.

### Development-only product barcode scans

In `yarn tauri dev`, open **Add Product** or edit a product. The **Simulated
scanner (dev)** panel has its own test barcode and **Scan Once** button. Clicking
it (or pressing Enter in the simulator input) focuses the product barcode field
and sends CR-framed input through the existing Rust parser. The field changes
only after Rust returns a scan, preserves
leading zeros and spaces, and is marked dirty. Scanning does not save the product.

The barcode consumer ignores scans while another field is focused, during saving,
or when the barcode control is disabled. It releases on blur, submission, and
navigation; ignored scans are not replayed. Manual input continues to work.
Parser/command failures appear in the simulator panel without replacing
product-save errors. Browser-only development shows the desktop-app requirement
instead of providing a fake scanner. Production hides this panel and does not
open a simulator session. Real serial scanning remains deferred.

For manual review, test both Add and Edit: scan `036000291452`, verify the leading
zero, save, and reopen to confirm normal product persistence. Also try an empty
simulated value (an error, no barcode change), saving while a scan is in flight,
and leaving/reopening the page (no stale scan or unfinished frame).

### Development-only Sell barcode scans

In `yarn tauri dev`, open **Sell** and use its **Simulated scanner (dev)**
panel. Enter the exact barcode of an active product in the current store, then
click **Scan Once** or press Enter in the simulator input. Input goes through the
existing Rust CR-framed parser before adding the matched product to the cart.
No physical scanner is connected.

- Scans work regardless of focus on Sell. Distinct scans of the same barcode
  increment quantity; duplicate delivery of one scan record does not.
- Barcode matching preserves case, spaces, and leading zeros. It does not use
  SKU or fuzzy fallback. Ordinary product search keeps its existing behavior.
- Unknown barcodes show **Product not found**. Duplicate catalogue barcodes show
  an ambiguity error. Neither changes the cart.
- Scans are ignored during any Material dialog and while saving, resuming,
  discarding, or completing a sale. Ignored scans are never queued or replayed.
- Leaving Sell closes its simulator session and releases its consumer. Late
  events cannot update the cart on another page.
- Startup/parser/send failures appear in the scanner panel, separately from
  checkout notifications. Browser-only mode does not simulate native events.
  Production hides the controls and does not start a simulator session.

For manual review, create or edit an active product with barcode `036000291452`
and return to Sell. Scan twice and verify one cart line with quantity 2. Try an
unknown barcode and duplicate barcodes on two active products: the cart must
stay unchanged. Open payment, cancel it, and verify scanning resumes without
adding ignored scans. Navigate to another page and back: no stale scan should
change the cart. Real serial scanning and physical receipt printing remain deferred.

## Durable receipts and print jobs

Open **Receipts** in the sidebar (`/receipts`) in the Tauri desktop app.
Terminal receipt settings are persisted by Rust and are separate from synced
store settings. Blank header/footer overrides use the store name/address and
receipt footer at the moment a sale is completed.

- Auto-print is enabled by default. Copy count is restricted to 1-5.
- **No printer connected** is the default: jobs fail explicitly as not sent.
  There is no automatic simulator fallback and no physical printer adapter yet.
- Completed sales capture an immutable receipt snapshot and their initial job
  inside the sale transaction. Pending bills do not queue receipts.
- Printing runs after commit in Rust. Print failures do not undo checkout.
  Checkout notifications direct the cashier to Receipts for print status.
- Changing terminal layout or store/catalogue data does not change old receipts.
- Failed jobs require manual retry. Uncertain jobs require confirmation because
  output may already exist. Sending jobs cannot be retried until recovery.
- **Queue COPY** uses the original saved data, layout, and copy count with the
  current printer connection. It does not repeat a sale, stock movement, payment,
  or ledger entry.
- Receipt data, jobs, settings, and attempt history stay on this terminal and
  are not uploaded or synced to another terminal. Keep the local database backed
  up; this feature is not a remote receipt archive.
- The screen shows the latest 100 receipts/jobs for the current store; all
  historical records remain stored locally. Earlier sales without a snapshot
  are not retroactively reconstructed.

### Development virtual printer acceptance

1. Run the desktop app with `yarn tauri dev`, open **Receipts**, select
   **Virtual printer (development only)** and **Save virtual output**, and save.
2. Complete a sale, including a fractional-quantity product if available.
   Checkout should clear the cart normally. In Receipts, wait for
   **Virtual output saved - NOT physically printed**, then inspect the exact
   Rust layout and generated ESC/POS bytes. Nothing is physically printed.
3. Change catalogue/store content and terminal paper profile/header. Queue a
   COPY of the earlier receipt: original text, totals, and profile must remain,
   with COPY added. The original sale/payments/stock must remain unchanged.
4. Select **Disconnected** or **Write failure**, save, and complete a new sale.
   Verify its not-sent error, successful checkout, and retained snapshot.
   Change the outcome to success and manually retry; the old attempt must remain.
5. Select **Connection lost (uncertain)**. Retry must warn about possible duplicate
   output; cancel must leave the job untouched.
6. Select **Interrupted**, save, and complete a sale. Its job remains sending.
   Restart the desktop app: it must become uncertain, not auto-retry. Change the
   test outcome to success, save, and confirm retry only after inspecting output.
7. Disable auto-print, save, and complete a sale: it must have a saved receipt
   but no initial print job. Queue COPY should still work.
8. Save **No printer connected**: new jobs must explicitly fail as not sent,
   never silently generate successful virtual output.

Release builds hide virtual controls and Rust rejects virtual settings. If a
development-selected virtual printer persists into a release run, pending jobs
fail explicitly as unavailable. Select **No printer connected** and save to clear
that development selection. Real printer acceptance is deferred to its adapter
milestone. ASCII text is still the supported initial rendering scope; non-ASCII
sale content is preserved in the snapshot but its print attempt fails explicitly.

Focused validation:

```bash
cargo test --manifest-path src-tauri/Cargo.toml --lib -- --test-threads=1
yarn test --runInBand --runTestsByPath \
  src/app/core/hardware/printing.gateway.spec.ts \
  src/app/features/hardware/receipt-jobs.page.spec.ts \
  src/app/features/sell/data/sale.repository.spec.ts \
  src/app/features/sell/sell.page.spec.ts
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
