# syntax=docker/dockerfile:1

FROM eclipse-temurin:25-jdk-alpine AS build

WORKDIR /build

COPY .mvn/ .mvn/
COPY mvnw pom.xml ./
RUN sed -i 's/\r$//' mvnw && chmod +x mvnw

RUN --mount=type=cache,target=/root/.m2 \
    ./mvnw --batch-mode --no-transfer-progress dependency:go-offline

COPY src/ src/

RUN --mount=type=cache,target=/root/.m2 \
    ./mvnw --batch-mode --no-transfer-progress -DskipTests package && \
    mv target/sastaPos-*.jar application.jar && \
    java -Djarmode=tools -jar application.jar \
        extract --layers --destination /layers

FROM eclipse-temurin:25-jre-alpine AS runtime

RUN addgroup -S -g 10001 app && \
    adduser -S -D -H -u 10001 -G app app

WORKDIR /app

ENV SPRING_PROFILES_ACTIVE=prod \
    SERVER_PORT=8080 \
    SPRING_JPA_HIBERNATE_DDL_AUTO=validate \
    SPRING_JPA_SHOW_SQL=false \
    SPRING_FLYWAY_ENABLED=true \
    SPRING_FLYWAY_LOCATIONS=classpath:db/migration \
    SPRING_FLYWAY_BASELINE_ON_MIGRATE=false \
    JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=75.0 -XX:+ExitOnOutOfMemoryError -Duser.timezone=UTC"

COPY --from=build /layers/dependencies/ ./
COPY --from=build /layers/spring-boot-loader/ ./
COPY --from=build /layers/snapshot-dependencies/ ./
COPY --from=build /layers/application/ ./

USER 10001:10001

EXPOSE 8080
STOPSIGNAL SIGTERM

ENTRYPOINT ["java", "-jar", "application.jar"]
