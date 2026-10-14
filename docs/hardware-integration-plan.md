# Scanner and Receipt Printing Implementation Plan

Status: agreed scope; milestones 1 (Test Scan simulator) and 2 (focused product barcode consumption) implemented.

Decision date: 2026-10-14.

This document records the agreed hardware integration requirements for future
implementation. Except for the milestone described below, it describes planned
behavior, not capabilities already present in the application.

### Milestone 1: Test Scan simulator

The development desktop app includes a **Test Scan (dev)** screen. A typed
gateway sends input chunks to a Rust-owned, per-window session and CR-framed
parser. Window-targeted scan/error events return to that screen. The parser
preserves payloads and leading zeros, handles partial/multiple frames, assigns
distinct scan IDs, and rejects empty, malformed, and oversized input explicitly.
It accepts printable ASCII barcodes up to 255 bytes and input chunks up to
4096 bytes. On an invalid frame it discards through the next CR to resynchronize.

Navigation cleanup removes the listener and stops the session. Simulator
commands are compiled/registered only in debug Rust builds; the Angular route
and navigation are excluded from production builds. There is no browser fallback.
No cart, sale, database, or real hardware integration is included yet.
Other terminators, connection simulation, cart consumers,
hardware settings, and printer functionality remain future work.

See [development review instructions](../frontend/README.md#development-only-test-scan)
for manual examples. Rust tests cover parser behavior and Tauri mock-runtime
IPC/event delivery; Jest tests cover the typed gateway and screen lifecycle.
These tests do not certify a real native webview or physical device.

### Milestone 2: Focused Add/Edit Product barcode consumption

Add/Edit Product uses a reusable, single-active-consumer service. Scans populate
the barcode field verbatim and mark it dirty only while that field is focused
and enabled. Blur, submission, saving, and destruction suspend or release the
consumer; suspended scans are not replayed. Duplicate records are ignored, but
distinct scans containing the same barcode remain valid.

A development-only simulator panel on the product form opens a Rust session
through the existing gateway. **Scan Once** focuses the barcode field, sends
the test value plus CR to Rust, and waits for its parsed event before updating
the form. Parser/start/send errors are shown separately from product-save errors.
Manual barcode entry remains available if native simulation cannot start.
Production builds do not open simulator sessions or show simulation controls.
Real scanner adapters and Sell-page consumption are not implemented.

Jest specs cover focus, blur, dirty state, Add/Edit behavior, duplicate records,
saving/disabled guards, simulation, production gating, and asynchronous cleanup.
The existing Rust parser/IPC tests remain applicable; real native-webview
acceptance still requires manual desktop testing.

## 1. Ownership and platform scope

Target Linux, Windows, and macOS.

Rust owns:

- Scanner connections, input framing, normalization, and device status.
- Printer discovery, connection configuration, and printing.
- Receipt layout validation and rendering.
- Local hardware and receipt configuration persistence.
- Durable print-job processing and recovery.

Angular/TypeScript owns:

- Hardware configuration and test screens.
- Receipt configuration and preview presentation.
- Routing completed scans to the active consumer.
- Product lookup, cart updates, and product-form updates.
- User-visible hardware status, errors, retry, and reprint actions.

Use typed Tauri commands for configuration and controls. Use window-targeted
Rust-to-TypeScript Tauri events for scans and hardware status. Hardware events are
an explicitly agreed exception to the existing command-only integration rule;
components still communicate through typed gateway services, not direct Tauri
calls.

Rust continues to own SQLite and its persistence lifecycle. Local hardware
settings and print jobs must not sync to other terminals.

## 2. Scanner support

### Initial adapters

- Serial scanners, including USB virtual COM devices.
- Development-only scanner simulator.

Keyboard-wedge scanners and USB HID/POS adapters are deferred.

Rust lists available serial ports. The user selects a port and configures baud
rate and scan terminator. Provide a Test Scan screen to verify setup.

The parser must:

- Handle partial/chunked reads and multiple scans in one read.
- Support configured terminators, including CR, LF, and CRLF.
- Preserve barcodes as strings, including leading zeros.
- Remove configured framing only; avoid destructive normalization of payloads.
- Reject malformed or oversized input with explicit errors.
- Report disconnect/reconnect and connection errors.

Do not globally require EAN/UPC checksums. Internal and Code 128 barcode values
may have different formats.

### Reusable scan-consumer behavior

Expose a typed gateway and reusable scan-consumer service or directive. Hardware
transport and parsing must not contain page-specific business logic.

Only the active consumer receives a scan. Target the appropriate application
window; avoid broadcasting scans into every window.

#### Sell page

- Accept scans anywhere on the active Sell page, regardless of focused field.
- Suspend cart scanning while a dialog is open or a sale is being submitted.
- Release the consumer when leaving the page.
- Do not buffer suspended scans for later cart mutation.
- Resolve products using exact barcode matching, not fuzzy search or SKU fallback.
- Add the matched product through the existing cart-add operation.
- Separate scans of the same barcode add the product again, normally increasing
  quantity.
- Deduplicate repeated delivery of the same scan record only; do not debounce
  identical barcode values.
- Unknown barcode: show "Product not found" and leave the cart unchanged.
- Multiple exact matches: show an ambiguity error; never select arbitrarily.

Ordinary manual product search remains separate and preserves its existing
behavior.

#### Add/Edit Product

- Consume scans only while the barcode field is focused.
- Populate that field and mark it dirty.
- Release the consumer on blur or page destruction.
- Respect disabled/saving states so scans do not change a form during submission.

Other pages must not mutate a cart or product form in response to scans.

## 3. Printer support

### Initial adapters

- Direct USB ESC/POS printer adapter.
- Development-only virtual printer.

Begin with a generic compatible ESC/POS USB profile. Verify support for a
specific printer model when hardware becomes available.

Generic support is limited to compatible devices exposing a usable USB
interface. Some printers need vendor drivers or proprietary protocols. Linux,
Windows, and macOS may require different permissions or driver/interface setup.

Network ESC/POS and OS-installed printer queue adapters are outside the initial
scope.

## 4. Configurable receipts

Use structured settings rather than an arbitrary HTML template editor or
drag-and-drop designer.

Initial settings include:

- 58 mm and 80 mm paper profiles.
- Header and footer content.
- Optional logo.
- Visible fields, including optional SKU, barcode, customer information, and tax
  breakdown.
- Spacing, alignment, and font emphasis.
- Auto-print enabled/disabled.
- Copy count.

Receipt layout configuration is local per terminal and validated/persisted by
Rust. Store-wide layout synchronization is deferred. Existing store identity and
receipt-footer settings can supply receipt content.

Printer connection, printable width, encoding, and cutter capabilities are local
device settings. Paper width in millimetres alone does not determine the number
of printable characters; use the selected printer/font profile.

English/ASCII text is the initial scope. Keep the rendering boundary suitable for
future rasterized multilingual output, but do not claim initial support for Urdu
or other complex scripts.

### Shared layout pipeline

```text
Immutable receipt data + versioned receipt configuration
                         |
                  Rust layout engine
                         |
                Shared receipt layout
                  /             \
          Virtual preview    ESC/POS output
```

The Angular preview presents Rust-rendered output. Do not independently implement
receipt wrapping or total formatting in Angular.

The persisted receipt snapshot must contain enough data to render the receipt
without relying on current catalogue prices or mutable store settings.

## 5. Sale completion and print-job lifecycle

```text
Commit sale + immutable receipt snapshot + durable local print job
                              |
                   Complete checkout / clear cart
                              |
                    Rust processes print job
                              |
                   Report result or offer retry
```

Persist the completed sale, receipt snapshot, and initial print job together so a
crash cannot leave a committed auto-print sale without its job.

Required behavior:

- Auto-print is enabled by default and remains configurable.
- Print completed sales only; pending bills do not automatically print.
- Printing happens after commit and must not block checkout on device I/O.
- Printer failure must not roll back, repeat, or resubmit the sale.
- Persist failed jobs and offer explicit manual retry.
- Preserve print-job history and expose status/errors to the user.
- Distinguish definitely-not-sent failures from uncertain delivery.
- Require confirmation before retrying uncertain delivery or an interrupted
  in-flight job.
- Do not blindly auto-retry after a crash or lost connection: paper may already
  have printed.
- Do not equate a successful USB write with proof that a physical receipt printed.

Explicit reprints:

- Use original sale data and original layout configuration.
- Mark the receipt as COPY.
- Use the currently selected printer connection.
- Do not create another sale or change stock/payment records.

## 6. Hardware-free simulation

Simulation is available in development builds only.

All simulation must be explicitly labeled. A failed real device must never
silently fall back to a simulator, and virtual output must never be reported as a
physical receipt printed.

### Scanner simulator

Provide controls for:

- Barcode entry and Scan Once.
- Repeated scans.
- Partial/chunked input.
- Configured Enter/CR/LF framing.
- Disconnect/reconnect and error simulation.

Inject simulated input before the Rust parser so it exercises the production
parsing and delivery path rather than directly updating an Angular cart.

### Virtual printer

- Exercise the production Rust receipt-layout pipeline.
- Present a paper-width preview in the application.
- Capture generated ESC/POS output for automated assertions.
- Simulate disconnected devices, write failures, and uncertain delivery.
- Exercise persistent print-job retry and recovery behavior.

Simulation cannot certify physical alignment, character encoding, USB
permissions, driver compatibility, paper feeding, or cutter behavior. Real-device
acceptance testing remains required.

## 7. Automated testing

Use existing tooling: Rust tests, Angular/Jest specs, and focused Rust-to-TS
integration tests. A cross-platform CI matrix is not part of the initial scope.

Create deterministic local test products with barcode fixtures such as:

| Format | Barcode |
| --- | --- |
| EAN-13 | `4006381333931` |
| EAN-13 | `5901234123457` |
| UPC-A | `036000291452` |

These are valid-format fixtures, not guaranteed catalogue entries. Tests must
explicitly create or seed the matching products.

### Rust tests

- Scanner framing, chunk boundaries, and multiple scans per read.
- Leading-zero preservation.
- Malformed and oversized input.
- Connection/error handling and simulator behavior.
- Receipt wrapping, totals, and optional fields.
- Long product names, large amounts, discounts, tax, and outstanding balances.
- Both paper profiles, copy count, and COPY marking.
- ESC/POS output and capability-dependent commands.
- Print-job persistence, failure classification, and interrupted-job recovery.

### Angular/Jest specs

- Typed gateway behavior and scan-consumer lifecycle.
- Exact matching and unknown/ambiguous barcode handling.
- Repeated scans incrementing quantity.
- Sell scanning suspended during dialogs/submission.
- No scan effects after navigation or on unrelated pages.
- Barcode field filling only while focused, including dirty state.
- Printer failures reported separately from successful sale completion.
- Retry/reprint does not repeat a sale or change stock/payments.

### Focused native integration tests

- Simulator input passes through Rust parsing and reaches the active Angular
  consumer.
- Completed sale persists its receipt snapshot and print job.
- Virtual printing uses the persisted original layout/data.
- Failure and recovery behavior crosses the Rust-to-TypeScript boundary correctly.

Browser tests with mocked gateways may supplement this coverage, but do not
replace native integration tests.

Run native validation locally on Linux first. Verifying Windows/macOS native
behavior requires suitable machines or runners.

## 8. Implementation order

1. Hardware contracts, Rust-owned settings, and typed Tauri gateway.
2. Scanner parser, simulator, and reusable Angular scan consumers.
3. Immutable receipt snapshots, structured settings, and shared-layout preview.
4. Durable print queue and virtual printer.
5. Serial scanner and direct USB ESC/POS adapters.
6. Automated coverage and platform-specific setup documentation.

Add focused tests alongside each implementation step rather than deferring all
validation until the end.

## 9. Existing integration points

- [Sell page](../frontend/src/app/features/sell/sell.page.ts): currently completes
  the sale, clears the cart, and shows a notification.
- [Sale repository](../frontend/src/app/features/sell/data/sale.repository.ts):
  existing transactional sale persistence.
- [Sale models](../frontend/src/app/features/sell/models/sale.model.ts): current
  SaleReceipt contains identification and totals only, not a full receipt
  snapshot.
- [Product toolbar](../frontend/src/app/features/sell/components/product-toolbar/product-toolbar.component.ts):
  existing focused-field barcode/SKU and Enter behavior; preserve manual search.
- [Product form](../frontend/src/app/features/products/components/product-form/product-form.component.ts):
  existing barcode control for Add/Edit Product.
- [Store settings model](../frontend/src/app/features/store/store.model.ts):
  existing store identity and receipt-footer configuration.
- [Rust entry point](../frontend/src-tauri/src/lib.rs): Tauri command registration
  and native application setup.
- [Frontend project guide](../frontend/AGENTS.md): architecture rules to reconcile
  with the explicitly agreed hardware-event exception.

## 10. Deferred work and acceptance limits

Deferred:

- Keyboard-wedge and USB HID/POS scanner adapters.
- Network printing and OS printer queue adapters.
- Store-wide synchronized receipt layouts.
- Arbitrary template editing and drag-and-drop receipt design.
- Complex-script/multilingual receipt rendering.
- Windows/macOS/Linux CI matrix.

Before production use, verify actual scanner framing and USB printer
compatibility on each supported platform. Select a real printer model and
confirm printable width, encoding, logo output, and cutter capabilities.
