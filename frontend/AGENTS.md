<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Frontend Project Context

- This is an offline-first Tauri 2 desktop POS app.
- The frontend uses Next.js 16, React, TypeScript, and the App Router under `app/`.
- The native desktop layer is Rust under `src-tauri/`; use Cargo for Rust changes.
- Next.js uses static export (`out/`) because Tauri serves the built frontend.
- Local data is intended to use SQLite; PowerSync is intended to sync local data with the production cloud database. Treat schema, sync configuration, and credentials as separate integration work when they are not present in the repository.
- Use Yarn Classic 1 with Node.js for frontend commands. Use `yarn tauri:dev` for the desktop app, `yarn dev` for browser-only frontend work, and `yarn tauri:build` for production desktop bundles.
- Keep secrets in local `.env` files; do not commit credentials. Follow the official [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for platform dependencies.
- Before changing Next.js behavior, read the relevant guide in `node_modules/next/dist/docs/` as required by the generated rules above.
