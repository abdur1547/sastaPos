#!/usr/bin/env bash
# Seeds the dev Postgres. Usage: ./seed.sh [reset]
# Env: PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE (defaults match docker-compose.yml).
set -euo pipefail
cd "$(dirname "$0")"
export PGHOST="${PGHOST:-localhost}" PGPORT="${PGPORT:-5432}" PGUSER="${PGUSER:-postgres}" \
       PGPASSWORD="${PGPASSWORD:-P4ssword!}" PGDATABASE="${PGDATABASE:-sastaPos}"

if [[ "${1:-}" == "reset" ]]; then
  psql -v ON_ERROR_STOP=1 -f 99_reset_seed_data.sql
fi
psql -v ON_ERROR_STOP=1 -f 01_tax_categories.sql
psql -v ON_ERROR_STOP=1 -f 02_products.sql
