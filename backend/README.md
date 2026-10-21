# Sasta POS Backend

The backend is a Spring Boot monolith for Sasta POS, an offline-first desktop point-of-sale application for the Pakistani market. It provides the central API and PostgreSQL persistence used by desktop clients. Desktop clients are intended to keep a local SQLite database and use PowerSync to synchronize data when connectivity is available.

PowerSync downloads store-scoped data to the native desktop SQLite database. Queued
desktop writes use `POST /api/sync/upload`, which routes and coalesces operations into
feature-owned bulk services.

Supported upload tables are `customers`, `products`, `product_tax_categories`,
`business_settings` (invoice-counter advancement only), `sales`, `sale_items`,
`payments`, `ledger_entries`, and `stock_movements`. Parent records are persisted
before children. Child references and conflicting IDs are store-scoped. Sales
retain client-generated IDs and invoices; uploading snapshots does not run the
REST sale-creation side effects again. Ledger uploads recompute customer balances
inside the write transaction, and invoice counters cannot decrease on retries.
Store/staff projections and lookup tables remain download-only.

An HTTP 200 upload response can contain per-row rejections. The native client retains
the batch until the rejection list is empty; correct rejected data/configuration
before retrying. Older clients acknowledged rejected batches, so previously lost
writes require reconciliation using the original IDs, not creating a second sale.
Concurrent offline invoice allocation across devices is not yet coordinated.

## Technology and Structure

- Java 25 and Spring Boot 4.1.1
- Spring Web, validation, Spring Data JPA, and Hibernate
- PostgreSQL as the central database
- Flyway dependency for database migrations as migrations are introduced
- Springdoc OpenAPI and standardized API error responses
- Docker Compose for local PostgreSQL
- Lombok for boilerplate reduction

The repository follows Maven's standard `src/main` layout. Application code is under `src/main/java` and configuration is under `src/main/resources`.

The code uses feature-based organization. Each domain keeps its related resources, services, repositories, entities, DTOs, and rules together:

```text
src/main/java/com/sastapos/sasta_pos/
├── business_setting/
├── product/
├── sale/             # sales and sale items
├── stock_movement/
├── store/
├── tax_category/
├── units_of_measure/
├── user/
├── config/
├── events/
└── util/
```

Keep new application code under the standard Maven source roots shown above.

## Prerequisites

- Java 25
- Docker and Docker Compose
- A POSIX shell for `bash ./mvnw` on Linux/macOS, or `mvnw.cmd` on Windows
- An IDE with Lombok and annotation processing enabled when using IntelliJ

The checked-in Maven Wrapper downloads the configured Maven version, so use it instead of a globally installed Maven command.

## Local Development

1. Start the PostgreSQL service:

	```bash
	docker compose up -d
	```

	The Compose file creates database `sastaPos` and maps PostgreSQL to host port `5432`.

2. Run the application with the local database settings:

	```bash
	JDBC_DATABASE_URL=jdbc:postgresql://localhost:5432/sastaPos \
	JDBC_DATABASE_USERNAME=postgres \
	JDBC_DATABASE_PASSWORD='P4ssword!' \
	bash ./mvnw spring-boot:run
	```

	The application listens on `http://localhost:8090`. The same database values can be supplied through an untracked `src/main/resources/application-local.yml` or the IDE run configuration. `application-local.yml` is ignored by Git.

3. Check the available API documentation:

	- Swagger UI: `http://localhost:8090/swagger-ui/index.html`
	- OpenAPI JSON: `http://localhost:8090/v3/api-docs`

Useful checks:

```bash
bash ./mvnw test
bash ./mvnw package
```

Docker must be available when running tests that depend on containerized services. Use the narrowest relevant test or build command while iterating.

## Configuration

The committed configuration is in `src/main/resources/application.yml`. Database settings are read from environment variables:

| Variable | Default |
| --- | --- |
| `JDBC_DATABASE_URL` | `jdbc:postgresql://localhost:5432/sastaPos` |
| `JDBC_DATABASE_USERNAME` | `postgres` |
| `JDBC_DATABASE_PASSWORD` | `postgres` (development only) |
| `CORS_ALLOWED_ORIGINS` | All origins in the `dev` profile; none otherwise |

See [.env.example](.env.example) for the complete variable list, units, defaults
and production requirements, including JWT lifetime, password-reset lifetime,
store currency/timezone and Docker migration settings. Spring Boot does not
automatically read `.env`; export variables to the process or use an IDE/Docker
environment file. Leave optional variables unset rather than assigning blanks.

Set `CORS_ALLOWED_ORIGINS` to a comma-separated list of exact origins to allow outside development, for example `https://pos.example.com,https://admin.example.com`. Requests from origins not in this list are rejected by the browser's CORS policy. The `dev` profile allows all origins by default; setting `CORS_ALLOWED_ORIGINS` overrides that default.

The Compose development database uses host port `5432`, so override `JDBC_DATABASE_URL` as shown above when starting Compose manually. Never commit real credentials. Production should provide all database values through its secret/environment configuration.

### Logging

Every HTTP request produces one access-log line from the `com.sastapos.sasta_pos.http` logger: method, path, status, duration, client IP and user ID (if authenticated). Responses with status 4xx or slower than `slow-request-threshold` are logged at `WARN`, and 5xx responses at `ERROR`. Each request gets a correlation ID. The backend reuses an incoming `X-Request-Id` header or generates one, returns it in the response, and adds it to every log line as `requestId` (MDC).

| Profile | Output |
| --- | --- |
| `dev` | Plain text, app at `DEBUG`, request/response headers and bodies (max 10000 chars) |
| `prod` | ECS JSON on the console (`LOG_FORMAT_CONSOLE`), summary line only, optional rolling file via `LOG_FILE`, SQL echo disabled |

