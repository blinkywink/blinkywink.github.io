#!/usr/bin/env bash
# Run the full import from LOCAL disk (reliable). iCloud kills background jobs.
set -euo pipefail

LOCAL="/Users/evan/Downloads/fortnite-wiki-site"
LOG="$LOCAL/fortnite-import.log"
PIDFILE="$LOCAL/.fortnite-import.pid"

if [[ ! -d "$LOCAL/scripts" ]]; then
  echo "Missing $LOCAL — run: rsync -a \"\$ICLOUD/\" \"$LOCAL/\"" >&2
  exit 1
fi

if [[ -f "$PIDFILE" ]]; then
  oldpid="$(cat "$PIDFILE" 2>/dev/null || true)"
  if [[ -n "$oldpid" ]] && kill -0 "$oldpid" 2>/dev/null; then
    echo "Already running (PID $oldpid)"
    echo "Watch: tail -f \"$LOG\""
    exit 0
  fi
fi

printf '\n[%s] Starting import on local disk…\n' "$(date '+%Y-%m-%d %H:%M:%S')" >> "$LOG"

cd "$LOCAL"
bash "$LOCAL/scripts/start_import_detached.sh"
