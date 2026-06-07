#!/usr/bin/env python3
"""Build character_groups.json for the outfits browse page (Featured + A–Z)."""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CAT_JSON = ROOT / "scripts" / "cat_all_characters_with_thumbs.json"
OUT = ROOT / "assets" / "data" / "character_groups.json"

FEATURED = [
    "Drift",
    "Peely",
    "Fishstick",
    "Renegade Raider",
    "Skull Trooper",
    "Midas",
    "Black Knight",
    "Omega",
    "Jules",
    "Kit",
    "Spider-Man",
    "Iron Man",
    "Deadpool",
    "Goku",
    "Marshmello",
    "Travis Scott",
    "Galaxy",
    "IKONIK",
    "Lynx",
    "Calamity",
]


def bucket(title: str) -> str:
    t = title.strip()
    if not t:
        return "#"
    m = re.search(r"[A-Za-z0-9]", t)
    if not m:
        return "#"
    ch = m.group(0).upper()
    return ch if ch.isalpha() else "#"


def main() -> None:
    if not CAT_JSON.is_file():
        raise SystemExit(f"Missing {CAT_JSON}")

    titles = [r["title"] for r in json.loads(CAT_JSON.read_text(encoding="utf-8")) if r.get("title")]
    merged: dict[str, list[str]] = {"Featured": []}
    featured_set = {t.casefold() for t in FEATURED}

    for t in FEATURED:
        if any(x.casefold() == t.casefold() for x in titles):
            merged["Featured"].append(t)

    for title in sorted(titles, key=str.casefold):
        if title.casefold() in featured_set:
            continue
        key = bucket(title)
        merged.setdefault(key, []).append(title)

    order = ["Featured"] + sorted(k for k in merged if k not in ("Featured", "#"))
    if "#" in merged:
        order.append("#")

    payload = {"v": 2, "order": order, "merged": merged}
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {OUT.name} — {len(titles)} outfits in {len(order)} groups")


if __name__ == "__main__":
    main()
