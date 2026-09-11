# Backend Agent Instructions

## Context

- This is a Java 25 / Spring Boot 4.1.1 monolith for Sasta POS.
- Organize code by feature under `src/main/java/com/sastapos/sasta_pos/`; keep each feature's resources, services, repositories, DTOs, entities, and rules together.
- PostgreSQL is the central database. Desktop clients are offline-first with local SQLite and are intended to synchronize through PowerSync when online. The current repository does not yet implement the PowerSync connector or sync endpoints.
- Use Maven's standard `src/main/java` and `src/main/resources` source roots.

## Commands

Run from `backend/` and use the checked-in Maven Wrapper through Bash because its executable bit is not currently set:

```shell
bash ./mvnw spring-boot:run
bash ./mvnw test
bash ./mvnw clean package
```

Docker Compose provides the local PostgreSQL service. Its host port is `5433`; configure `JDBC_DATABASE_URL`, `JDBC_DATABASE_USERNAME`, and `JDBC_DATABASE_PASSWORD` accordingly. Docker is required for container-backed tests.

## Conventions

- Follow adjacent constructor-injection, Lombok, JPA, validation, error-handling, and OpenAPI patterns.
- Preserve feature boundaries and existing REST paths under `/api`.
- Prefer integration tests for feature behavior; use unit tests for focused logic.
- Never commit credentials. Use environment variables or ignored local profile files.
- Make narrow changes, preserve unrelated work, and run the narrowest meaningful verification.
