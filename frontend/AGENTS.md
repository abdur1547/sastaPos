# Project Guide

## Stack

- Desktop application: Tauri 2 with an Angular 22 frontend and Rust 2021 backend.
- TypeScript package manager: Yarn 1.22.22. Use `yarn <script>`; do not introduce npm lockfiles.
- Rust package manager: Cargo. Run Tauri commands through `yarn tauri <command>` when both sides are involved.
- This is an offline-first POS application. SQLite is the local source of operational data and is owned exclusively by the Rust/Tauri side. Do not access or manage the SQLite database directly from TypeScript/JavaScript.

## Architecture Rules

- Angular is UI and application orchestration. Follow the installed `angular-developer` skill for Angular work.
- All hardware integration, including barcode scanners and printers, must be implemented in Rust. Angular calls Rust through Tauri commands only.
- PowerSync synchronizes the Rust-managed local SQLite database with PowerSync Cloud backed by Supabase. Use the native Tauri integration (`@powersync/tauri-plugin` and Rust `tauri-plugin-powersync`), not `@powersync/web` or IndexedDB.
- Sync connection state belongs in Rust and is shared across Tauri windows. The frontend initializes the database then invokes Rust's `connect` command.
- `@powersync/common` must remain exactly `2.0.0` to match the Tauri plugin and avoid duplicate schema types.
- The current Rust upload handler completes queued transactions but does not yet persist writes to a backend API. Treat server-side mutation persistence as unfinished work.

## Angular Conventions

- Organize product code by feature: `src/app/features/<feature>/`. Keep a feature's pages, components, routes, models, repositories, and tests together. Lazy-load feature routes where appropriate.
- Reserve `core/` for application-wide singleton services, PowerSync/Tauri integration, guards, interceptors, and shared infrastructure. Put reusable presentational UI, pipes, and directives in `shared/`; neither may depend on a feature.
- Prefer standalone components, route-level providers, strict TypeScript, typed reactive forms, and Angular signals. Keep local and shared feature state in signals owned by services; do not add NgRx unless a concrete cross-feature requirement justifies it. Keep components focused on presentation and user interaction; move business rules to feature services/use cases.
- Use `ChangeDetectionStrategy.OnPush` for new components. Keep templates declarative; avoid logic-heavy template expressions, `any`, and unmanaged subscriptions. Use `async` pipes or Angular lifecycle-aware cleanup.
- Name files by responsibility: `*.page.ts`, `*.component.ts`, `*.service.ts`, `*.repository.ts`, `*.model.ts`, and `*.routes.ts`. Use `app-` kebab-case selectors and `Component` or `Page` class suffixes, as required by ESLint.
- Encapsulate feature data access behind injected repositories. Repositories use the approved native PowerSync/Tauri database service; they must not use browser SQLite drivers, `@powersync/web`, or own database files, schema, migrations, or sync lifecycle. Rust owns those concerns.
- Define explicit domain models and map persistence rows at repository boundaries. Do not leak database rows, PowerSync types, or Tauri command payloads into page/component APIs.
- Use Tauri commands through small typed gateway services in `core/` or the owning feature. Do not call `invoke()` directly from components; validate command inputs and handle typed success/error states.
- Add focused Jest tests for services, repositories, and non-trivial components. Run `yarn lint` and the relevant `yarn test` tests after Angular changes.
- Use Angular Material for interactive UI components and accessibility behavior. Use Tailwind CSS utility classes to compose layout, spacing, sizing, and responsive presentation around those components; avoid duplicating Material behavior or styling primitives.

## POS UI Style

- Build POS screens as dense, operational SaaS interfaces: a permanent dark sidebar, a light workspace canvas, and a white top bar. Avoid marketing layouts and floating section cards.
- Use solid colors only; do not use CSS gradients. The core palette is ink `#152033`, canvas `#f5f7f8`, teal `#14b8a6`, lime `#a3e635`, amber `#f59e0b`, and coral `#ef6b5a`.
- Use `Nunito Sans` (with `Avenir Next` fallback) for both display and body text. Keep labels compact, uppercase, and widely tracked; use strong readable type for operational page titles.
- Navigation uses clear text labels, a teal active state, and restrained 6-8px corner radii. Preserve responsive behavior by converting the sidebar navigation to a horizontal strip on narrow screens.

## Current Versions

| Component | Version |
| --- | --- |
| Node.js | 22.23.2 |
| Yarn | 1.22.22 |
| Angular | 22.1.1 |
| Tauri JavaScript API | 2.11.1 |
| Tauri Rust crate | 2.11.3 |
| Tauri CLI | 2.11.4 |
| Tauri build crate | 2.6.3 |
| PowerSync common | 2.0.0 |
| PowerSync Tauri plugin (TypeScript) | 0.0.6 |
| PowerSync Tauri plugin (Rust) | 0.0.6 |
| PowerSync Rust crate | 0.0.7 |

## Common Commands

```sh
yarn start
yarn build
yarn test
yarn lint
yarn tauri dev
yarn tauri build
cargo check --manifest-path src-tauri/Cargo.toml
```
