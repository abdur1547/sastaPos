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
change the cart. Real serial scanning and receipt printing remain deferred.

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
