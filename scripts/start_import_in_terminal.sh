#!/usr/bin/env bash
# Opens a new Terminal window and runs the wiki import there (survives Cursor closing).
ROOT="/Users/evan/Downloads/fortnite-wiki-site"
LOG="$ROOT/fortnite-import.log"

if [[ -f "$ROOT/.fortnite-import.pid" ]] && kill -0 "$(cat "$ROOT/.fortnite-import.pid")" 2>/dev/null; then
  echo "Import already running (PID $(cat "$ROOT/.fortnite-import.pid"))"
  echo "Watch: tail -f \"$LOG\""
  open -a Terminal "$ROOT/fortnite-import.log" 2>/dev/null || true
  exit 0
fi

osascript <<EOF
tell application "Terminal"
  activate
  do script "cd \"$ROOT\" && exec bash scripts/fortnite_wiki_import_loop.sh 2>&1 | tee -a \"$LOG\""
end tell
EOF

echo "Opened Terminal — import running there."
echo "Watch: tail -f \"$LOG\""
