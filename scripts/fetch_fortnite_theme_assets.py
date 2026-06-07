#!/usr/bin/env python3
"""Download logo and hero images from the Fortnite Fandom wiki CDN."""

from __future__ import annotations

import json
import subprocess
import sys
import urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
API = "https://fortnite.fandom.com/api.php"

ASSET_SPECS = {
    "logo.png": "File:Fortnite Logo - Fortnite.png",
    "hero.png": "Drift",
    "hero-mobile.png": "Fortnite",
    "about-hero.png": "Drift",
    "about-hero-mobile.png": "Fortnite",
}


def api_get(params: dict[str, str]) -> dict:
    url = f"{API}?{urllib.parse.urlencode(params)}"
    raw = subprocess.check_output(["curl", "-fsSL", url], text=True)
    return json.loads(raw)


def file_url(title: str) -> str | None:
    data = api_get(
        {
            "action": "query",
            "format": "json",
            "titles": title,
            "prop": "pageimages|imageinfo",
            "piprop": "original|thumbnail",
            "pithumbsize": "1600",
            "iiprop": "url",
        }
    )
    pages = (data.get("query") or {}).get("pages") or {}
    for page in pages.values():
        if not isinstance(page, dict):
            continue
        if str(page.get("title", "")).startswith("File:"):
            info = (page.get("imageinfo") or [{}])[0]
            return info.get("url")
        orig = (page.get("original") or {}).get("source")
        thumb = (page.get("thumbnail") or {}).get("source")
        return orig or thumb
    return None


def download(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(["curl", "-fsSL", "-o", str(dest), url], check=True)
    print(f"Wrote {dest.name} ({dest.stat().st_size // 1024} KB)")


def main() -> int:
    for filename, title in ASSET_SPECS.items():
        url = file_url(title)
        if not url:
            print(f"Skip {filename}: no URL for {title!r}", file=sys.stderr)
            continue
        download(url, ASSETS / filename)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
