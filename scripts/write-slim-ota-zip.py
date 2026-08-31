#!/usr/bin/env python3
"""Deterministic slim Capgo zip: index.html + assets/ only. Prints sha256.

Art/music stay in the IPA/APK public folder and are served from disk.
"""

from __future__ import annotations

import hashlib
import sys
import zipfile
from pathlib import Path

FIXED = (2020, 1, 1, 0, 0, 0)


def add(zf: zipfile.ZipFile, arcname: str, data: bytes) -> None:
    info = zipfile.ZipInfo(arcname.replace("\\", "/"), date_time=FIXED)
    info.compress_type = zipfile.ZIP_DEFLATED
    info.external_attr = 0o644 << 16
    zf.writestr(info, data)


def main() -> None:
    if len(sys.argv) != 3:
        sys.stderr.write("usage: write-slim-ota-zip.py <dist> <out.zip>\n")
        sys.exit(2)
    dist = Path(sys.argv[1])
    out = Path(sys.argv[2])
    index = dist / "index.html"
    assets = dist / "assets"
    if not index.is_file() or not assets.is_dir():
        sys.stderr.write("dist/index.html or dist/assets missing\n")
        sys.exit(1)
    out.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(out, "w") as zf:
        add(zf, "index.html", index.read_bytes())
        for path in sorted(assets.rglob("*")):
            if not path.is_file() or path.name == ".DS_Store":
                continue
            rel = path.relative_to(dist).as_posix()
            add(zf, rel, path.read_bytes())
    digest = hashlib.sha256(out.read_bytes()).hexdigest()
    sys.stdout.write(digest + "\n")


if __name__ == "__main__":
    main()
