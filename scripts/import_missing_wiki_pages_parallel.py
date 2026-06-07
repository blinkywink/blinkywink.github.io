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
    except Exception as e:
        return False, f"FAIL {title!r}: {e}"


def run_batch(
    root: Path,
    missing: list[dict],
    *,
    workers: int,
    delay: float,
    timeout: float,
    rebuild_every: int,
    ok_so_far: int,
) -> tuple[int, int, int]:
    """Import up to len(missing) rows; return (ok, err, done)."""
    total = len(missing)
    if not total:
        return 0, 0, 0

    ok = err = done = 0
    with ThreadPoolExecutor(max_workers=max(1, workers)) as pool:
        futures = {pool.submit(import_one, root, row, delay): row for row in missing}
        for fut in as_completed(futures):
            done += 1
            try:
                success, msg = fut.result(timeout=timeout)
            except TimeoutError:
                success, msg = False, "FAIL (timed out after {:.0f}s)".format(timeout)
            except Exception as e:
                success, msg = False, f"FAIL (worker error): {e}"
            if success:
                ok += 1
            else:
                err += 1
            log(f"[{done}/{total}] {msg}")
            imported = ok_so_far + ok
            if ok > 0 and imported % rebuild_every == 0:
                log(f"… {imported} imported — partial route rebuild")
                subprocess.run(
                    [sys.executable, str(SCRIPT_DIR / "build_site_routes.py"), "--no-enrich-search"],
                    cwd=root,
                    check=False,
                    timeout=600,
                )
    return ok, err, done


def main() -> int:
    ap = argparse.ArgumentParser(description="Parallel wiki page import.")
    ap.add_argument("--root", type=Path, default=ROOT)
    ap.add_argument("--workers", type=int, default=4, help="Parallel workers (default 4).")
    ap.add_argument("--delay", type=float, default=0.02, help="Delay per worker after each page.")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument(
        "--batch-size",
        type=int,
        default=80,
        help="Pages per Python run (avoids queuing 30k+ tasks at once).",
    )
    ap.add_argument("--timeout", type=float, default=120, help="Max seconds per page.")
    ap.add_argument("--rebuild-every", type=int, default=500)
    args = ap.parse_args()
    root = args.root.resolve()

    missing = load_missing(root)
    if args.limit:
        missing = missing[: args.limit]
    elif args.batch_size > 0:
        missing = missing[: args.batch_size]

    total = len(missing)
    if not total:
        log("Nothing missing — all wiki pages on disk.")
        return 0

    already = sum(
        1
        for row in (json.loads(WIKI_PAGES_JSON.read_text(encoding="utf-8")).get("pages") or [])
        if (p := page_path_for_row(root, row)) and p.is_file()
    )

    log(f"Importing {total} pages with {args.workers} workers (batch mode)…")
    ok, err, _done = run_batch(
        root,
        missing,
        workers=args.workers,
        delay=args.delay,
        timeout=args.timeout,
        rebuild_every=args.rebuild_every,
        ok_so_far=already,
    )

    left = len(load_missing(root))
    log(f"Batch done: imported={ok} errors={err} | ~{left} still missing")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
