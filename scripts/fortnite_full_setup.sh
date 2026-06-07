#!/usr/bin/env bash
# Full Fortnite Fandom import + rebuild. Long-running — check fortnite-import.log for progress.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
LOG="$ROOT/fortnite-import.log"
PIDFILE="$ROOT/.fortnite-import.pid"

export PYTHONUNBUFFERED=1

if [[ -f "$PIDFILE" ]]; then
  oldpid="$(cat "$PIDFILE" 2>/dev/null || true)"
  if [[ -n "$oldpid" ]] && kill -0 "$oldpid" 2>/dev/null; then
    echo "Import already running (PID $oldpid). tail -f \"$LOG\"" >&2
    exit 0
  fi
fi

echo $$ > "$PIDFILE"
trap 'rm -f "$PIDFILE"' EXIT

log() {
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

  log "=== Fortnite full wiki sync started ==="

  # Keep Mac awake for the full multi-hour run.
  caffeinate -i -w $$ >/dev/null 2>&1 &

{
  python3 scripts/rebrand_fortnite_site.py

  if [[ -f assets/data/fandom_content_category_tree.json ]] && [[ ! -f .force-refetch-tree ]]; then
    log "Step 1/6: Category tree JSON exists — skipping fetch (touch .force-refetch-tree to redo)"
  else
    log "Step 1/6: Fetching category tree with all page titles (1–3+ hours)…"
    python3 -u scripts/fetch_fandom_content_category_tree.py \
      --sleep 0.05 \
      --resume \
      --include-direct-pages \
      --max-depth 8 \
      --progress-every 50 \
      --checkpoint-every 10
  fi

  log "Step 2/6: Building manifests (wiki pages + outfits)…"
  python3 scripts/merge_tree_titles_into_wiki_pages_manifest.py
  python3 scripts/fetch_fandom_characters.py
  python3 scripts/build_characters_page.py

  log "Step 3/6: Importing all wiki pages missing on disk…"
  python3 scripts/import_missing_wiki_pages_from_manifest.py --delay 0.08

  log "Step 4/6: Importing all outfits into /characters/…"
  python3 scripts/import_all_characters.py --force --delay 0.2

  log "Step 5/6: Rebuilding routes, search, browse indexes, sitemap…"
  python3 scripts/build_site_routes.py

  log "Step 6/6: Rewriting internal Fandom links…"
  python3 scripts/rewrite_fandom_character_links.py --apply

  python3 scripts/rebrand_fortnite_site.py

  log "=== Fortnite full wiki sync finished ==="
} >> "$LOG" 2>&1
