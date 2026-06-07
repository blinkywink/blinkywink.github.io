#!/usr/bin/env bash
# Resume wiki page import — auto-restarts if the process dies (Mac sleep, crashes, etc.).
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
LOG="$ROOT/fortnite-import.log"
PIDFILE="$ROOT/.fortnite-import.pid"

export PYTHONUNBUFFERED=1

if [[ -f "$PIDFILE" ]]; then
  oldpid="$(cat "$PIDFILE" 2>/dev/null || true)"
  if [[ -n "$oldpid" ]] && [[ "$oldpid" != "$$" ]] && kill -0 "$oldpid" 2>/dev/null; then
    echo "Already running (PID $oldpid). tail -f \"$LOG\"" >&2
    exit 0
  fi
fi

echo $$ > "$PIDFILE"
trap 'rm -f "$PIDFILE"' EXIT

caffeinate -i -w $$ >/dev/null 2>&1 &

log() { printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >> "$LOG"; }

missing_count() {
  python3 - <<'PY'
import json
from pathlib import Path

def page_path(root, row):
    href = (row.get("href") or "").strip()
    if href.startswith("/pages/"):
        rel = href[len("/pages/"):].strip("/").split("/")
        return root.joinpath("pages", *rel, "index.html")
    slug = (row.get("slug") or "").strip()
    return root / "pages" / slug / "index.html" if slug else None

root = Path(".")
rows = json.load(open("assets/data/wiki_pages.json")).get("pages") or []
n = sum(1 for r in rows if (p := page_path(root, r)) and not p.is_file())
print(n)
PY
}

log "=== Wiki page import loop started (PID $$) ==="

round=0
while true; do
  round=$((round + 1))
  left="$(missing_count)"
  log "Round $round — $left pages still missing on disk"
  if [[ "$left" -eq 0 ]]; then
    log "All wiki pages mirrored locally."
    break
  fi

  set +e
  python3 -u scripts/import_missing_wiki_pages_from_manifest.py --delay 0.05 >> "$LOG" 2>&1
  py_exit=$?
  set -e

  left_after="$(missing_count)"
  log "Import batch exited (code $py_exit). Remaining: $left_after"

  if [[ "$left_after" -eq 0 ]]; then
    break
  fi
  if [[ "$left_after" -ge "$left" ]]; then
    log "No progress this round — waiting 30s before retry…"
    sleep 30
  else
    log "Progress made — continuing in 5s…"
    sleep 5
  fi
done

log "Rebuilding routes…"
python3 scripts/build_fortnite_characters_manifest.py >> "$LOG" 2>&1
python3 scripts/build_site_routes.py --no-enrich-search >> "$LOG" 2>&1
python3 scripts/rewrite_fandom_character_links.py --apply >> "$LOG" 2>&1
log "=== Wiki page import finished ==="
