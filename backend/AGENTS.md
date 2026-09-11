# Project instructions

## Overview

- `Sasta Pos` is a Java 25 / Spring Boot 4.1 application.
- The build uses Maven; always use the checked-in `./mvnw` wrapper.
- Persistence uses Spring Data JPA with Hibernate and PostgreSQL.
- OpenAPI documentation is generated automatically for the REST API.
- Docker Compose supplies local development services and is invoked when the application starts.

## Project structure

- Production sources live in `src/main/java` and tests in `src/test/java`.
- Code is organized by domain/feature.
- Application configuration lives in `src/main/resources/application.yml`.

## Development commands

Run from the repository root:

```shell
./mvnw spring-boot:run
./mvnw test
./mvnw package
```

- Docker must be available for the Testcontainers-based test suite.

## Working conventions

- Use constructor injection and follow adjacent Java code and Lombok patterns.
- Prefer integration tests; use unit tests for focused coverage.
- Run the narrowest meaningful verification while iterating.
- Keep changes task-scoped and preserve unrelated existing changes. When a required file is already modified, integrate with those changes.
- Never commit production credentials. Keep secrets in environment variables or local, unversioned overrides.
- Add concise, verifiable repository-wide guidance discovered during a task to `AGENTS.md`; omit task details and duplicate documentation.
