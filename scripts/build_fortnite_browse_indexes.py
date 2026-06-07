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


def row_from_page(
    page: dict,
    thumbs: dict[str, str],
    html_cache: dict[str, str],
    *,
    search_tags: str = "",
) -> dict | None:
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
        th = thumb_from_mirror_html(html_cache[key], page.get("thumb")) or ""
    kw = norm_key(display)
    tags = (search_tags or "").strip()
    return {
        "display": display,
        "href": href,
        "slug": slug,
        "filter": f"{kw} {display} {tags} gun weapon guns".strip(),
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


def season_sort_key(display: str) -> tuple[int, int, str]:
    """Order Chapter N: Season M (and bare Season M) numerically."""
    t = display.strip()
    ch = re.search(r"chapter\s*(\d+)", t, re.I)
    se = re.search(r"season\s*(\d+)", t, re.I)
    chapter = int(ch.group(1)) if ch else 0
    if se:
        season = int(se.group(1))
    elif re.search(r"season\s*x\b", t, re.I):
        season = 10
    elif "remix" in t.lower():
        season = 0
    else:
        season = 999
    return (chapter, season, norm_key(t))


def pages_from_direct_titles(
    titles: list[str],
    by_title: dict[str, dict],
    thumbs: dict,
    cache: dict,
) -> list[dict]:
    rows: list[dict] = []
    seen: set[str] = set()
    for title in titles:
        page = by_title.get(norm_key(title))
        if not page:
            continue
        built = row_from_page(page, thumbs, cache)
        if not built or built["href"] in seen:
            continue
        seen.add(built["href"])
        rows.append(built)
    rows.sort(key=lambda r: season_sort_key(r["display"]))
    return rows


def build_seasons(tree: dict, by_title: dict[str, dict], thumbs: dict, cache: dict) -> list[dict]:
    seasons_out: list[dict] = []

    chapters = find_node(tree, "Category:Chapters")
    if chapters:
        for ch in chapters.get("children") or []:
            cat_title = ch.get("displayName") or (ch.get("title") or "").replace("Category:", "")
            if not cat_title or cat_title.lower() == "pre-season":
                continue
            eps = pages_from_direct_titles(ch.get("directPages") or [], by_title, thumbs, cache)
            if not eps:
                continue
            chapter_href = title_to_href(cat_title, by_title) or ""
            seasons_out.append(
                {
                    "id": ch.get("slug") or norm_key(cat_title),
                    "title": cat_title,
                    "seasonHref": chapter_href or "",
                    "episodes": eps,
                }
            )

    mini = find_node(tree, "Category:Mini Seasons")
    if mini:
        eps = pages_from_direct_titles(mini.get("directPages") or [], by_title, thumbs, cache)
        if eps:
            seasons_out.append(
                {
                    "id": "mini-seasons",
                    "title": "Mini Seasons",
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


def pages_from_node_recursive(
    node: dict,
    by_title: dict[str, dict],
    thumbs: dict,
    cache: dict,
    seen: set[str],
    *,
    search_tags: str = "",
) -> list[dict]:
    rows: list[dict] = []
    for title in node.get("directPages") or []:
        page = by_title.get(norm_key(title))
        if not page:
            continue
        built = row_from_page(page, thumbs, cache, search_tags=search_tags)
        if not built or built["href"] in seen:
            continue
        rows.append(built)
    for ch in node.get("children") or []:
        if ch.get("duplicate"):
            continue
        rows.extend(
            pages_from_node_recursive(
                ch, by_title, thumbs, cache, seen, search_tags=search_tags
            )
        )
    return rows


def _append_weapon_group(
    groups: list[dict],
    seen: set[str],
    title: str,
    slug: str,
    rows: list[dict],
) -> None:
    unique = [r for r in rows if r.get("href") and r["href"] not in seen]
    if not unique:
        return
    for r in unique:
        seen.add(r["href"])
    unique.sort(key=lambda r: norm_key(r["display"]))
    groups.append(
        {
            "id": slug.replace("/", "__"),
            "title": title,
            "groupKey": slug,
            "groupHref": None,
            "sets": unique,
        }
    )


def build_weapons(tree: dict, by_title: dict[str, dict], thumbs: dict, cache: dict) -> list[dict]:
    """Battle Royale + melee weapon browse groups (recursive category tree)."""
    groups_out: list[dict] = []
    seen: set[str] = set()

    br = find_node(tree, "Category:Weapons (Battle Royale)")
    if br:
        root_rows = pages_from_tree_node(br, by_title, thumbs, cache)
        root_rows = [r for r in root_rows if r["href"] not in seen]
        _append_weapon_group(
            groups_out,
            seen,
            "Battle Royale — Other",
            "battle-royale-other",
            root_rows,
        )

        for ch in br.get("children") or []:
            if ch.get("duplicate"):
                continue
            ch_title = (ch.get("displayName") or ch.get("title") or "Weapons").replace(
                "Category:", ""
            )
            ch_slug = ch.get("slug") or norm_key(ch_title)
            subcats = [c for c in ch.get("children") or [] if not c.get("duplicate")]

            if subcats:
                for sub in subcats:
                    sub_title = (sub.get("displayName") or sub.get("title") or "").replace(
                        "Category:", ""
                    )
                    sub_slug = sub.get("slug") or norm_key(sub_title)
                    rows = pages_from_node_recursive(
                        sub,
                        by_title,
                        thumbs,
                        cache,
                        seen,
                        search_tags=f"{ch_title} {sub_title}",
                    )
                    _append_weapon_group(groups_out, seen, sub_title, sub_slug, rows)
            else:
                rows = pages_from_node_recursive(
                    ch,
                    by_title,
                    thumbs,
                    cache,
                    seen,
                    search_tags=ch_title,
                )
                _append_weapon_group(groups_out, seen, ch_title, ch_slug, rows)

    melee = find_node(tree, "Category:Melee Weapons")
    if melee:
        rows = pages_from_node_recursive(
            melee, by_title, thumbs, cache, seen, search_tags="melee weapons"
        )
        _append_weapon_group(groups_out, seen, "Melee Weapons", "melee-weapons", rows)

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

    weapons = build_weapons(tree_root, by_title, thumbs, cache)
    WEAPONS_OUT.write_text(
        json.dumps(
            {"v": 2, "source": "Category:Weapons (Battle Royale)", "groups": weapons},
            indent=2,
            ensure_ascii=False,
        )
        + "\n",
        encoding="utf-8",
    )
    n_weapons = sum(len(g["sets"]) for g in weapons)
    print(f"Wrote {WEAPONS_OUT.name} — {len(weapons)} groups, {n_weapons} weapons")

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
