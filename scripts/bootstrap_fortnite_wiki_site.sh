#!/usr/bin/env bash
# Wipe blinkywink.github.io (iCloud) and seed it from the Ninjago site tooling as a Fortnite wiki template.
set -euo pipefail

SOURCE_DIR="/Users/evan/Downloads/ninjago site"
DEST_DIR="/Users/evan/Library/Mobile Documents/com~apple~CloudDocs/blinkywink.github.io"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if [[ ! -d "$SOURCE_DIR" ]]; then
  echo "Source not found: $SOURCE_DIR" >&2
  exit 1
fi
if [[ ! -d "$DEST_DIR/.git" ]]; then
  echo "Expected git repo at: $DEST_DIR" >&2
  exit 1
fi

echo "=== Bootstrap Fortnite wiki site ==="
echo "  FROM: $SOURCE_DIR"
echo "  TO:   $DEST_DIR"
echo

echo "Wiping destination (keeping .git and CNAME)..."
find "$DEST_DIR" -mindepth 1 -maxdepth 1 \
  ! -name '.git' \
  ! -name 'CNAME' \
  -exec rm -rf {} +

echo "Copying site template (no mirrored pages or character articles)..."
rsync -a \
  --exclude '.git/' \
  --exclude 'pages/' \
  --exclude 'characters/*/' \
  --exclude 'assets/data/' \
  --exclude 'assets/characters/' \
  --exclude 'sitemap*.xml' \
  --exclude 'robots.txt' \
  --exclude 'wiki-sync.log' \
  --exclude 'wiki-update.log' \
  --exclude '__pycache__/' \
  --exclude '.DS_Store' \
  "$SOURCE_DIR"/ "$DEST_DIR"/

mkdir -p "$DEST_DIR/pages" "$DEST_DIR/characters" "$DEST_DIR/assets/data"

echo "Applying Fortnite branding and empty data manifests..."
python3 "$SCRIPT_DIR/apply_wiki_template.py" --root "$DEST_DIR"

cat > "$DEST_DIR/README-FORTNITE-WIKI.md" <<'EOF'
# Fortnite Wiki Project (template)

This repo was bootstrapped from the Ninjago wiki mirror tooling for **fortnite.fandom.com**.

## What's included

- Site shell (homepage, browse hubs, all-pages tree UI, scripts, trivia scaffolding)
- Empty data manifests — **no mirrored wiki HTML yet**
- Scripts configured for `fortnite.fandom.com` and `Category:Fortnite`

## First steps

```bash
# 1) Fetch the Fandom category tree (All Pages browser)
python3 -u scripts/fetch_fandom_content_category_tree.py --no-sleep --max-depth 8 --include-direct-pages --progress-every 50

# 2) Merge discovered titles into the import manifest
python3 scripts/merge_tree_titles_into_wiki_pages_manifest.py

# 3) Import a batch of pages (start small)
python3 scripts/import_wiki_pages_bulk.py --from-tree --limit 50 --delay 0.12

# 4) Rebuild routes, search, indexes, sitemap
python3 scripts/build_site_routes.py

# Or run the full pipeline (long):
# bash scripts/full_wiki_sync.sh
```

## Notes

- Character imports use `scripts/import_wiki_character.py` + `assets/data/characters.json`
- Config lives in `assets/data/wiki_config.json`
- Live site: https://blinkywink.co (GitHub Pages + CNAME)
EOF

echo
echo "Fetching initial Category:Fortnite tree (subcategories only, depth 6)..."
cd "$DEST_DIR"
python3 -u scripts/fetch_fandom_content_category_tree.py \
  --no-sleep \
  --max-depth 6 \
  --progress-every 50

python3 scripts/build_site_routes.py --no-enrich-search

python3 scripts/build_sitemap.py

echo
echo "=== Done ==="
echo "Fortnite wiki template is ready in:"
echo "  $DEST_DIR"
echo
echo "Next: cd to that folder, review changes, commit, and push to GitHub."
