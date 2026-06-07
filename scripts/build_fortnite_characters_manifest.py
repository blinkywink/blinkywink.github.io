#!/usr/bin/env python3
"""Write assets/data/characters.json from the full Fortnite outfits category fetch."""

from __future__ import annotations

import json
import re
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]
CAT_JSON = ROOT / "scripts" / "cat_all_characters_with_thumbs.json"
OUT = ROOT / "assets" / "data" / "characters.json"

FEATURED_TITLES = [
    "Drift",
    "Peely",
    "Fishstick",
    "Renegade Raider",
    "Skull Trooper",
    "Midas",
    "Black Knight",
    "Omega",
    "Raven",
    "Spider-Man",
    "Deadpool",
    "Marshmello",
    "Travis Scott",
    "Galaxy",
    "IKONIK",
]


def wiki_url(title: str) -> str:
    return "https://fortnite.fandom.com/wiki/" + quote(title.replace(" ", "_"), safe="")


def search_keywords(title: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", title.lower()).strip()


def main() -> None:
    if not CAT_JSON.is_file():
        raise SystemExit(f"Missing {CAT_JSON} — run fetch_fandom_characters.py first")

    rows = json.loads(CAT_JSON.read_text(encoding="utf-8"))
    manifest: list[dict] = []
    seen: set[str] = set()

    for row in rows:
        slug = (row.get("slug") or "").strip()
        title = (row.get("title") or "").strip()
        if not slug or not title or slug in seen:
            continue
        seen.add(slug)
        local = ROOT / "characters" / slug / "index.html"
        href = f"/characters/{slug}" if local.is_file() else wiki_url(title)
        thumb = (row.get("thumb_url") or "").strip() or "/assets/hero.png"
        manifest.append(
            {
                "slug": slug,
                "href": href,
                "wikiUrl": wiki_url(title),
                "display": title,
                "filter": search_keywords(title),
                "img": thumb,
            }
        )

    manifest.sort(key=lambda c: c["display"].lower())
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps({"v": 1, "characters": manifest}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    local_n = sum(1 for c in manifest if c["href"].startswith("/characters/"))
    print(f"Wrote {len(manifest)} outfits ({local_n} mirrored locally) → {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