Configure HTTP logging under `app.logging.http.*` in `application*.yml`: `enabled`, `include-headers`, `include-request-body`, `include-response-body`, `max-payload-length`, `slow-request-threshold`, `excluded-paths`, `masked-headers` and `masked-fields`. You can also set them with the environment variables listed in [.env.example](.env.example). Header and JSON-field masking applies even when bodies are enabled, so passwords, tokens and `Authorization` values are never written to the log.

## Production Build and Run

Build the executable JAR from the backend directory:

```bash
bash ./mvnw clean package
```

The artifact is `target/sastaPos-0.0.1-SNAPSHOT.jar`. Run it with a production profile and externally supplied configuration:

```bash
SPRING_PROFILES_ACTIVE=prod \
JDBC_DATABASE_URL='jdbc:postgresql://db-host:5432/sastaPos' \
JDBC_DATABASE_USERNAME='sasta_pos' \
JDBC_DATABASE_PASSWORD='change-me' \
java -Dserver.port="${PORT:-8080}" -Duser.timezone=UTC \
  -jar target/sastaPos-0.0.1-SNAPSHOT.jar
```

The committed `application-prod.yml` currently enables Hibernate schema updates and disables Flyway. For JAR deployments, override these settings to use controlled migrations and schema validation. The Docker image below supplies these safer defaults.

### Docker Image

From the repository root, build with Docker BuildKit (enabled by default in current Docker releases):

```bash
docker build --pull -t sasta-pos-backend:latest ./backend
```

The multi-stage build uses the checked-in Maven Wrapper and Java 25. Only the
Alpine JRE and extracted Spring Boot application layers reach the runtime image;
the JDK, Maven cache, source, and test tooling stay in the build stage. Stable
dependency layers are reused across application changes. The build context
excludes local configuration, environment files, and common private-key/keystore
files. Do not put secrets in other source/resource files.

Image builds skip test execution; run `bash ./mvnw test` with Java 25 and Docker
in CI before publishing. The image runs as UID/GID `10001`, executes Java directly
so it receives shutdown signals, and defaults to the `prod` profile and port
`8080`. JVM heap sizing uses up to 75% of the container memory limit, leaving
headroom for native memory; tune `JAVA_TOOL_OPTIONS` for your workload.

Provide an untracked environment file through your deployment's secret manager
with these values (never bake it into the image):

```dotenv
JDBC_DATABASE_URL=jdbc:postgresql://db-host:5432/sastaPos
JDBC_DATABASE_USERNAME=sasta_pos
JDBC_DATABASE_PASSWORD=<database-password>
JWT_SECRET=<random-secret-at-least-32-bytes>
CORS_ALLOWED_ORIGINS=https://pos.example.com
```

All JDBC values and a strong `JWT_SECRET` are required for production, even though
the application has development fallback values. `db-host` must be reachable
from the container; `localhost` refers to the container, not the Docker host.

```bash
docker run --detach --name sasta-pos-backend \
  --env-file /secure/path/backend.env \
  --publish 8080:8080 \
  --memory 512m --cpus 1 \
  --read-only --tmpfs /tmp:rw,noexec,nosuid,size=64m \
  --cap-drop ALL --security-opt no-new-privileges=true \
  --stop-timeout 30 \
  sasta-pos-backend:latest
```

The container enables Flyway at `classpath:db/migration`, disables automatic
baselining, validates the Hibernate schema, and disables SQL query logging.
These environment defaults intentionally override the less restrictive production
profile. New databases are migrated automatically. Existing databases without
Flyway history must be reviewed and explicitly baselined before deployment;
do not blindly enable baselining or schema updates. Deployment environment
variables can override the image defaults. Set `SERVER_PORT` and adjust the port
mapping if your platform requires a different listening port.

Terminate TLS at your ingress/reverse proxy and configure readiness/liveness
checks there. The backend does not currently expose an Actuator health endpoint,
so this image does not declare a misleading HTTP health check. The separate root
[production Compose stack](../docker-compose.prod.yml) integrates the backend,
persistent PostgreSQL and PowerSync using only the root [.env.example](../.env.example).
It checks the existing public `/` endpoint after startup and maps shared database
credentials without duplicate secrets. See the root
[deployment instructions](../README.md#production-compose) for TLS, backups,
initialization and credential rotation.
For releases, publish immutable application tags and pin the builder/runtime
base images to approved digests; rebuild regularly for JRE and OS security updates.

Alternatively, build an OCI image with Spring Boot Buildpacks:

```bash
bash ./mvnw spring-boot:build-image \
  -Dspring-boot.build-image.imageName=com.sastapos/sasta-pos
```

Run the image with `SPRING_PROFILES_ACTIVE`, the JDBC variables, and any platform-provided `PORT`. The checked-in `Procfile` still references a Gradle-style `build/libs` path; Maven deployments should use the `target/` JAR command above unless that Procfile is updated.

## API Domains

Current REST resources are grouped by feature under `/api`:

- `/api/businessSettings`
- `/api/products`
- `/api/sales`
- `/api/stockMovements`
- `/api/stores`
- `/api/users`

Changes should preserve the feature boundary and follow the adjacent resource, service, repository, DTO, validation, and exception-handling patterns.

## Further Reading

- [Maven](https://maven.apache.org/guides/index.html)
- [Spring Boot](https://docs.spring.io/spring-boot/docs/current/reference/htmlsingle/)
- [Spring Data JPA](https://docs.spring.io/spring-data/jpa/reference/jpa.html)
- [PostgreSQL](https://www.postgresql.org/docs/)
- [PowerSync](https://docs.powersync.com/)
