#!/usr/bin/env python3
"""Import missing wiki pages with parallel workers (much faster than serial)."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
ROOT = SCRIPT_DIR.parent
WIKI_PAGES_JSON = ROOT / "assets" / "data" / "wiki_pages.json"

sys.path.insert(0, str(SCRIPT_DIR))
from import_missing_wiki_pages_from_manifest import page_path_for_row  # noqa: E402
from import_wiki_page import import_wiki_page  # noqa: E402

_log_lock = threading.Lock()


def log(msg: str) -> None:
    with _log_lock:
        print(msg, file=sys.stderr, flush=True)


def load_missing(root: Path) -> list[dict]:
    rows = json.loads(WIKI_PAGES_JSON.read_text(encoding="utf-8")).get("pages") or []
    missing: list[dict] = []
    for row in rows:
        p = page_path_for_row(root, row)
        if p is None or p.is_file():
            continue
        missing.append(row)
    return missing


def import_one(root: Path, row: dict, delay: float) -> tuple[bool, str]:
    slug = (row.get("slug") or "").strip()
    title = (row.get("wikiTitle") or row.get("display") or "").strip()
    if not slug or not title:
        return False, f"skip bad row {slug!r}"
    t0 = time.time()
    try:
        cat = (row.get("categoryPath") or "").strip() or None
        import_wiki_page(title, slug=slug, category_path=cat, root=root, quiet=True)
        if delay > 0:
            time.sleep(delay)
        elapsed = time.time() - t0
        note = f" ({elapsed:.0f}s)" if elapsed > 5 else ""
        return True, f"OK {title!r}{note}"
    except (OSError, RuntimeError, ValueError, FileNotFoundError, KeyError, TypeError) as e:
        return False, f"FAIL {title!r}: {e}"


def main() -> int:
    ap = argparse.ArgumentParser(description="Parallel wiki page import.")
    ap.add_argument("--root", type=Path, default=ROOT)
    ap.add_argument("--workers", type=int, default=4, help="Parallel workers (default 4).")
    ap.add_argument("--delay", type=float, default=0.02, help="Delay per worker after each page.")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--rebuild-every", type=int, default=500)
    args = ap.parse_args()
    root = args.root.resolve()

    missing = load_missing(root)
    if args.limit:
        missing = missing[: args.limit]
    total = len(missing)
    if not total:
        log("Nothing missing — all wiki pages on disk.")
        return 0

    log(f"Importing {total} pages with {args.workers} workers…")
    ok = err = done = 0

    with ThreadPoolExecutor(max_workers=max(1, args.workers)) as pool:
        futures = {pool.submit(import_one, root, row, args.delay): row for row in missing}
        for fut in as_completed(futures):
            done += 1
            success, msg = fut.result()
            if success:
                ok += 1
            else:
                err += 1
            log(f"[{done}/{total}] {msg}")
            if ok > 0 and ok % args.rebuild_every == 0:
                log(f"… {ok} imported — partial route rebuild")
                subprocess.run(
                    [sys.executable, str(SCRIPT_DIR / "build_site_routes.py"), "--no-enrich-search"],
                    cwd=root,
                    check=False,
                    timeout=600,
                )

    log(f"Done: imported={ok} errors={err}")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
