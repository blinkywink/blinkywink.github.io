#!/usr/bin/env python3
"""Replace header/footer/nav across all static HTML with shared Fortnite site chrome."""

from __future__ import annotations

import re
from pathlib import Path

from site_chrome import THEME_COLOR, footer_html, header_html

ROOT = Path(__file__).resolve().parents[1]

HEADER_RE = re.compile(
    r"<header class=\"site-header\">.*?</header>",
    re.DOTALL,
)
FOOTER_RE = re.compile(
    r"<footer class=\"site-footer\">.*?</footer>",
    re.DOTALL,
)
THEME_RE = re.compile(r'<meta name="theme-color" content="[^"]*" />')

REPLACEMENTS = [
    ("Ninjago lore", "Fortnite lore"),
    ("A cleaner, faster way to explore Ninjago lore.", "A cleaner, faster way to explore Fortnite lore."),
    ("exploring Ninjago lore", "exploring Fortnite lore"),
    ("browse Ninjago lore", "browse Fortnite lore"),
    ("Characters • Fortnite Wiki Project", "Outfits • Fortnite Wiki Project"),
    ("Search characters…", "Search outfits…"),
    ("Character search", "Outfit search"),
    ("Search characters", "Search outfits"),
    ("Characters by category", "Outfits by category"),
    ('content="Characters — Fortnite Wiki Project"', 'content="Outfits — Fortnite Wiki Project"'),
    ('<a href="/characters">Characters</a>', '<a href="/characters">Outfits</a>'),
    ("Not affiliated with Epic Games or Fortnite.", "Not affiliated with Epic Games."),
    ("Not affiliated with LEGO or the official show.", "Not affiliated with Epic Games."),
    ("Fan-made Fortnite wiki. Not affiliated with Epic Games or Fortnite.", "Fan-made Fortnite wiki. Not affiliated with Epic Games."),
]


def patch_file(path: Path) -> bool:
    text = path.read_text(encoding="utf-8")
    orig = text

    if HEADER_RE.search(text):
        text = HEADER_RE.sub(header_html(), text, count=1)
    if FOOTER_RE.search(text):
        text = FOOTER_RE.sub(footer_html(), text, count=1)

    text = THEME_RE.sub(f'<meta name="theme-color" content="{THEME_COLOR}" />', text)

    for old, new in REPLACEMENTS:
        text = text.replace(old, new)

    if text != orig:
        path.write_text(text, encoding="utf-8")
        return True
    return False


def main() -> None:
    n = 0
    for path in ROOT.rglob("*.html"):
        if "node_modules" in path.parts:
            continue
        if patch_file(path):
            n += 1
            print(path.relative_to(ROOT))
    print(f"Patched {n} HTML file(s).")


if __name__ == "__main__":
    main()
