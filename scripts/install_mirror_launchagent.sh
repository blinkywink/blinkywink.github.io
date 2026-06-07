#!/usr/bin/env bash
# Install + start the mirror import as a macOS LaunchAgent (survives Cursor closing).
set -euo pipefail

ROOT="/Users/evan/Downloads/fortnite-wiki-site"
PLIST="$HOME/Library/LaunchAgents/com.blinkywink.fortnite-wiki-import.plist"
LABEL="com.blinkywink.fortnite-wiki-import"
DOMAIN="gui/$(id -u)"
PY="$(dirname "$(command -v python3)")"

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
    <string>$ROOT/scripts/fortnite_mirror_import.sh</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$ROOT</string>
  <key>StandardOutPath</key>
  <string>$ROOT/fortnite-import.log</string>
  <key>StandardErrorPath</key>
  <string>$ROOT/fortnite-import.log</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin:$PY</string>
    <key>PYTHONUNBUFFERED</key>
    <string>1</string>
  </dict>
  <key>ProcessType</key>
  <string>Background</string>
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>
  <key>ThrottleInterval</key>
  <integer>30</integer>
</dict>
</plist>
EOF

launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
rm -f "$ROOT/.fortnite-import.pid"
launchctl bootstrap "$DOMAIN" "$PLIST"
launchctl kickstart -k "$DOMAIN/$LABEL"

echo "LaunchAgent installed. Watch:"
echo "  tail -f \"$ROOT/fortnite-import.log\""
echo "Stop:"
echo "  launchctl bootout $DOMAIN/$LABEL"
