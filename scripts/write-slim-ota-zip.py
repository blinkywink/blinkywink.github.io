#!/usr/bin/env python3
"""Deterministic slim Capgo zip: index.html + assets/ only. Prints sha256."""

from __future__ import annotations

import hashlib
import re
import sys
import zipfile
from pathlib import Path

CDN = "https://monkeycards.pages.dev"
FIXED = (2020, 1, 1, 0, 0, 0)
TEXT_SUFFIX = {".html", ".js", ".css", ".json", ".txt", ".svg", ".map"}


def rewrite_media(text: str) -> str:
    text = text.replace(f"{CDN}/images/", "\x00IMG\x00")
    text = text.replace(f"{CDN}/sounds/", "\x00SND\x00")
    text = text.replace(f"{CDN}/music/", "\x00MUS\x00")
    text = re.sub(r'(["\'`(=/])\/images\/', rf"\1{CDN}/images/", text)
    text = re.sub(r'(["\'`(=/])\/sounds\/', rf"\1{CDN}/sounds/", text)
    text = re.sub(r'(["\'`(=/])\/music\/', rf"\1{CDN}/music/", text)
    text = text.replace("\x00IMG\x00", f"{CDN}/images/")
    text = text.replace("\x00SND\x00", f"{CDN}/sounds/")
    text = text.replace("\x00MUS\x00", f"{CDN}/music/")
    return text


def add(zf: zipfile.ZipFile, arcname: str, data: bytes) -> None:
    info = zipfile.ZipInfo(arcname.replace("\\", "/"), date_time=FIXED)
    info.compress_type = zipfile.ZIP_DEFLATED
    info.external_attr = 0o644 << 16
    zf.writestr(info, data)


def maybe_rewrite(path: Path, data: bytes) -> bytes:
    if path.suffix.lower() not in TEXT_SUFFIX:
        return data
    try:
        return rewrite_media(data.decode("utf-8")).encode("utf-8")
    except UnicodeDecodeError:
        return data


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
        add(zf, "index.html", maybe_rewrite(index, index.read_bytes()))
        for path in sorted(assets.rglob("*")):
            if not path.is_file() or path.name == ".DS_Store":
                continue
            rel = path.relative_to(dist).as_posix()
            add(zf, rel, maybe_rewrite(path, path.read_bytes()))
    digest = hashlib.sha256(out.read_bytes()).hexdigest()
    sys.stdout.write(digest + "\n")


if __name__ == "__main__":
    main()
