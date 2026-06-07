#!/usr/bin/env bash
# Copy finished local build back to iCloud GitHub Pages folder.
set -euo pipefail

LOCAL="/Users/evan/Downloads/fortnite-wiki-site"
ICLOUD="/Users/evan/Library/Mobile Documents/com~apple~CloudDocs/blinkywink.github.io"

rsync -a --delete \
  --exclude '.fortnite-import.pid' \
  --exclude 'fortnite-import.log' \
  --exclude '.git' \
  --exclude 'scripts/cat_all_characters_with_thumbs.json' \
  "$LOCAL"/ "$ICLOUD"/

echo "Synced $LOCAL → $ICLOUD"
echo ""
echo "Important: git add + push from iCloud folder:"
echo "  cd \"$ICLOUD\" && git add -A && git status"
