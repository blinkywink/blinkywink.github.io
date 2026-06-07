#!/usr/bin/env python3
"""
Build a JSON tree of the Ninjago Fandom wiki category hierarchy starting at
Category:Fortnite (https://fortnite.fandom.com/wiki/Category:Fortnite).

Uses the MediaWiki API (categorymembers). Respects continuations.

Default export lists **subcategories only**. To also fetch **article titles** listed on each category
(so the All pages UI and scripts can match wiki pages to local mirrors), add:

  --include-direct-pages

That roughly **doubles** API traffic and JSON size; use --no-sleep carefully.

Run from repo root:

  python3 scripts/fetch_fandom_content_category_tree.py
  python3 -u scripts/fetch_fandom_content_category_tree.py --no-sleep --max-depth 8
  python3 -u scripts/fetch_fandom_content_category_tree.py --no-sleep --include-direct-pages --progress-every 50

After importing new local pages, refresh routing for the tree UI:

  python3 scripts/build_site_routes.py

Output: assets/data/fandom_content_category_tree.json
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import time
import urllib.parse
from datetime import datetime, timezone
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
ROOT = SCRIPT_DIR.parent
OUT_PATH = ROOT / "assets" / "data" / "fandom_content_category_tree.json"
CHECKPOINT_PATH = ROOT / "assets" / "data" / ".fandom_tree_checkpoint.json"

API = "https://fortnite.fandom.com/api.php"
UA = "FortniteWikiMirror/1.0 (local mirror; contact: site maintainer)"

# Line-buffer / flush so progress shows immediately in the terminal (especially with pipes).
try:
    sys.stderr.reconfigure(line_buffering=True)
except (AttributeError, OSError):
    pass


def log(msg: str) -> None:
    print(msg, file=sys.stderr, flush=True)


def slugify_category_title(title: str) -> str:
    """Category:Foo_bar -> foo-bar for URL segments."""
    t = title.strip()
    if t.startswith("Category:"):
        t = t[len("Category:") :]
    t = t.lower()
    t = re.sub(r"[^\w\s-]", "", t, flags=re.UNICODE)
    t = re.sub(r"[-\s]+", "-", t).strip("-")
    return t or "category"


def api_get(params: dict[str, str], *, retries: int = 5) -> dict:
    """HTTPS via curl (matches import_wiki_character.py; avoids macOS Python SSL issues)."""
    q = urllib.parse.urlencode(params)
    url = f"{API}?{q}"
    last_err: Exception | None = None
    for attempt in range(retries):
        if attempt:
            wait = min(2**attempt, 30)
            log(f"API retry {attempt}/{retries - 1} in {wait}s… ({last_err})")
            time.sleep(wait)
        proc = subprocess.run(
            ["curl", "-sS", "-L", "-A", UA, "--max-time", "90", url],
            capture_output=True,
            text=True,
        )
        if proc.returncode != 0:
            last_err = RuntimeError(proc.stderr or f"curl exit {proc.returncode}")
            continue
        try:
            data = json.loads(proc.stdout)
        except json.JSONDecodeError as e:
            last_err = e
            continue
        if "error" in data:
            last_err = RuntimeError(str(data["error"]))
            continue
        return data
    raise RuntimeError(f"API failed after {retries} attempts: {last_err}")


def save_checkpoint(
    *,
    subcat_cache: dict[str, list[str]],
    page_cache: dict[str, list[str]],
    visit_counter: list[int],
    root: str,
    max_depth: int,
    include_direct_pages: bool,
) -> None:
    CHECKPOINT_PATH.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "savedAt": datetime.now(timezone.utc).isoformat(),
        "rootTitle": root,
        "maxDepth": max_depth,
        "includeDirectPages": include_direct_pages,
        "categoriesVisited": visit_counter[0],
        "subcatCache": subcat_cache,
        "pageCache": page_cache,
    }
    tmp = CHECKPOINT_PATH.with_suffix(".json.tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False)
    tmp.replace(CHECKPOINT_PATH)
    log(f"Checkpoint saved ({visit_counter[0]} API results cached).")


def fetch_subcategories(
    cmtitle: str,
    sleep_s: float,
    *,
    depth: int,
    cache: dict[str, list[str]],
) -> list[str]:
    """Return sorted list of full category titles (Category:...) that are direct subcats."""
    if cmtitle in cache:
        log(f"[depth {depth}] CACHE hit subcategories: {cmtitle}")
        return list(cache[cmtitle])

    titles: list[str] = []
    cmcontinue: str | None = None
    page_idx = 0
    while True:
        if sleep_s > 0:
            time.sleep(sleep_s)
        if page_idx == 0:
            log(f"[depth {depth}] Fetching subcategories for: {cmtitle}")
        else:
            log(f"[depth {depth}] continuation (cmcontinue) subcategories: {cmtitle}")
        page_idx += 1

        params: dict[str, str] = {
            "action": "query",
            "format": "json",
            "list": "categorymembers",
            "cmtitle": cmtitle,
            "cmtype": "subcat",
            "cmlimit": "500",
        }
        if cmcontinue:
            params["cmcontinue"] = cmcontinue
        data = api_get(params)
        members = (data.get("query") or {}).get("categorymembers") or []
        for m in members:
            t = (m.get("title") or "").strip()
            if t:
                titles.append(t)
        cont = data.get("continue") or {}
        cmcontinue = cont.get("cmcontinue")
        if not cmcontinue:
            break

    result = sorted(set(titles))
    cache[cmtitle] = result
    return result


def fetch_direct_pages(
    cmtitle: str,
    sleep_s: float,
    *,
    depth: int,
    cache: dict[str, list[str]],
) -> list[str]:
    """Non-category members listed directly on the category page (rare under Content)."""
    if cmtitle in cache:
        log(f"[depth {depth}] CACHE hit direct pages: {cmtitle}")
        return list(cache[cmtitle])

    titles: list[str] = []
    cmcontinue: str | None = None
    page_idx = 0
    while True:
        if sleep_s > 0:
            time.sleep(sleep_s)
        if page_idx == 0:
            log(f"[depth {depth}] Fetching direct pages for: {cmtitle}")
        else:
            log(f"[depth {depth}] continuation (cmcontinue) direct pages: {cmtitle}")
        page_idx += 1

        params: dict[str, str] = {
            "action": "query",
            "format": "json",
            "list": "categorymembers",
            "cmtitle": cmtitle,
            "cmtype": "page",
            "cmlimit": "500",
        }
        if cmcontinue:
            params["cmcontinue"] = cmcontinue
        data = api_get(params)
        members = (data.get("query") or {}).get("categorymembers") or []
        for m in members:
            t = (m.get("title") or "").strip()
            if t:
                titles.append(t)
        cont = data.get("continue") or {}
        cmcontinue = cont.get("cmcontinue")
        if not cmcontinue:
            break

    result = sorted(set(titles))
    cache[cmtitle] = result
    return result


def build_tree_node(
    title: str,
    *,
    depth: int,
    max_depth: int,
    sleep_s: float,
    visited: set[str],
    include_direct_pages: bool,
    subcat_cache: dict[str, list[str]],
    page_cache: dict[str, list[str]],
    visit_counter: list[int],
    progress_every: int,
    checkpoint_every: int,
    checkpoint_root: str,
    checkpoint_max_depth: int,
) -> dict:
    display = title[9:] if title.startswith("Category:") else title
    slug = slugify_category_title(title)
    wiki_path = title.replace(" ", "_")
    wiki_url = "https://fortnite.fandom.com/wiki/" + urllib.parse.quote(wiki_path, safe="():'%!")

    node: dict = {
        "title": title,
        "displayName": display,
        "slug": slug,
        "wikiUrl": wiki_url,
        "depth": depth,
        "children": [],
        "directPages": [],
    }

    if depth >= max_depth:
        node["truncated"] = True
        return node

    if title in visited:
        node["duplicate"] = True
        return node
    visited.add(title)
    visit_counter[0] += 1
    n = visit_counter[0]
    log(f"Visited {n} categories so far… (current: {title})")
    if progress_every > 0 and n % progress_every == 0:
        log(f"── Progress: {n} categories visited (still walking the tree…) ──")
    if checkpoint_every > 0 and n % checkpoint_every == 0:
        save_checkpoint(
            subcat_cache=subcat_cache,
            page_cache=page_cache,
            visit_counter=visit_counter,
            root=checkpoint_root,
            max_depth=checkpoint_max_depth,
            include_direct_pages=include_direct_pages,
        )

    try:
        subs = fetch_subcategories(title, sleep_s, depth=depth, cache=subcat_cache)
        pages = (
            fetch_direct_pages(title, sleep_s, depth=depth, cache=page_cache)
            if include_direct_pages
            else []
        )
    except Exception as e:
        node["error"] = str(e)
        return node

    node["directPages"] = pages
    for sub in subs:
        log(f"[depth {depth}] Recursing into child: {sub}")
        node["children"].append(
            build_tree_node(
                sub,
                depth=depth + 1,
                max_depth=max_depth,
                sleep_s=sleep_s,
                visited=visited,
                include_direct_pages=include_direct_pages,
                subcat_cache=subcat_cache,
                page_cache=page_cache,
                visit_counter=visit_counter,
                progress_every=progress_every,
                checkpoint_every=checkpoint_every,
                checkpoint_root=checkpoint_root,
                checkpoint_max_depth=checkpoint_max_depth,
            )
        )

    return node


def count_nodes(n: dict) -> tuple[int, int]:
    """Return (total_nodes, leaf_count)."""
    ch = n.get("children") or []
    if not ch:
        return 1, 1
    t, leaves = 1, 0
    for c in ch:
        ct, cl = count_nodes(c)
        t += ct
        leaves += cl
    return t, leaves


def main() -> None:
    ap = argparse.ArgumentParser(description="Fetch Category:Fortnite subtree from Ninjago Fandom API.")
    ap.add_argument("--root", default="Category:Fortnite", help="Root category title (default: Category:Fortnite)")
    ap.add_argument("--max-depth", type=int, default=8, help="Max nesting depth (default: 8)")
    ap.add_argument("--sleep", type=float, default=0.1, help="Seconds between API calls (default: 0.1)")
    ap.add_argument(
        "--no-sleep",
        action="store_true",
        help="Do not sleep between API calls (faster; be kind to Fandom if batching large trees).",
    )
    ap.add_argument(
        "--include-direct-pages",
        action="store_true",
        help="Also list non-category members per category (doubles API traffic).",
    )
    ap.add_argument("-o", "--output", type=Path, default=OUT_PATH, help="Output JSON path")
    ap.add_argument(
        "--progress-every",
        type=int,
        default=25,
        metavar="N",
        help="Print an extra milestone line every N categories (0 = off). Default: 25.",
    )
    ap.add_argument(
        "--checkpoint-every",
        type=int,
        default=10,
        metavar="N",
        help="Save resume checkpoint every N categories (0 = off). Default: 10.",
    )
    ap.add_argument(
        "--resume",
        action="store_true",
        help="Load API cache from last checkpoint (skips re-fetching completed categories).",
    )
    args = ap.parse_args()

    sleep_s = 0.0 if args.no_sleep else args.sleep
    visited: set[str] = set()
    subcat_cache: dict[str, list[str]] = {}
    page_cache: dict[str, list[str]] = {}
    visit_counter = [0]

    if args.resume and CHECKPOINT_PATH.is_file():
        with open(CHECKPOINT_PATH, encoding="utf-8") as f:
            ck = json.load(f)
        subcat_cache = ck.get("subcatCache") or {}
        page_cache = ck.get("pageCache") or {}
        log(
            f"Resumed checkpoint from {ck.get('savedAt', '?')} "
            f"({len(subcat_cache)} subcat + {len(page_cache)} page caches).",
        )

    log(
        f"Building tree from {args.root!r} (max_depth={args.max_depth}, sleep={sleep_s})…",
    )

    tree = build_tree_node(
        args.root,
        depth=0,
        max_depth=args.max_depth,
        sleep_s=sleep_s,
        visited=visited,
        include_direct_pages=args.include_direct_pages,
        subcat_cache=subcat_cache,
        page_cache=page_cache,
        visit_counter=visit_counter,
        progress_every=args.progress_every,
        checkpoint_every=args.checkpoint_every,
        checkpoint_root=args.root,
        checkpoint_max_depth=args.max_depth,
    )

    total, leaves = count_nodes(tree)
    payload = {
        "v": 1,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "api": API,
        "rootTitle": args.root,
        "maxDepth": args.max_depth,
        "stats": {
            "uniqueCategoriesVisited": len(visited),
            "treeNodes": total,
            "treeLeaves": leaves,
        },
        "tree": tree,
    }

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
        f.write("\n")

    if CHECKPOINT_PATH.is_file():
        CHECKPOINT_PATH.unlink()

    log(
        f"Wrote {args.output} ({len(visited)} categories visited, {total} nodes in tree display).",
    )


if __name__ == "__main__":
    main()
