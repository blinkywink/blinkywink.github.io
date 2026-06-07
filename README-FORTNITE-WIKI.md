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
