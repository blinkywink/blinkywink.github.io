#!/usr/bin/env bash
# Fast parallel wiki import — run from Terminal.app
ROOT="/Users/evan/Downloads/fortnite-wiki-site"
cd "$ROOT"
LOG="$ROOT/fortnite-import.log"
PIDFILE="$ROOT/.fortnite-import.pid"

if [[ -f "$PIDFILE" ]] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
  echo "Already running (PID $(cat "$PIDFILE"))"
  echo "Watch: tail -f \"$LOG\""
  exit 0
fi

echo "Starting parallel wiki import (4 workers)…"
echo "Watch: tail -f \"$LOG\""
echo ""

(
  echo $$ > "$PIDFILE"
  trap 'rm -f "$PIDFILE"' EXIT
  caffeinate -i -w $$ &
  while true; do
    left=$(python3 -c "
import json
from pathlib import Path
def pp(r,row):
 h=(row.get('href') or '').strip()
 if h.startswith('/pages/'): return Path('.').joinpath('pages',*h[len('/pages/'):].strip('/').split('/'),'index.html')
 s=(row.get('slug') or '').strip()
 return Path('pages')/s/'index.html' if s else None
rows=json.load(open('assets/data/wiki_pages.json')).get('pages') or []
print(sum(1 for r in rows if (p:=pp('.',r)) and not p.is_file()))
")
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $left pages left"
    [[ "$left" -eq 0 ]] && break
    python3 -u scripts/import_missing_wiki_pages_parallel.py --workers 4 --delay 0.02 || true
    sleep 5
  done
  python3 scripts/build_site_routes.py --no-enrich-search
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] All wiki pages imported."
) >> "$LOG" 2>&1 &

disown -h $! 2>/dev/null || true
sleep 2
echo "Running in background. tail -f \"$LOG\""
