#!/bin/bash
# Runs once, the first time the dev Postgres container initialises an empty data directory.
# Creates the replication role + `powersync` publication that the PowerSync service needs.
set -euo pipefail

: "${POWERSYNC_DB_PASSWORD:?POWERSYNC_DB_PASSWORD must be set}"

psql -v ON_ERROR_STOP=1 -v pw="$POWERSYNC_DB_PASSWORD" --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
CREATE ROLE powersync_role WITH REPLICATION BYPASSRLS LOGIN PASSWORD :'pw';

-- PowerSync stores its bucket data in a `powersync` schema of this same database.
GRANT CREATE ON DATABASE :"DBNAME" TO powersync_role;
GRANT USAGE ON SCHEMA public TO powersync_role;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO powersync_role;
-- Tables are created later by the backend (Hibernate/Flyway) as the owner role.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO powersync_role;

-- Must be named "powersync". ALL TABLES also covers tables created after this runs.
CREATE PUBLICATION powersync FOR ALL TABLES;
SQL
