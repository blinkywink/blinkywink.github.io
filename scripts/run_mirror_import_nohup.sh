#!/usr/bin/env bash
# Long-running mirror — run from Terminal: bash scripts/run_mirror_import_nohup.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
LOG="$ROOT/fortnite-import.log"
PIDFILE="$ROOT/.fortnite-import.pid"

if [[ -f "$PIDFILE" ]]; then
  oldpid="$(cat "$PIDFILE" 2>/dev/null || true)"
  if [[ -n "$oldpid" ]] && kill -0 "$oldpid" 2>/dev/null; then
    echo "Already running (PID $oldpid). tail -f \"$LOG\""
    exit 0
  fi
  rm -f "$PIDFILE"
fi

nohup bash "$ROOT/scripts/fortnite_mirror_import.sh" >> "$LOG" 2>&1 &
disown -h $! 2>/dev/null || true

sleep 3
if [[ -f "$PIDFILE" ]] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
  echo "Mirror import running (PID $(cat "$PIDFILE"))"
  echo "Watch: tail -f \"$LOG\""
else
  echo "Failed — check $LOG"
  tail -15 "$LOG"
  exit 1
fi
