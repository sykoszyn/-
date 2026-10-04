#!/usr/bin/env bash
# Corre las migraciones de supabase/ y sus pruebas en un Postgres local.
# Uso: PGHOST=... PGPORT=... PGUSER=postgres scripts/test-db.sh
set -euo pipefail
cd "$(dirname "$0")/.."
DB="parejo_test_$$"
psql -q -v ON_ERROR_STOP=1 -c "create database $DB" >/dev/null
trap 'psql -q -c "drop database if exists $DB" >/dev/null' EXIT
run() {
  local out
  if ! out=$(psql -q -v ON_ERROR_STOP=1 -c 'set client_min_messages = warning' -d "$DB" -f "$1" 2>&1); then
    echo "$out"
    exit 1
  fi
  if [ -n "$out" ]; then echo "$out" | grep -v -e 'wal_level' -e 'HINT:' -e 'CONTEXT:' -e 'inline_code_block' || true; fi
}
run supabase/tests/supabase_stub.sql
for f in supabase/migrations/*.sql; do echo "→ $f"; run "$f"; done
echo "→ re-ejecutando la última migración (debe ser idempotente)"; run "$(ls supabase/migrations/*.sql | tail -1)"
echo "→ pruebas"
if ! out=$(psql -q -v ON_ERROR_STOP=1 -d "$DB" -f supabase/tests/sync_test.sql 2>&1); then
  echo "$out" | grep -e NOTICE -e ERROR
  exit 1
fi
echo "$out" | sed -n 's/^psql:[^ ]* NOTICE:  /  /p'
echo "✓ todas las pruebas de base de datos pasaron"
