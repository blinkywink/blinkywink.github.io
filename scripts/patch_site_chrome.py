#!/usr/bin/env python3
"""Replace header/footer/nav across all static HTML with shared Fortnite site chrome."""

from __future__ import annotations

import re
from pathlib import Path

from site_chrome import NAV_HREFS, NAV_LINKS, THEME_COLOR, footer_html, header_html

ROOT = Path(__file__).resolve().parents[1]

HEADER_RE = re.compile(
    r"<header\s+class=\"site-header\">.*?</header>",
    re.DOTALL | re.IGNORECASE,
)
FOOTER_RE = re.compile(
    r"<footer\s+class=\"site-footer\">.*?</footer>",
    re.DOTALL | re.IGNORECASE,
)
NAV_RE = re.compile(
    r'(<nav\s+class="nav"[^>]*>)(.*?)(</nav>)',
    re.DOTALL | re.IGNORECASE,
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
    ('<a href="/weapons">Items</a>', '<a href="/weapons">Weapons</a>'),
    ('<a href="/characters">Characters</a>', '<a href="/characters">Outfits</a>'),
    ('<a href="/episodes">Episodes</a>', '<a href="/episodes">Seasons</a>'),
    ('<a href="/media">Media</a>', ""),
    ("Not affiliated with Epic Games or Fortnite.", "Not affiliated with Epic Games."),
    ("Not affiliated with LEGO or the official show.", "Not affiliated with Epic Games."),
    ("Fan-made Fortnite wiki. Not affiliated with Epic Games or Fortnite.", "Fan-made Fortnite wiki. Not affiliated with Epic Games."),
]


def _nav_hrefs(html: str) -> tuple[str, ...]:
    nav = NAV_RE.search(html)
    if not nav:
        return ()
    return tuple(re.findall(r'href="([^"]+)"', nav.group(2)))


def patch_file(path: Path) -> bool:
    text = path.read_text(encoding="utf-8")
    orig = text

    if HEADER_RE.search(text):
        text = HEADER_RE.sub(header_html(), text, count=1)
    elif NAV_RE.search(text) and _nav_hrefs(text) != NAV_HREFS:
        text = NAV_RE.sub(rf"\1{NAV_LINKS}\n        \3", text, count=1)

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
