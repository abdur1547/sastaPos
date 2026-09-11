# Sasta POS

Sasta POS is a desktop point-of-sale system being built for shops and businesses in the Pakistani market. It is designed to keep day-to-day sales and stock workflows available even when the internet is unreliable, while synchronizing data with the central backend whenever connectivity returns.

The application is intended to support common retail operations such as store management, products, units of measure, tax categories, sales, stock movements, and business settings. The backend already contains domain modules for these areas; the desktop UI and offline data workflow are still under active development.

## Architecture

```text
Tauri desktop application
├── Next.js + React + TypeScript UI
├── Rust desktop layer
└── Local SQLite database
	│
	└── PowerSync synchronization when online
		    │
		    ▼
	  Spring Boot backend + PostgreSQL
```

- **Desktop app:** Tauri 2 packages the Next.js interface as a native desktop application. Rust provides the desktop integration layer.
- **Frontend:** Next.js 16, React, TypeScript, and Tailwind CSS provide the user interface.
- **Offline-first data:** SQLite is the planned local database for the desktop app, allowing sales and other workflows to continue without an active network connection.
- **Synchronization:** PowerSync is planned to synchronize the local SQLite database with the backend data source when a connection is available.
- **Backend:** Spring Boot 4.1.1 exposes the server-side application and API. It uses Spring Web, Spring Data JPA, validation, Flyway, and PostgreSQL.
- **Primary database:** PostgreSQL stores the central backend data. Docker Compose provides a local PostgreSQL instance for development.

> **Implementation status:** The Tauri shell, Next.js configuration, and Spring Boot domain structure are present. The current frontend is still the default Next.js starter screen, and the SQLite, PowerSync, and production authentication/configuration workflows still need to be connected.

## Repository Structure

```text
.
├── frontend/       Next.js application and Tauri desktop project
│   ├── app/        Next.js App Router pages and layout
│   └── src-tauri/  Rust source and Tauri configuration
├── backend/        Spring Boot API and PostgreSQL configuration
│   ├── src/main/java/  Application and domain modules
│   └── src/main/resources/
└── README.md       Project overview and navigation
```

## Getting Started

### Prerequisites

- Node.js compatible with Next.js 16
- Yarn Classic 1.22
- Rust and Cargo (Rust `1.77.2` or later)
- Tauri system dependencies for the operating system
- Java 25 and Maven, or the Maven Wrapper included in `backend/`
- Docker and Docker Compose for the local PostgreSQL service

See the official [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) guide for Linux and other operating systems.

### Run the Desktop App

```bash
cd frontend
yarn install
yarn tauri:dev
```

This starts the Next.js development server and opens the application in a Tauri window. To run only the web frontend in a browser:

```bash
cd frontend
yarn dev
```

Open <http://localhost:3000>.

Build a native production bundle with:

```bash
cd frontend
yarn tauri:build
```

### Run the Backend

Start the development PostgreSQL service first:

```bash
cd backend
docker compose up
```

Then build and run the Spring Boot application:

```bash
./mvnw clean package
java -Dspring.profiles.active=production -jar ./target/sastaPos-0.0.1-SNAPSHOT.jar
```

The backend is available at <http://localhost:8080>. The default local database service is PostgreSQL on port `5433`, with database `sastaPos`, user `postgres`, and the development password defined in `backend/docker-compose.yml`. Override connection settings with `JDBC_DATABASE_URL`, `JDBC_DATABASE_USERNAME`, and `JDBC_DATABASE_PASSWORD` when needed.

## Component Documentation

- [Frontend and desktop setup](frontend/README.md): Next.js, Tauri, Rust, local development, and desktop builds.
- [Backend setup](backend/README.md): Spring Boot, profiles, Docker Compose, Maven builds, and deployment.

## Development Notes

- The frontend uses Yarn 1 and its scripts are defined in `frontend/package.json`.
- The Tauri configuration builds the statically exported Next.js output from `frontend/out` and bundles for all configured desktop targets.
- The backend uses Spring Boot's Docker Compose integration in development and Flyway for database migrations as the schema evolves.
- Keep local credentials and environment-specific values out of version control. Use local environment or profile configuration for database and synchronization services.

## Technology References

- [Next.js](https://nextjs.org/docs)
- [Tauri](https://v2.tauri.app/)
- [Rust and Cargo](https://doc.rust-lang.org/cargo/)
- [Spring Boot](https://docs.spring.io/spring-boot/docs/current/reference/htmlsingle/)
- [Spring Data JPA](https://docs.spring.io/spring-data/jpa/reference/jpa.html)
- [PostgreSQL](https://www.postgresql.org/docs/)
- [PowerSync](https://docs.powersync.com/)
