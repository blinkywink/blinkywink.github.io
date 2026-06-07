#!/usr/bin/env bash
# Prefer: bash scripts/start_import_in_terminal.sh  (opens Terminal — survives Cursor closing)
set -euo pipefail

ROOT="/Users/evan/Downloads/fortnite-wiki-site"
cd "$ROOT"
LOG="$ROOT/fortnite-import.log"
PIDFILE="$ROOT/.fortnite-import.pid"

if [[ -f "$PIDFILE" ]] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
  echo "Already running (PID $(cat "$PIDFILE"))"
  echo "Watch: tail -f \"$LOG\""
  exit 0
fi

echo "Tip: for a long import, use: bash scripts/start_import_in_terminal.sh"
echo "     (opens Terminal so the job is not killed when Cursor closes)"
echo ""
echo "Starting wiki import loop in background…"
echo "Watch: tail -f \"$LOG\""
echo ""

nohup bash "$ROOT/scripts/fortnite_wiki_import_loop.sh" >> "$LOG" 2>&1 &
echo $! > "$PIDFILE"
disown -h $! 2>/dev/null || true
sleep 2

if kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
  echo "Running (PID $(cat "$PIDFILE")). tail -f \"$LOG\""
else
  echo "Background start failed (process died). Run:"
  echo "  bash \"$ROOT/scripts/start_import_in_terminal.sh\""
  rm -f "$PIDFILE"
  exit 1
fi
