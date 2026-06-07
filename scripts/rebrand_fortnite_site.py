#!/usr/bin/env python3
"""Replace remaining Ninjago copy/labels with Fortnite across the site shell."""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TEXT_SUFFIXES = {".html", ".js", ".css", ".md", ".json", ".command"}

REPLACEMENTS = [
    ("Ninjago Wiki — contact form", "Fortnite Wiki — contact form"),
    ("Explore Ninjago lore", "Explore Fortnite lore"),
    ("exploring Ninjago lore", "exploring Fortnite lore"),
    ("browse Ninjago lore", "browse Fortnite lore"),
    ("Ninjago lore, characters, and episodes", "Fortnite lore, outfits, seasons, and items"),
    ("Ninjago community's work on the Fandom wiki", "Fortnite community's work on the Fandom wiki"),
    ("Ninjago community's work", "Fortnite community's work"),
    ("from the Ninjago community", "from the Fortnite community"),
    ("The Ninjago community", "The Fortnite community"),
    ("Ninjago Fandom wiki", "Fortnite Fandom wiki"),
    ("Ninjago Fandom moderators", "Fortnite Fandom moderators"),
    ("Ninjago Fandom", "Fortnite Fandom"),
    ("Ninjago community", "Fortnite community"),
    ("official LEGO or Ninjago website", "official Epic Games or Fortnite website"),
    ("LEGO or the creators of Ninjago", "Epic Games or the creators of Fortnite"),
    ("LEGO or the official show", "Epic Games or Fortnite"),
    ("Not affiliated with LEGO", "Not affiliated with Epic Games"),
    ("Fan-made Fortnite wiki. Not affiliated with Epic Games or the official show.", "Fan-made Fortnite wiki. Not affiliated with Epic Games."),
    ('href="/episodes">Episodes</a>', 'href="/episodes">Seasons</a>'),
    ('href="/weapons">Weapons</a>', 'href="/weapons">Items</a>'),
    ('href="/sets">Sets</a>', 'href="/sets">Cosmetics</a>'),
    ("Episodes • Fortnite Wiki Project", "Seasons • Fortnite Wiki Project"),
    ("Weapons • Fortnite Wiki Project", "Items • Fortnite Wiki Project"),
    ("Sets • Fortnite Wiki Project", "Cosmetics • Fortnite Wiki Project"),
    ('content="Episodes — Fortnite Wiki Project"', 'content="Seasons — Fortnite Wiki Project"'),
    ('content="Weapons — Fortnite Wiki Project"', 'content="Items — Fortnite Wiki Project"'),
    ('content="Sets — Fortnite Wiki Project"', 'content="Cosmetics — Fortnite Wiki Project"'),
    ("Episodes by season", "Seasons"),
    ("Set search", "Cosmetic search"),
    ("Search sets", "Search cosmetics"),
    ("Sets by category", "Cosmetics by set"),
    ("Set name, set number, year, polybags, keychains…", "Outfit name, set, rarity, collaboration…"),
    ("Weapon search", "Item search"),
    ("Search weapons", "Search items"),
    ("Weapons by category", "Items by type"),
    ("weapon name", "item name"),
    ("No episode data", "No season data"),
    ("No weapon data", "No item data"),
    ("No set data", "No cosmetic data"),
    ("build_episodes_index.py", "build_fortnite_browse_indexes.py"),
    ("build_weapons_index.py", "build_fortnite_browse_indexes.py"),
    ("build_sets_index.py", "build_fortnite_browse_indexes.py"),
    ("Ninjago WikiMirror", "FortniteWikiMirror"),
    ("Category:Characters", "Category:Outfits"),
    ("NinjagoWikiMirror", "FortniteWikiMirror"),
]

NAV_FIX = re.compile(r"\n\s+<a href=\"/weapons\">", re.MULTILINE)


def process_file(path: Path) -> bool:
    try:
        text = path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return False
    original = text
    for old, new in REPLACEMENTS:
        text = text.replace(old, new)
    text = NAV_FIX.sub("\n          <a href=\"/weapons\">", text)
    if text != original:
        path.write_text(text, encoding="utf-8")
        return True
    return False


def main() -> None:
    changed = 0
    for path in ROOT.rglob("*"):
        if not path.is_file() or path.suffix.lower() not in TEXT_SUFFIXES:
            continue
        if ".git" in path.parts or path.name == "rebrand_fortnite_site.py":
            continue
        if process_file(path):
            changed += 1
    print(f"Rebranded {changed} files under {ROOT}")


if __name__ == "__main__":
    main()
