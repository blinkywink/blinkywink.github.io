#!/usr/bin/env python3
"""Apply wiki branding/config replacements to a bootstrapped site tree."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_CONFIG = SCRIPT_DIR / "fortnite_wiki_config.json"

TEXT_SUFFIXES = {
    ".html",
    ".js",
    ".css",
    ".py",
    ".sh",
    ".json",
    ".md",
    ".command",
    ".txt",
    ".xml",
}

HIDDEN_SEARCH_RE = re.compile(
    r"<!-- Hidden homepage search index[\s\S]*?"
    r'<div aria-hidden="true" style="display:none">[\s\S]*?</div>',
    re.MULTILINE,
)

HIDDEN_SEARCH_REPLACEMENT = (
    "<!-- Hidden homepage search index (run scripts/build_characters_page.py after importing) -->\n"
    '      <div aria-hidden="true" style="display:none"></div>'
)


def load_config(path: Path) -> dict:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def apply_replacements(text: str, pairs: list[list[str]]) -> str:
    for old, new in pairs:
        text = text.replace(old, new)
    return text


def strip_homepage_search_index(text: str) -> str:
    return HIDDEN_SEARCH_RE.sub(HIDDEN_SEARCH_REPLACEMENT, text, count=1)


def process_file(path: Path, pairs: list[list[str]]) -> bool:
    try:
        original = path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return False
    updated = apply_replacements(original, pairs)
    if path.name == "index.html" and path.parent.name != "trivia":
        updated = strip_homepage_search_index(updated)
    if updated != original:
        path.write_text(updated, encoding="utf-8")
        return True
    return False


def write_empty_data(root: Path, cfg: dict) -> None:
    data = root / "assets" / "data"
    data.mkdir(parents=True, exist_ok=True)

    payloads = {
        "wiki_pages.json": {"v": 1, "pages": []},
        "characters.json": {"v": 1, "characters": []},
        "character_groups.json": {"v": 1, "groups": []},
        "site_routes.json": {
            "v": 1,
            "wikiPathToHref": {},
            "wikiTitleKeyToHref": {},
            "stats": {},
        },
        "wiki_search_index.json": {
            "v": 2,
            "pages": [],
            "characters": [],
            "stats": {"pagesOnDisk": 0, "charactersOnDisk": 0, "manifestRows": 0},
        },
        "episodes_index.json": {"v": 1, "seasons": []},
        "sets_index.json": {"v": 2, "groups": []},
        "weapons_index.json": {"v": 2, "groups": []},
        "media_index.json": {"v": 2, "groups": []},
        "quiz_pool.json": {"v": 1, "episodes": [], "characters": [], "sets": [], "weapons": []},
        "fandom_content_category_tree.json": {
            "v": 1,
            "rootTitle": cfg["categoryRoot"],
            "tree": {
                "title": cfg["categoryRoot"],
                "slug": cfg["categoryRoot"].replace("Category:", "").lower().replace(" ", "-"),
                "subcategories": [],
                "directPages": [],
            },
            "stats": {"uniqueCategoriesVisited": 0, "treeNodes": 1, "treeLeaves": 1},
        },
        "sitemap_config.json": {
            "baseUrl": cfg["sitemapBaseUrl"],
            "excludePathPrefixes": ["/assets/", "/server-files/"],
            "groups": {
                "core": {
                    "file": "sitemap-core.xml",
                    "match": [
                        "^/$",
                        "^/about$",
                        "^/all-pages$",
                        "^/characters$",
                        "^/episodes$",
                        "^/sets$",
                        "^/weapons$",
                        "^/media$",
                        "^/trivia$",
                    ],
                    "changefreq": "weekly",
                    "priority": 0.9,
                },
                "characters": {
                    "file": "sitemap-characters.xml",
                    "match": ["^/characters/"],
                    "changefreq": "monthly",
                    "priority": 0.8,
                },
                "wiki": {
                    "file": "sitemap-wiki.xml",
                    "match": ["^/pages/"],
                    "changefreq": "monthly",
                    "priority": 0.6,
                },
            },
            "defaults": {"changefreq": "monthly", "priority": 0.5},
        },
        "wiki_config.json": cfg,
    }

    for name, payload in payloads.items():
        out = data / name
        with open(out, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
            f.write("\n")


def main() -> None:
    ap = argparse.ArgumentParser(description="Apply wiki template branding to a site directory.")
    ap.add_argument("--root", type=Path, required=True)
    ap.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    args = ap.parse_args()

    root = args.root.resolve()
    cfg = load_config(args.config.resolve())
    pairs = cfg.get("replacements") or []

    changed = 0
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        if path.suffix.lower() not in TEXT_SUFFIXES:
            continue
        if "/.git/" in str(path) or path.parts and path.parts[-2] == "__pycache__":
            continue
        if process_file(path, pairs):
            changed += 1

    write_empty_data(root, cfg)
    print(f"Applied template to {root} ({changed} text files updated, data manifests reset).")


if __name__ == "__main__":
    main()
