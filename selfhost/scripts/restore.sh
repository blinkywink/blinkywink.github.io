#!/usr/bin/env bash
# Restore a pg_dump -Fc file into local Docker Postgres. Run on the N100.
#
#   docker compose up -d postgres
#   ./scripts/restore.sh data/monkeycards.dump
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$HERE"
DUMP="${1:-data/monkeycards.dump}"

if [[ ! -f "$DUMP" ]]; then
  echo "Dump not found: $DUMP" >&2
  exit 1
fi

if [[ ! -f .env ]]; then
  echo "Create selfhost/.env from .env.example first" >&2
  exit 1
fi

# shellcheck disable=SC1091
set -a
source .env
set +a

echo "Waiting for postgres…"
docker compose up -d postgres
docker compose exec -T postgres pg_isready -U postgres -d monkeycards

echo "Resetting public schema…"
docker compose exec -T postgres psql -U postgres -d monkeycards -v ON_ERROR_STOP=1 <<'SQL'
drop schema if exists public cascade;
create schema public;
create extension if not exists pgcrypto;
SQL

echo "Aligning authenticator password with POSTGRES_PASSWORD…"
docker compose exec -T postgres psql -U postgres -d monkeycards -v ON_ERROR_STOP=1 \
  -c "alter role authenticator with password '$POSTGRES_PASSWORD';"

echo "Restoring $DUMP…"
set +e
docker compose exec -T postgres pg_restore --no-owner --no-acl -U postgres -d monkeycards < "$DUMP"
set -e
count="$(docker compose exec -T postgres psql -U postgres -d monkeycards -tAc \
  "select count(*) from information_schema.tables where table_schema='public'" | tr -d '[:space:]')"
if [[ "${count:-0}" -lt 1 ]]; then
  echo "Restore produced no tables." >&2
  exit 1
fi
echo "Restored $count public tables."

echo "Re-granting PostgREST roles…"
docker compose exec -T postgres psql -U postgres -d monkeycards -v ON_ERROR_STOP=1 <<'SQL'
grant usage on schema public to anon, authenticated, authenticator;
grant select on all tables in schema public to anon, authenticated;
grant execute on all functions in schema public to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;
SQL

echo "Applying harden.sql…"
docker compose exec -T postgres psql -U postgres -d monkeycards -v ON_ERROR_STOP=1 \
  -f - < "$HERE/postgres/harden.sql"

echo "Restore finished. Start the API with: docker compose up -d"
