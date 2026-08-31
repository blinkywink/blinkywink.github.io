#!/usr/bin/env bash
# Dump live Supabase public schema. Run from the laptop (no N100 needed).
#
#   # uses SUPABASE_DB_URL from repo .env.local
#   ./selfhost/scripts/dump-from-supabase.sh
#
# Direct DB URL (port 5432), not the pooler (6543).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PATH="/opt/homebrew/opt/libpq/bin:/usr/local/opt/libpq/bin:$PATH"
export PATH
OUT_DIR="$ROOT/selfhost/data"
mkdir -p "$OUT_DIR"

if [[ -z "${SUPABASE_DB_URL:-}" && -f "$ROOT/.env.local" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env.local"
  set +a
fi

if [[ -z "${SUPABASE_DB_URL:-}" ]]; then
  echo "Set SUPABASE_DB_URL (direct Postgres URI) or put it in .env.local" >&2
  exit 1
fi

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$OUT_DIR/monkeycards-$STAMP.dump"
echo "Dumping public schema → $OUT"

dump() {
  if command -v pg_dump >/dev/null 2>&1; then
    pg_dump --no-owner --no-acl --schema=public -Fc -f "$OUT" "$SUPABASE_DB_URL"
    return
  fi
  if command -v docker >/dev/null 2>&1; then
    docker run --rm \
      -v "$OUT_DIR:/out" \
      postgres:16-alpine \
      pg_dump --no-owner --no-acl --schema=public -Fc \
      -f "/out/$(basename "$OUT")" \
      "$SUPABASE_DB_URL"
    return
  fi
  echo "Need pg_dump or Docker to dump the database." >&2
  exit 1
}

dump
ln -sfn "$(basename "$OUT")" "$OUT_DIR/monkeycards.dump"
echo "Wrote $OUT"
echo "Symlink $OUT_DIR/monkeycards.dump"
ls -lh "$OUT"
