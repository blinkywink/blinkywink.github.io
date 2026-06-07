#!/usr/bin/env bash
# Inner loop: serial batches of 25 pages — each batch is a fresh Python process.
set -uo pipefail

ROOT="/Users/evan/Downloads/fortnite-wiki-site"
cd "$ROOT"
LOG="$ROOT/fortnite-import.log"
PIDFILE="$ROOT/.fortnite-import.pid"

echo $$ > "$PIDFILE"
trap 'rm -f "$PIDFILE"' EXIT

caffeinate -i -w $$ &
CAFFPID=$!
trap 'kill "$CAFFPID" 2>/dev/null || true; rm -f "$PIDFILE"' EXIT

count_left() {
  python3 -c "
import json
from pathlib import Path
import sys
sys.path.insert(0, 'scripts')
from import_missing_wiki_pages_from_manifest import page_path_for_row
rows = json.load(open('assets/data/wiki_pages.json')).get('pages') or []
print(sum(1 for r in rows if (p := page_path_for_row(Path('.'), r)) and not p.is_file()))
" 2>/dev/null || echo "?"
}

on_disk() {
  find pages -name index.html 2>/dev/null | wc -l | tr -d ' '
}

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Wiki import loop started (PID $$)"

while true; do
  left="$(count_left)"
  have="$(on_disk)"
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $left missing | $have on disk — next batch of 25"
  [[ "$left" == "0" || "$left" -eq 0 ]] 2>/dev/null && break

  python3 -u scripts/import_missing_wiki_pages_from_manifest.py \
    --delay 0.04 \
    --limit 25 \
    >> "$LOG" 2>&1 || echo "[$(date '+%Y-%m-%d %H:%M:%S')] batch error — retrying…" >> "$LOG"

  sleep 1
done

python3 scripts/build_site_routes.py --no-enrich-search >> "$LOG" 2>&1
python3 scripts/rewrite_fandom_character_links.py --apply >> "$LOG" 2>&1
echo "[$(date '+%Y-%m-%d %H:%M:%S')] All wiki pages imported." | tee -a "$LOG"
