# Sasta POS

Sasta POS is an offline-first desktop point-of-sale application. Its user interface is built with Next.js and packaged as a native desktop application with Tauri. The desktop layer is written in Rust.

## Tech Stack

- **Desktop runtime:** [Tauri 2](https://v2.tauri.app/)
- **Frontend:** [Next.js 16](https://nextjs.org/) with React and TypeScript
- **Backend:** Rust, built and managed with Cargo
- **Local data:** SQLite, so the application remains usable without a network connection
- **Synchronization:** [PowerSync](https://www.powersync.com/) synchronizes local data with the production cloud database when connectivity is available
- **JavaScript tooling:** Node.js and Yarn 1

The Next.js frontend is statically exported to `out/` for Tauri to bundle. In desktop development, Tauri starts the Next.js development server at `http://localhost:3000` and opens it in the native application window.

> **Current status:** The repository contains the Tauri shell and Next.js frontend configuration. SQLite and PowerSync packages, database schema, and production sync credentials must be configured before the offline data and cloud synchronization workflow is available.

## Prerequisites

Install the following before running the project:

- [Node.js](https://nodejs.org/) compatible with Next.js 16
- [Yarn Classic 1.22](https://classic.yarnpkg.com/lang/en/docs/install/)
- [Rust](https://www.rust-lang.org/tools/install), including Cargo (the Rust toolchain requires version `1.77.2` or later)
- The Tauri system dependencies for your operating system

For operating-system-specific setup instructions, use the official Tauri guides:

- [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)
- [Tauri development setup](https://v2.tauri.app/start/)
- [Tauri application development](https://v2.tauri.app/develop/)

On Linux, the Tauri prerequisites guide lists the required WebKitGTK and related system packages for your distribution.

## Development Setup

1. Clone the repository and open the `frontend` directory.
2. Install the JavaScript dependencies:

	```bash
	yarn install
	```

3. Verify that Rust and Cargo are available:

	```bash
	rustc --version
	cargo --version
	```

4. Configure the local SQLite database and PowerSync connection values when those integrations are added. Keep credentials in local environment files such as `.env.local`; `.env*` files are ignored by Git.

## Run Locally

Run the complete desktop application in development mode:

```bash
yarn tauri:dev
```

This command starts Next.js and launches Sasta POS in a Tauri desktop window. It requires the Tauri system dependencies and Rust toolchain.

To run only the Next.js frontend in a browser:

```bash
yarn dev
```

Then open [http://localhost:3000](http://localhost:3000).

## Production Build

Create a production desktop bundle with:

```bash
yarn tauri:build
```

The command builds the static Next.js output, compiles the Rust application, and creates platform-specific bundles under `src-tauri/target/release/bundle/`.

To check frontend code quality:

```bash
yarn lint
```

## Project Structure

```text
app/              Next.js App Router frontend
public/           Static frontend assets
src-tauri/        Rust application and Tauri configuration
src-tauri/src/    Rust desktop application entry points
src-tauri/icons/  Application icons used by native bundles
```

## Useful References

- [Tauri documentation](https://v2.tauri.app/)
- [Tauri configuration reference](https://v2.tauri.app/reference/config/)
- [Next.js documentation](https://nextjs.org/docs)
- [Cargo book](https://doc.rust-lang.org/cargo/)
- [PowerSync documentation](https://docs.powersync.com/)
