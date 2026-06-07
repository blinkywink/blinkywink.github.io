#!/usr/bin/env bash
# Start import via macOS launchd — survives Cursor/terminal closing (unlike nohup from agent shell).
set -euo pipefail

LOCAL="/Users/evan/Downloads/fortnite-wiki-site"
LOG="$LOCAL/fortnite-import.log"
PLIST="$HOME/Library/LaunchAgents/com.blinkywink.fortnite-wiki-import.plist"
LABEL="com.blinkywink.fortnite-wiki-import"
USER_ID="$(id -u)"
DOMAIN="gui/$USER_ID"
PYTHON_BIN="$(command -v python3)"

if [[ ! -d "$LOCAL/scripts" ]]; then
  echo "Missing $LOCAL" >&2
  exit 1
fi

if [[ -f "$LOCAL/.fortnite-import.pid" ]]; then
  oldpid="$(cat "$LOCAL/.fortnite-import.pid" 2>/dev/null || true)"
  if [[ -n "$oldpid" ]] && kill -0 "$oldpid" 2>/dev/null; then
    echo "Import already running (PID $oldpid)"
    echo "Watch: tail -f \"$LOG\""
    exit 0
  fi
  rm -f "$LOCAL/.fortnite-import.pid"
fi

mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$LOCAL/scripts/fortnite_mirror_import.sh</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$LOCAL</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin:$(dirname "$PYTHON_BIN")</string>
    <key>PYTHONUNBUFFERED</key>
    <string>1</string>
  </dict>
  <key>ProcessType</key>
  <string>Background</string>
</dict>
</plist>
EOF

launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
launchctl bootstrap "$DOMAIN" "$PLIST"
launchctl kickstart -k "$DOMAIN/$LABEL"

sleep 4
if [[ -f "$LOCAL/.fortnite-import.pid" ]] && kill -0 "$(cat "$LOCAL/.fortnite-import.pid")" 2>/dev/null; then
  echo "Import running via launchd (PID $(cat "$LOCAL/.fortnite-import.pid"))"
  echo "Watch: tail -f \"$LOG\""
  echo "Stop:  launchctl bootout $DOMAIN/$LABEL"
else
  echo "Failed to start — last log lines:"
  tail -15 "$LOG"
  exit 1
fi
