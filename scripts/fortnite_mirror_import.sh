#!/usr/bin/env bash
# Mirror missing outfits + wiki pages locally (tree already built). Runs for many hours.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
LOG="$ROOT/fortnite-import.log"
PIDFILE="$ROOT/.fortnite-import.pid"

export PYTHONUNBUFFERED=1

if [[ -f "$PIDFILE" ]]; then
  oldpid="$(cat "$PIDFILE" 2>/dev/null || true)"
  if [[ -n "$oldpid" ]] && [[ "$oldpid" != "$$" ]] && kill -0 "$oldpid" 2>/dev/null; then
    echo "Import already running (PID $oldpid). tail -f \"$LOG\"" >&2
    exit 0
  fi
fi

echo $$ > "$PIDFILE"
trap 'rm -f "$PIDFILE"' EXIT

log() {
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

caffeinate -i -w $$ >/dev/null 2>&1 &

log "=== Fortnite mirror import started (PID $$) ==="

  log "Step 1/5: Refresh outfit list from Fandom…"
  if [[ -f scripts/cat_all_characters_with_thumbs.json ]] && [[ $(python3 -c "import json; print(len(json.load(open('scripts/cat_all_characters_with_thumbs.json'))))") -ge 3000 ]]; then
    log "Outfit list already fetched (3000+) — skipping"
  else
    python3 scripts/fetch_fandom_characters.py
  fi
  python3 scripts/build_fortnite_characters_manifest.py
  python3 scripts/build_fortnite_character_groups.py

  log "Step 2/5: Importing all outfits not yet on disk (~3,000+, several hours)…"
  python3 -u scripts/import_all_characters.py --delay 0.06
  python3 scripts/build_fortnite_characters_manifest.py
  python3 scripts/build_fortnite_character_groups.py

  log "Step 3/5: Importing all wiki pages from manifest (~33,000, 1–3+ days)…"
  python3 -u scripts/import_missing_wiki_pages_from_manifest.py --delay 0.05

  log "Step 4/5: Rebuild routes, search, browse indexes, sitemap…"
  python3 scripts/build_fortnite_characters_manifest.py
  python3 scripts/build_site_routes.py

  log "Step 5/5: Rewrite internal links + rebrand…"
  python3 scripts/rewrite_fandom_character_links.py --apply
  python3 scripts/rebrand_fortnite_site.py

  log "=== Fortnite mirror import finished ==="
