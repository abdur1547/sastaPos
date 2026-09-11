# Sasta POS Backend

The backend is a Spring Boot monolith for Sasta POS, an offline-first desktop point-of-sale application for the Pakistani market. It provides the central API and PostgreSQL persistence used by desktop clients. Desktop clients are intended to keep a local SQLite database and use PowerSync to synchronize data when connectivity is available.

PowerSync and the desktop SQLite workflow are part of the system architecture, but the current repository does not yet contain the PowerSync connector, sync endpoints, or a committed local schema. Do not treat the synchronization workflow as implemented until those pieces are added.

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

	The Compose file creates database `sastaPos` and maps PostgreSQL to host port `5433`.

2. Run the application with the local database settings:

	```bash
	JDBC_DATABASE_URL=jdbc:postgresql://localhost:5433/sastaPos \
	JDBC_DATABASE_USERNAME=postgres \
	JDBC_DATABASE_PASSWORD='P4ssword!' \
	bash ./mvnw spring-boot:run
	```

	The application listens on `http://localhost:8080`. The same database values can be supplied through an untracked `src/main/resources/application-local.yml` or the IDE run configuration. `application-local.yml` is ignored by Git.

3. Check the available API documentation:

	- Swagger UI: `http://localhost:8080/swagger-ui/index.html`
	- OpenAPI JSON: `http://localhost:8080/v3/api-docs`

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
| `JDBC_DATABASE_PASSWORD` | `<<YOUR_PASSWORD>>` |

The Compose development database uses host port `5433`, so override `JDBC_DATABASE_URL` as shown above when starting Compose manually. Never commit real credentials. Production should provide all database values through its secret/environment configuration.

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

The repository does not currently commit a `prod` profile file. Keep production overrides in the deployment environment, and set a production-safe JPA schema/migration strategy before deploying. The current committed configuration uses `spring.jpa.hibernate.ddl-auto: update`; review this for production and prefer controlled migrations once the Flyway migration set is established.

To build an OCI image with Spring Boot Buildpacks:

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
