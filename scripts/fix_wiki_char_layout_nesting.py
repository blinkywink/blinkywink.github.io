#!/usr/bin/env python3
"""Move .wiki-char-layout out of .wiki-char-article-rail (sibling grid columns)."""

from __future__ import annotations

import argparse
from pathlib import Path

LAYOUT_OPEN = '        <div class="wiki-char-layout wiki-char-layout--full">'
HERO_THEN_LAYOUT = (
    "          </div>\n        <div class=\"wiki-char-layout wiki-char-layout--full\">"
)
HERO_THEN_LAYOUT_FIXED = (
    "          </div>\n        </div>\n        <div class=\"wiki-char-layout wiki-char-layout--full\">"
)
EMPTY_RAIL_THEN_LAYOUT = (
    '        <div class="wiki-char-article-rail">\n        <div class="wiki-char-layout'
)
EMPTY_RAIL_THEN_LAYOUT_FIXED = (
    '        <div class="wiki-char-article-rail">\n        </div>\n        <div class="wiki-char-layout'
)
OLD_MAIN_CLOSE = """          </article>
        </div>
        </div>
        </div>
        </div>
      </div>
    </main>"""
NEW_MAIN_CLOSE = """          </article>
        </div>
        </div>
        </div>
      </div>
    </main>"""


def fix_html(html: str) -> tuple[str, bool]:
    if "wiki-char-article-rail" not in html or LAYOUT_OPEN not in html:
        return html, False
    if 'wiki-char-article-rail">\n        </div>\n        <div class="wiki-char-layout' in html:
        return html, False

    updated = html
    changed = False

    if HERO_THEN_LAYOUT in updated:
        updated = updated.replace(HERO_THEN_LAYOUT, HERO_THEN_LAYOUT_FIXED, 1)
        changed = True
    elif EMPTY_RAIL_THEN_LAYOUT in updated:
        updated = updated.replace(EMPTY_RAIL_THEN_LAYOUT, EMPTY_RAIL_THEN_LAYOUT_FIXED, 1)
        changed = True
    else:
        return html, False

    if OLD_MAIN_CLOSE in updated:
        updated = updated.replace(OLD_MAIN_CLOSE, NEW_MAIN_CLOSE, 1)
    changed = updated != html
    return updated, changed


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "root",
        nargs="?",
        default=Path(__file__).resolve().parent.parent,
        type=Path,
    )
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    root: Path = args.root

    patterns = ["pages/**/index.html", "characters/**/index.html"]
    paths: list[Path] = []
    for pat in patterns:
        paths.extend(root.glob(pat))

    fixed = 0
    for path in sorted(set(paths)):
        try:
            original = path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue
        updated, did = fix_html(original)
        if not did:
            continue
        fixed += 1
        if not args.dry_run:
            path.write_text(updated, encoding="utf-8")
        rel = path.relative_to(root)
        print(f"{'would fix' if args.dry_run else 'fixed'}: {rel}")

    print(f"\n{'would fix' if args.dry_run else 'fixed'} {fixed} page(s)")


if __name__ == "__main__":
    main()
