#!/usr/bin/env python3
"""Import a small sample and rebuild routes so the site is testable before the full sync."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from pathlib import Path
from urllib.parse import quote

SCRIPT_DIR = Path(__file__).resolve().parent
ROOT = SCRIPT_DIR.parent
CAT_JSON = SCRIPT_DIR / "cat_all_characters_with_thumbs.json"
CHARACTERS_JSON = ROOT / "assets" / "data" / "characters.json"
WIKI_PAGES_JSON = ROOT / "assets" / "data" / "wiki_pages.json"

sys.path.insert(0, str(SCRIPT_DIR))
from import_wiki_page import import_wiki_page  # noqa: E402

OUTFIT_PICKS = [
    "Renegade Raider",
    "Peely",
    "Drift",
    "Omega",
    "Raven",
    "Skull Trooper",
    "Fishstick",
    "Midas",
    "Jules",
    "Kit",
    "Spider-Man",
    "Goku",
    "Iron Man",
    "Deadpool",
    "Travis Scott",
    "Marshmello",
    "Ninja",
    "Lynx",
    "Calamity",
    "Red Knight",
    "Black Knight",
    "Galaxy",
    "IKONIK",
    "Aura",
    "Default",
]

WIKI_PICKS = [
    "Fortnite",
    "Battle Royale",
    "Save the World",
    "Creative",
    "Item Shop",
    "Zero Build",
    "Fortnite Chapter 1",
    "Fortnite Chapter 2",
    "Fortnite Chapter 3",
    "Fortnite Chapter 4",
    "Fortnite Chapter 5",
    "Victory Royale",
    "V-Bucks",
    "Battle Pass",
    "Outfits",
    "Pickaxes",
    "Gliders",
    "Emotes",
    "Back Bling",
    "Wraps",
    "Loading Screens",
    "Music",
    "LTMs",
    "Arena",
    "Competitive",
    "Fortnite World Cup",
    "The End (event)",
    "Galaxy Cup",
    "Fortnite X Marvel",
    "Fortnite X Star Wars",
    "LEGO Fortnite",
    "Fortnite Festival",
    "OG Fortnite",
    "Reload",
    "Ballistic",
    "Fortnite: Save the World",
    "STW Heroes",
    "Weapons (Battle Royale)",
    "Consumables",
    "Healing Items",
]


def wiki_url(title: str) -> str:
    return "https://fortnite.fandom.com/wiki/" + quote(title.replace(" ", "_"), safe="")


def search_keywords(title: str) -> str:
    return title.lower().replace("'", "")


def pick_outfits(limit: int) -> list[dict]:
    rows = json.loads(CAT_JSON.read_text(encoding="utf-8"))
    by_title = {r["title"]: r for r in rows}
    picked: list[dict] = []
    seen: set[str] = set()
    for title in OUTFIT_PICKS:
        row = by_title.get(title)
        if not row:
            continue
        slug = row["slug"]
        if slug in seen:
            continue
        seen.add(slug)
        picked.append(row)
        if len(picked) >= limit:
            return picked
    for row in rows:
        slug = row["slug"]
        if slug in seen:
            continue
        seen.add(slug)
        picked.append(row)
        if len(picked) >= limit:
            break
    return picked


def write_characters_manifest(outfits: list[dict]) -> None:
    manifest = []
    for row in outfits:
        slug = row["slug"]
        title = row["title"]
        manifest.append(
            {
                "slug": slug,
                "href": f"/characters/{slug}",
                "wikiUrl": wiki_url(title),
                "display": title,
                "filter": search_keywords(title),
                "img": "/assets/hero.png",
            }
        )
    CHARACTERS_JSON.parent.mkdir(parents=True, exist_ok=True)
    CHARACTERS_JSON.write_text(
        json.dumps({"v": 1, "characters": manifest}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Wrote {len(manifest)} outfits to {CHARACTERS_JSON.relative_to(ROOT)}")


def pick_wiki_rows(limit: int) -> list[dict]:
    data = json.loads(WIKI_PAGES_JSON.read_text(encoding="utf-8"))
    rows = list(data.get("pages") or [])
    by_title = {(r.get("wikiTitle") or r.get("display") or ""): r for r in rows}
    picked: list[dict] = []
    seen: set[str] = set()
    for title in WIKI_PICKS:
        row = by_title.get(title)
        if not row:
            continue
        key = (row.get("href") or row.get("slug") or "").strip()
        if not key or key in seen:
            continue
        seen.add(key)
        picked.append(row)
        if len(picked) >= limit:
            return picked
    for row in rows:
        title = (row.get("wikiTitle") or row.get("display") or "").strip()
        if len(title) < 4 or title.startswith("!"):
            continue
        key = (row.get("href") or row.get("slug") or "").strip()
        if not key or key in seen:
            continue
        seen.add(key)
        picked.append(row)
        if len(picked) >= limit:
            break
    return picked


def import_outfits(limit: int, delay: float) -> None:
    subprocess.run(
        [
            sys.executable,
            str(SCRIPT_DIR / "import_all_characters.py"),
            "--limit",
            str(limit),
            "--force",
            "--delay",
            str(delay),
        ],
        cwd=ROOT,
        check=True,
    )


def import_wiki_sample(rows: list[dict], delay: float) -> tuple[int, int]:
    ok = err = 0
    for i, row in enumerate(rows, start=1):
        slug = (row.get("slug") or "").strip()
        title = (row.get("wikiTitle") or row.get("display") or "").strip()
        if not slug or not title:
            err += 1
            continue
        print(f"[{i}/{len(rows)}] wiki page: {title!r}", flush=True)
        try:
            cat = (row.get("categoryPath") or "").strip() or None
            import_wiki_page(title, slug=slug, category_path=cat, root=ROOT, quiet=True)
            ok += 1
        except (OSError, RuntimeError, ValueError, FileNotFoundError, KeyError, TypeError) as e:
            print(f"  FAIL {title!r}: {e}", flush=True)
            err += 1
        if delay > 0 and i < len(rows):
            time.sleep(delay)
    return ok, err


def main() -> int:
    ap = argparse.ArgumentParser(description="Partial Fortnite wiki build for local testing.")
    ap.add_argument("--outfits", type=int, default=25, help="Outfits to import (default 25).")
    ap.add_argument("--pages", type=int, default=35, help="Wiki pages to import (default 35).")
    ap.add_argument("--delay", type=float, default=0.12, help="Delay between imports.")
    ap.add_argument("--skip-import", action="store_true", help="Only rebuild routes from disk.")
    args = ap.parse_args()

    if not args.skip_import:
        if not CAT_JSON.is_file():
            print("Missing cat_all_characters_with_thumbs.json — run fetch_fandom_characters.py first.")
            return 1
        outfits = pick_outfits(args.outfits)
        print(f"Picked {len(outfits)} outfits for sample build.")
        write_characters_manifest(outfits)
        import_outfits(len(outfits), args.delay)

        wiki_rows = pick_wiki_rows(args.pages)
        print(f"Picked {len(wiki_rows)} wiki pages for sample build.")
        ok, err = import_wiki_sample(wiki_rows, args.delay)
        print(f"Wiki pages: imported={ok} errors={err}")

    subprocess.run(
        [sys.executable, str(SCRIPT_DIR / "build_site_routes.py"), "--no-enrich-search"],
        cwd=ROOT,
        check=True,
    )
    subprocess.run([sys.executable, str(SCRIPT_DIR / "rebrand_fortnite_site.py")], cwd=ROOT, check=True)
    print("\nPartial build ready. Serve locally:")
    print(f'  cd "{ROOT}" && python3 -m http.server 8080')
    print("  Open http://localhost:8080/all-pages/ for the category tree")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
