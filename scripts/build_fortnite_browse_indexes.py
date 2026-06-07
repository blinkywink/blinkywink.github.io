#!/usr/bin/env python3
"""Build browse indexes for Fortnite (seasons, cosmetics, items, media)."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
ROOT = SCRIPT_DIR.parent
sys.path.insert(0, str(SCRIPT_DIR))
from search_snippet_extract import thumb_from_mirror_html  # noqa: E402

WIKI_PAGES = ROOT / "assets/data/wiki_pages.json"
WIKI_SEARCH = ROOT / "assets/data/wiki_search_index.json"
TREE_JSON = ROOT / "assets/data/fandom_content_category_tree.json"
EPISODES_OUT = ROOT / "assets/data/episodes_index.json"
SETS_OUT = ROOT / "assets/data/sets_index.json"
WEAPONS_OUT = ROOT / "assets/data/weapons_index.json"
MEDIA_OUT = ROOT / "assets/data/media_index.json"

GENERIC_THUMBS = frozenset({"/assets/hero.png", "/assets/hero-mobile.png", ""})


def norm_key(s: str) -> str:
    return (s or "").replace("\u2019", "'").replace("\u2018", "'").strip().lower()


def load_thumb_by_href() -> dict[str, str]:
    if not WIKI_SEARCH.is_file():
        return {}
    try:
        data = json.loads(WIKI_SEARCH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    out: dict[str, str] = {}
    for p in (data.get("pages") or []) + (data.get("characters") or []):
        h = (p.get("href") or "").split("?")[0].rstrip("/")
        th = (p.get("thumb") or "").strip()
        if h and th and th not in GENERIC_THUMBS:
            out[h] = th
    return out


def href_to_mirror_path(href: str) -> Path | None:
    h = (href or "").split("?")[0].strip()
    if h.startswith("/pages/"):
        rel = h[len("/pages/") :].strip("/").split("/")
        return ROOT.joinpath("pages", *rel, "index.html") if rel else None
    if h.startswith("/characters/"):
        slug = h[len("/characters/") :].strip("/")
        return ROOT / "characters" / slug / "index.html" if slug else None
    return None


def find_node(tree: dict, title: str) -> dict | None:
    if (tree.get("title") or "") == title:
        return tree
    for ch in tree.get("children") or []:
        found = find_node(ch, title)
        if found:
            return found
    return None


def title_to_href(title: str, by_title: dict[str, dict]) -> str | None:
    row = by_title.get(norm_key(title))
    if not row:
        return None
    href = (row.get("href") or "").strip()
    if href and href_to_mirror_path(href) and href_to_mirror_path(href).is_file():
        return href
    return None


def load_pages_by_title() -> dict[str, dict]:
    if not WIKI_PAGES.is_file():
        return {}
    data = json.loads(WIKI_PAGES.read_text(encoding="utf-8"))
    out: dict[str, dict] = {}
    for row in data.get("pages") or []:
        for key in (
            norm_key(row.get("display") or ""),
            norm_key(row.get("wikiTitle") or ""),
        ):
            if key:
                out.setdefault(key, row)
    return out


def row_from_page(page: dict, thumbs: dict[str, str], html_cache: dict[str, str]) -> dict | None:
    href = (page.get("href") or "").strip()
    display = (page.get("display") or page.get("wikiTitle") or "").strip()
    slug = (page.get("slug") or "").strip()
    if not href or not display:
        return None
    path = href_to_mirror_path(href)
    if not path or not path.is_file():
        return None
    th = thumbs.get(href.rstrip("/")) or thumbs.get(href)
    if not th:
        key = str(path)
        if key not in html_cache:
            try:
                html_cache[key] = path.read_text(encoding="utf-8", errors="replace")[:900_000]
            except OSError:
                html_cache[key] = ""
        th = thumb_from_mirror_html(html_cache[key]) or page.get("thumb") or ""
    kw = norm_key(display)
    return {
        "display": display,
        "href": href,
        "slug": slug,
        "filter": f"{kw} {display}",
        "codes": page.get("codes") or [],
        "img": th or "",
    }


def pages_from_tree_node(node: dict, by_title: dict[str, dict], thumbs: dict, cache: dict) -> list[dict]:
    rows: list[dict] = []
    seen: set[str] = set()
    for title in node.get("directPages") or []:
        page = by_title.get(norm_key(title))
        if not page:
            continue
        built = row_from_page(page, thumbs, cache)
        if not built or built["href"] in seen:
            continue
        seen.add(built["href"])
        rows.append(built)
    rows.sort(key=lambda r: norm_key(r["display"]))
    return rows


def build_seasons(tree: dict, by_title: dict[str, dict], thumbs: dict, cache: dict) -> list[dict]:
    seasons_out: list[dict] = []
    for cat_title, group_id in (
        ("Category:Seasons", "seasons"),
        ("Category:Battle Pass", "battle-pass"),
    ):
        node = find_node(tree, cat_title)
        if not node:
            continue
        eps = pages_from_tree_node(node, by_title, thumbs, cache)
        for ch in node.get("children") or []:
            child_eps = pages_from_tree_node(ch, by_title, thumbs, cache)
            if child_eps:
                seasons_out.append(
                    {
                        "id": f"{group_id}-{ch.get('slug') or norm_key(ch.get('title') or '')}",
                        "title": ch.get("displayName") or ch.get("title") or "Season",
                        "seasonHref": "",
                        "episodes": child_eps,
                    }
                )
        if eps:
            seasons_out.append(
                {
                    "id": group_id,
                    "title": node.get("displayName") or cat_title.replace("Category:", ""),
                    "seasonHref": "",
                    "episodes": eps,
                }
            )
    return seasons_out


def build_cosmetics(tree: dict, by_title: dict[str, dict], thumbs: dict, cache: dict) -> list[dict]:
    node = find_node(tree, "Category:Cosmetics")
    if not node:
        return []
    groups_out: list[dict] = []
    for ch in node.get("children") or []:
        title = ch.get("displayName") or ch.get("title") or "Set"
        sets_rows = pages_from_tree_node(ch, by_title, thumbs, cache)
        if not sets_rows:
            continue
        groups_out.append(
            {
                "id": ch.get("slug") or norm_key(title),
                "title": title.replace("Category:", ""),
                "groupKey": ch.get("slug") or norm_key(title),
                "groupHref": None,
                "sets": sets_rows,
            }
        )
    groups_out.sort(key=lambda g: norm_key(g["title"]))
    return groups_out


def build_items(tree: dict, by_title: dict[str, dict], thumbs: dict, cache: dict) -> list[dict]:
    groups_out: list[dict] = []
    for cat_title in ("Category:Items", "Category:Weapons"):
        node = find_node(tree, cat_title)
        if not node:
            continue
        rows = pages_from_tree_node(node, by_title, thumbs, cache)
        for ch in node.get("children") or []:
            rows.extend(pages_from_tree_node(ch, by_title, thumbs, cache))
        if rows:
            dedup: dict[str, dict] = {}
            for r in rows:
                dedup[r["href"]] = r
            groups_out.append(
                {
                    "id": node.get("slug") or norm_key(cat_title),
                    "title": node.get("displayName") or cat_title.replace("Category:", ""),
                    "groupKey": node.get("slug") or norm_key(cat_title),
                    "groupHref": None,
                    "sets": sorted(dedup.values(), key=lambda r: norm_key(r["display"])),
                }
            )
    return groups_out


def build_media(tree: dict, by_title: dict[str, dict], thumbs: dict, cache: dict) -> list[dict]:
    groups_out: list[dict] = []
    for cat_title in ("Category:Fortnite Festival", "Category:External Media"):
        node = find_node(tree, cat_title)
        if not node:
            continue
        rows = pages_from_tree_node(node, by_title, thumbs, cache)
        if rows:
            groups_out.append(
                {
                    "id": node.get("slug") or norm_key(cat_title),
                    "title": node.get("displayName") or cat_title.replace("Category:", ""),
                    "items": rows,
                }
            )
    return groups_out


def main() -> None:
    if not TREE_JSON.is_file():
        print(f"Missing {TREE_JSON}", file=sys.stderr)
        sys.exit(1)
    tree_root = json.loads(TREE_JSON.read_text(encoding="utf-8")).get("tree") or {}
    by_title = load_pages_by_title()
    thumbs = load_thumb_by_href()
    cache: dict[str, str] = {}

    seasons = build_seasons(tree_root, by_title, thumbs, cache)
    EPISODES_OUT.write_text(
        json.dumps({"seasons": seasons}, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    n_eps = sum(len(s["episodes"]) for s in seasons)
    print(f"Wrote {EPISODES_OUT.name} — {len(seasons)} groups, {n_eps} entries")

    cosmetics = build_cosmetics(tree_root, by_title, thumbs, cache)
    SETS_OUT.write_text(
        json.dumps({"v": 2, "source": "Category:Cosmetics", "groups": cosmetics}, indent=2, ensure_ascii=False)
        + "\n",
        encoding="utf-8",
    )
    n_cos = sum(len(g["sets"]) for g in cosmetics)
    print(f"Wrote {SETS_OUT.name} — {len(cosmetics)} groups, {n_cos} cosmetics")

    items = build_items(tree_root, by_title, thumbs, cache)
    WEAPONS_OUT.write_text(
        json.dumps({"v": 2, "source": "Category:Items", "groups": items}, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    n_items = sum(len(g["sets"]) for g in items)
    print(f"Wrote {WEAPONS_OUT.name} — {len(items)} groups, {n_items} items")

    media = build_media(tree_root, by_title, thumbs, cache)
    MEDIA_OUT.write_text(
        json.dumps({"v": 2, "source": "fortnite media categories", "groups": media}, indent=2, ensure_ascii=False)
        + "\n",
        encoding="utf-8",
    )
    n_media = sum(len(g.get("items") or []) for g in media)
    print(f"Wrote {MEDIA_OUT.name} — {len(media)} groups, {n_media} entries")


if __name__ == "__main__":
    main()
