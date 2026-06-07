#!/usr/bin/env python3
"""Import wiki pages from the category tree so browse sections have content."""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
ROOT = SCRIPT_DIR.parent
TREE_JSON = ROOT / "assets/data/fandom_content_category_tree.json"
WIKI_PAGES = ROOT / "assets/data/wiki_pages.json"

sys.path.insert(0, str(SCRIPT_DIR))
from import_wiki_page import import_wiki_page  # noqa: E402

ROOT_CATEGORIES = [
    "Category:Cosmetics",
    "Category:Seasons",
    "Category:Items",
    "Category:Weapons",
    "Category:Fortnite Festival",
    "Category:External Media",
]


def norm_key(s: str) -> str:
    return (s or "").replace("\u2019", "'").strip().lower()


def load_by_title() -> dict[str, dict]:
    data = json.loads(WIKI_PAGES.read_text(encoding="utf-8"))
    out: dict[str, dict] = {}
    for row in data.get("pages") or []:
        for key in (norm_key(row.get("wikiTitle") or ""), norm_key(row.get("display") or "")):
            if key:
                out.setdefault(key, row)
    return out


def find_node(tree: dict, title: str) -> dict | None:
    if (tree.get("title") or "") == title:
        return tree
    for ch in tree.get("children") or []:
        found = find_node(ch, title)
        if found:
            return found
    return None


def page_exists(root: Path, row: dict) -> bool:
    href = (row.get("href") or "").strip()
    if href.startswith("/pages/"):
        rel = href[len("/pages/") :].strip("/").split("/")
        return root.joinpath("pages", *rel, "index.html").is_file()
    slug = (row.get("slug") or "").strip()
    return bool(slug and (root / "pages" / slug / "index.html").is_file())


def collect_targets(tree: dict, by_title: dict[str, dict], per_group: int) -> list[dict]:
    targets: list[dict] = []
    seen: set[str] = set()

    def add_row(row: dict) -> None:
        href = (row.get("href") or "").strip()
        if not href or href in seen:
            return
        seen.add(href)
        targets.append(row)

    for cat in ROOT_CATEGORIES:
        node = find_node(tree, cat)
        if not node:
            continue
        groups = node.get("children") or [node]
        for grp in groups:
            titles = list(grp.get("directPages") or [])[:per_group]
            if grp is node:
                titles = list(node.get("directPages") or [])[:per_group]
            for title in titles:
                row = by_title.get(norm_key(title))
                if row and not page_exists(ROOT, row):
                    add_row(row)
            if grp is not node:
                for title in list(grp.get("directPages") or [])[:per_group]:
                    row = by_title.get(norm_key(title))
                    if row and not page_exists(ROOT, row):
                        add_row(row)
    return targets


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--per-group", type=int, default=6, help="Pages to import per tree group")
    ap.add_argument("--limit", type=int, default=120, help="Max total imports")
    ap.add_argument("--delay", type=float, default=0.1)
    args = ap.parse_args()

    tree = json.loads(TREE_JSON.read_text(encoding="utf-8")).get("tree") or {}
    by_title = load_by_title()
    targets = collect_targets(tree, by_title, args.per_group)[: args.limit]
    print(f"Importing {len(targets)} browse sample pages…", flush=True)

    ok = err = 0
    for i, row in enumerate(targets, start=1):
        title = (row.get("wikiTitle") or row.get("display") or "").strip()
        slug = (row.get("slug") or "").strip()
        if not title or not slug:
            err += 1
            continue
        print(f"[{i}/{len(targets)}] {title}", flush=True)
        try:
            cat = (row.get("categoryPath") or "").strip() or None
            import_wiki_page(title, slug=slug, category_path=cat, root=ROOT, quiet=True)
            ok += 1
        except (OSError, RuntimeError, ValueError, FileNotFoundError, KeyError, TypeError) as e:
            print(f"  FAIL: {e}", flush=True)
            err += 1
        if args.delay > 0 and i < len(targets):
            time.sleep(args.delay)

    print(f"Done: imported={ok} errors={err}", flush=True)
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
