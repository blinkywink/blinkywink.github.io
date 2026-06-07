#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG="$ROOT/fortnite-import.log"
PIDFILE="$ROOT/.fortnite-import.pid"

if [[ -f "$PIDFILE" ]]; then
  oldpid="$(cat "$PIDFILE" 2>/dev/null || true)"
  if [[ -n "$oldpid" ]] && kill -0 "$oldpid" 2>/dev/null; then
    echo "Already running (PID $oldpid). Watch: tail -f \"$LOG\""
    exit 0
  fi
fi

printf '[%s] Starting import (caffeinate keeps Mac awake)…\n' "$(date '+%Y-%m-%d %H:%M:%S')" >> "$LOG"

# disown so closing Cursor/terminal does not kill the job
nohup caffeinate -i bash "$ROOT/scripts/fortnite_full_setup.sh" >/dev/null 2>&1 &
disown

sleep 2
if [[ -f "$PIDFILE" ]] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
  echo "Import running (PID $(cat "$PIDFILE"))"
  echo "Watch: tail -f \"$LOG\""
else
  echo "Failed to start — check $LOG"
  tail -20 "$LOG"
  exit 1
fi
