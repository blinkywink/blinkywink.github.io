#!/usr/bin/env python3
"""Build assets/data/quiz_pool.json — images for Fortnite trivia quizzes."""

from __future__ import annotations

import json
import re
from pathlib import Path
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "assets" / "data"
OUT = DATA / "quiz_pool.json"

_WIKIA = "static.wikia.nocookie.net"
_JUNK = re.compile(r"noimage|spacer|logo\.png|brand-img|disambig", re.I)
_ICON_THUMB = re.compile(r"scale-to-width-down/(?:1[0-9]|2[0-5])\b|scale-to-width-down/30\b", re.I)
_TITLE_CARD = re.compile(r"titlecard|title.card|title_card|title-card", re.I)
_VIDEO_URL = re.compile(
    r"ytimg|youtube|video-thumbnail|Soundtrack|compilation|\(Clip\)",
    re.I,
)
MULTI_IMAGE_MIN_IMAGES = 12
CHARACTER_MIN_IMAGES = MULTI_IMAGE_MIN_IMAGES
EPISODE_MIN_IMAGES = MULTI_IMAGE_MIN_IMAGES
MAP_MIN_IMAGES = MULTI_IMAGE_MIN_IMAGES
WEAPON_MIN_IMAGES = 1
COSMETIC_MIN_IMAGES = 1
ITEM_MIN_IMAGES = 1

# Oninoshima POI wiki pages listed under Chapter 6 — locations, not seasons.
_EPISODE_SKIP_SLUGS = frozenset(
    {
        "creepy-camps",
        "gourdy-gate",
        "viney-shafts",
    }
)

_EPISODE_POOL_JUNK = re.compile(r"Nav_Seasons", re.I)
_EPISODE_IMAGE_JUNK = re.compile(
    r"_-_Weapon_-_Fortnite|Outfit_-_Fortnite|Glider_-_Fortnite|Pickaxe_-_Fortnite|"
    r"Emote_-_Fortnite|Emoticon_-_Fortnite|Wrap_-_Fortnite|Back_Bling|Arrow_Right|"
    r"V-Bucks|xp_boost|Schematic|Ammo_-_Fortnite|Trap_-_Fortnite|Item_-_Fortnite|"
    r"Quests_-_|Challenges_-_Icon|Battle_Pass.*Icon|Banners-Icons|Hashflag|"
    r"Free_Pass|Free_Challenges|Season_XP|Personal_xp|Friend_xp|Daily_Quests",
    re.I,
)
_EPISODE_IMAGE_GOOD = re.compile(
    r"Key[_ -]?Art|Keyart|Loading[_ ]Screen|_-_Logo_-_|Teaser|Lobby_Background|"
    r"Lobby_Screen|Promo_-_Fortnite|Trailer|Full\)|_\(Full\)|Event_-_Fortnite|"
    r"Battle_Pass_-_Fortnite|Chapter.*Loading|Chapter.*Key|Remix",
    re.I,
)
_CHARACTER_POOL_JUNK = re.compile(r"Fall_Guys|_-_Fall_Guys\.", re.I)
_MAP_POOL_JUNK = re.compile(
    r"Spray_-_Fortnite|Emoticon_-_Fortnite|Emote_-_Fortnite|"
    r"Back_Bling_-_Fortnite|Arrow_Right_-_Icon|Wrap_-_Fortnite|"
    r"Pickaxe_-_Fortnite|Outfit_-_Fortnite|Glider_-_Fortnite|"
    r"Hashflag|disambig|Schematic_-_Icon|Question_-_Icon",
    re.I,
)
_MAP_POOL_GOOD = re.compile(
    r"_Island_-_|_Location_-_|_Map_-_|_Landmark_-_|"
    r"Promo_-_Ballistic|Promo_-_Blitz|Unnamed_Location|_POI_-_",
    re.I,
)
_MAP_SKIP_DISPLAY = frozenset({"Map Gallery", "Map:Fortbytes", "Venture/Maps"})

_ITEM_WEAPON_HREF = re.compile(
    r"/weapons-battle-royale/|/weaponry|/ranged-weapons|/assault-weapons|"
    r"/shotguns/|/sniper-rifles|/submachine-guns|/bows/|/crossbows/|"
    r"/melee-weapons|/explosive-weapons|/marksman-rifles|/pistols/|"
    r"/ballistic/|/vehicles/",
    re.I,
)
_ITEM_WEAPON_IMAGE = re.compile(
    r"_-_Weapon_-_Fortnite|Weapon_-_Ballistic|_-_Vehicle_-_Fortnite|"
    r"Outfit_-_Fortnite|Emote_-_Fortnite|Pickaxe_-_Fortnite|Glider_-_Fortnite|"
    r"Wrap_-_Fortnite|Back_Bling|Schematic_-_Icon|Question_-_Icon|Hashflag",
    re.I,
)
_ITEM_POOL_GOOD = re.compile(
    r"_-_Item_-_Fortnite|_-_Trap_-_Fortnite|_-_Ammo_-_Fortnite|"
    r"_-_Resource_-_Fortnite|_-_Ingredient_-_Fortnite|_-_Power_-_Fortnite",
    re.I,
)

# Category / index hub pages — not individual quiz targets
_HUB_NAMES = frozenset(
    {
        "consumables (battle royale)",
        "backpack items",
        "assault weapons",
        "shotguns",
        "sniper rifles",
        "bows",
        "crossbows",
        "melee weapons",
        "explosive weapons",
        "mythic items",
        "outfits",
        "emotes",
        "gliders",
        "pickaxes",
        "back blings",
        "wraps",
        "lobby music",
        "loading screens",
        "sprays",
        "contrails",
        "banners",
        "vehicles",
        "traps",
        "healing items",
        "available items (spy games)",
        "weaponry (battle royale)",
        "ranged weapons",
        "pistols",
        "submachine guns",
        "marksman rifles",
    }
)


def _norm(url: str) -> str:
    u = (url or "").strip()
    u = re.sub(r"/scale-to-width-down/\d+", "", u, flags=re.I)
    u = re.sub(r"/scale-to-width/\d+", "", u, flags=re.I)
    return u.lower()


def _upgrade_image_url(url: str, width: int = 800) -> str:
    u = (url or "").strip()
    if not u:
        return u
    u = re.sub(r"/scale-to-width-down/\d+", f"/scale-to-width-down/{width}", u, flags=re.I)
    u = re.sub(r"/scale-to-width/\d+", f"/scale-to-width/{width}", u, flags=re.I)
    if _WIKIA in u and "/scale-to-width" not in u and "/revision/latest" in u:
        base, _, qs = u.partition("?")
        u = f"{base.rstrip('/')}/scale-to-width-down/{width}"
        if qs:
            u = f"{u}?{qs}"
    return u


def _good_url(url: str) -> bool:
    u = (url or "").strip()
    if not u or u.startswith("data:"):
        return False
    if _WIKIA not in u and not u.startswith("/assets/"):
        return False
    if _JUNK.search(u):
        return False
    return True


def _is_icon_thumb(url: str) -> bool:
    return bool(_ICON_THUMB.search(url or ""))


def _is_hub_row(display: str) -> bool:
    return (display or "").strip().lower() in _HUB_NAMES


def _img_srcs_from_attrs(blob: str) -> list[str]:
    out: list[str] = []
    for m in re.finditer(r'\b(?:src|data-src)=["\']([^"\']+)["\']', blob, re.I):
        out.append(m.group(1).strip())
    return out


def _strip_non_screenshot_html(html: str) -> str:
    chunk = html
    chunk = re.sub(r"<aside[\s\S]*?</aside>", " ", chunk, flags=re.I)
    chunk = re.sub(r"<noscript>[\s\S]*?</noscript>", " ", chunk, flags=re.I)
    chunk = re.sub(
        r'<details class="wiki-char-msection">\s*'
        r'<summary class="wiki-char-msection-sum">Videos</summary>[\s\S]*?</details>',
        " ",
        chunk,
        flags=re.I,
    )
    chunk = re.sub(
        r'<figure class="pi-item pi-image"[\s\S]*?</figure>',
        " ",
        chunk,
        flags=re.I,
    )
    chunk = re.sub(
        r'<a\b[^>]*(?:data-youtube-id|video-thumbnail)[^>]*>[\s\S]*?</a>',
        " ",
        chunk,
        flags=re.I,
    )
    return chunk


def _img_is_screenshot(*, img_tag: str, src: str, html: str, pos: int) -> bool:
    if re.search(r"data-video-name|data-video-key|pi-image-thumbnail", img_tag, re.I):
        return False
    if _TITLE_CARD.search(src):
        return False
    if _VIDEO_URL.search(src):
        return False
    if _is_icon_thumb(src):
        return False

    window = html[max(0, pos - 1200) : pos]
    if re.search(
        r"<a\b[^>]*(?:data-youtube-id|video-thumbnail)[^>]*>(?:(?!</a>).)*$",
        window,
        re.I | re.DOTALL,
    ):
        return False
    return True


def extract_quiz_images(html: str, *, exclude: set[str] | None = None) -> list[str]:
    exclude = exclude or set()
    main = re.search(r"<main\b[^>]*>([\s\S]*)</main>", html, re.I)
    chunk = main.group(1) if main else html
    chunk = _strip_non_screenshot_html(chunk)

    seen: set[str] = set()
    urls: list[str] = []

    for m in re.finditer(r"<img\b([^>]+)>", chunk, re.I):
        img_tag = m.group(0)
        for src in _img_srcs_from_attrs(m.group(1)):
            if not _good_url(src):
                continue
            if not _img_is_screenshot(img_tag=img_tag, src=src, html=chunk, pos=m.start()):
                continue
            key = _norm(src)
            if key in seen or key in exclude:
                continue
            seen.add(key)
            urls.append(_upgrade_image_url(src))

    return urls


def _is_episode_quiz_row(row: dict) -> bool:
    slug = (row.get("slug") or "").strip().lower()
    href = (row.get("href") or "").strip().lower()
    if slug in _EPISODE_SKIP_SLUGS:
        return False
    if "/oninoshima/" in href:
        return False
    return True


def _is_episode_pool_image(url: str) -> bool:
    """Season quiz visuals only — key art, loading screens, teasers, logos."""
    u = unquote(url or "")
    if _EPISODE_POOL_JUNK.search(u):
        return False
    if _EPISODE_IMAGE_JUNK.search(u):
        return False
    return bool(_EPISODE_IMAGE_GOOD.search(u))


def _episode_row_images(row: dict) -> list[str] | None:
    """Full season page image pool for trivia (no 24-image cap)."""
    if not _is_episode_quiz_row(row):
        return None

    href = row.get("href") or ""
    display = row.get("display") or ""
    if not href or not display:
        return None

    thumb = (row.get("img") or "").strip()
    exclude = {_norm(thumb)} if thumb else set()
    imgs: list[str] = []

    if _good_url(thumb) and not _is_icon_thumb(thumb) and _is_episode_pool_image(thumb):
        imgs.append(_upgrade_image_url(thumb))

    html = _read_html(href)
    if html:
        for url in extract_quiz_images(html, exclude=exclude):
            if _is_episode_pool_image(url) and url not in imgs:
                imgs.append(url)

    if len(imgs) < EPISODE_MIN_IMAGES:
        return None
    return imgs


def _read_html(href: str) -> str | None:
    path = ROOT / href.strip("/") / "index.html"
    if not path.is_file():
        path = ROOT / href.strip("/")
    if not path.is_file():
        return None
    try:
        return path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return None


def _row_images(
    row: dict,
    *,
    min_count: int,
    enrich_html: bool = True,
    card_only: bool = False,
) -> list[str] | None:
    href = row.get("href") or ""
    display = row.get("display") or ""
    if not href or not display or _is_hub_row(display):
        return None

    thumb = (row.get("img") or "").strip()
    exclude = {_norm(thumb)} if thumb else set()
    imgs: list[str] = []

    if _good_url(thumb) and not _is_icon_thumb(thumb):
        imgs.append(_upgrade_image_url(thumb))

    if card_only:
        return imgs if len(imgs) >= min_count else None

    if enrich_html and len(imgs) < max(min_count, 3):
        html = _read_html(href)
        if html:
            for url in extract_quiz_images(html, exclude=exclude):
                if url not in imgs:
                    imgs.append(url)
                if len(imgs) >= 24:
                    break

    if len(imgs) < min_count:
        return None
    return imgs[:24]


def _append_row(
    out: list[dict],
    seen: set[str],
    row: dict,
    imgs: list[str],
    *,
    category: str = "",
    category_title: str = "",
) -> None:
    href = row.get("href") or ""
    display = row.get("display") or ""
    if href in seen:
        return
    seen.add(href)
    entry: dict = {
        "display": display,
        "href": href,
        "images": imgs,
    }
    slug = row.get("slug")
    if slug:
        entry["slug"] = slug
    if category:
        entry["category"] = category
    if category_title:
        entry["categoryTitle"] = category_title
    out.append(entry)


def _build_from_index(
    path: Path,
    *,
    min_count: int,
    enrich_html: bool = True,
    card_only: bool = False,
) -> list[dict]:
    data = json.loads(path.read_text(encoding="utf-8"))
    seen: set[str] = set()
    out: list[dict] = []
    for group in data.get("groups") or []:
        for row in group.get("sets") or []:
            imgs = _row_images(
                row,
                min_count=min_count,
                enrich_html=enrich_html,
                card_only=card_only,
            )
            if imgs:
                _append_row(out, seen, row, imgs)
    return out


def _is_character_pool_image(url: str) -> bool:
    """Drop Fall Guys crossover renders — they appear on most outfit pages."""
    return not _CHARACTER_POOL_JUNK.search(unquote(url or ""))


def _character_row_images(row: dict) -> list[str] | None:
    href = row.get("href") or ""
    display = row.get("display") or ""
    if not href or not display:
        return None

    thumb = (row.get("img") or "").strip()
    exclude = {_norm(thumb)} if thumb else set()
    imgs: list[str] = []

    if _good_url(thumb) and not _is_icon_thumb(thumb) and _is_character_pool_image(thumb):
        imgs.append(_upgrade_image_url(thumb))

    html = _read_html(href)
    if html:
        for url in extract_quiz_images(html, exclude=exclude):
            if _is_character_pool_image(url) and url not in imgs:
                imgs.append(url)
            if len(imgs) >= 24:
                break

    if len(imgs) < CHARACTER_MIN_IMAGES:
        return None
    return imgs


def build_episodes() -> list[dict]:
    data = json.loads((DATA / "episodes_index.json").read_text(encoding="utf-8"))
    seen: set[str] = set()
    out: list[dict] = []
    for season in data.get("seasons") or []:
        for row in season.get("episodes") or []:
            if not _is_episode_quiz_row(row):
                continue
            imgs = _episode_row_images(row)
            if imgs:
                _append_row(out, seen, row, imgs)
    return out


def build_characters() -> list[dict]:
    data = json.loads((DATA / "characters.json").read_text(encoding="utf-8"))
    seen: set[str] = set()
    out: list[dict] = []
    for row in data.get("characters") or []:
        if not str(row.get("href") or "").startswith("/characters/"):
            continue
        imgs = _character_row_images(row)
        if imgs:
            _append_row(out, seen, row, imgs)
    return out


def build_sets() -> list[dict]:
    """Cosmetic quiz pool (emotes, pickaxes, gliders, etc.)."""
    return _build_from_index(
        DATA / "sets_index.json",
        min_count=COSMETIC_MIN_IMAGES,
        enrich_html=False,
        card_only=True,
    )


def build_weapons() -> list[dict]:
    data = json.loads((DATA / "weapons_index.json").read_text(encoding="utf-8"))
    seen: set[str] = set()
    out: list[dict] = []
    for group in data.get("groups") or []:
        category_id = (group.get("id") or group.get("groupKey") or "").strip()
        category_title = (group.get("title") or "").strip()
        for row in group.get("sets") or []:
            imgs = _row_images(
                row,
                min_count=WEAPON_MIN_IMAGES,
                enrich_html=False,
                card_only=True,
            )
            if imgs:
                _append_row(
                    out,
                    seen,
                    row,
                    imgs,
                    category=category_id,
                    category_title=category_title,
                )
    return out


def build_maps() -> list[dict]:
    data = json.loads((DATA / "maps_index.json").read_text(encoding="utf-8"))
    seen: set[str] = set()
    out: list[dict] = []
    for row in _select_map_rows(data):
        imgs = _map_row_images(row)
        if imgs:
            _append_row(out, seen, row, imgs)
    return out


    return imgs


def _map_base_name(display: str) -> str:
    d = (display or "").strip()
    if d.endswith("/Maps") or d.endswith("/maps"):
        return d.rsplit("/", 1)[0].strip()
    return d


def _is_map_pool_image(url: str) -> bool:
    u = unquote(url or "")
    if not u or not _good_url(u):
        return False
    if _MAP_POOL_JUNK.search(u):
        return False
    if _MAP_POOL_GOOD.search(u):
        return True
    if re.search(r"\(Icon\).*Island", u, re.I):
        return True
    return False


def _map_image_rank(url: str) -> int:
    u = unquote(url or "").lower()
    if "_island_-_" in u and "icon" not in u:
        return 0
    if "_map_-_" in u:
        return 1
    if "_location_-_" in u:
        return 2
    if "_landmark_-_" in u:
        return 3
    if "icon" in u and "_island_-_" in u:
        return 4
    return 5


def _select_map_rows(data: dict) -> list[dict]:
    """Prefer */Maps gallery pages over hub pages; one row per island name."""
    by_base: dict[str, dict] = {}
    for group in data.get("groups") or []:
        for row in group.get("sets") or []:
            display = (row.get("display") or "").strip()
            if not display or display in _MAP_SKIP_DISPLAY:
                continue
            base = _map_base_name(display)
            is_maps_page = display.endswith("/Maps") or display.endswith("/maps")
            key = base.lower()
            existing = by_base.get(key)
            if existing is None or is_maps_page:
                entry = dict(row)
                entry["display"] = base
                entry["_maps_page"] = is_maps_page
                by_base[key] = entry
    return list(by_base.values())


def _map_row_images(row: dict) -> list[str] | None:
    href = row.get("href") or ""
    display = row.get("display") or ""
    if not href or not display:
        return None

    thumb = (row.get("img") or "").strip()
    exclude = {_norm(thumb)} if thumb else set()
    imgs: list[str] = []

    if _is_map_pool_image(thumb):
        imgs.append(_upgrade_image_url(thumb))

    html = _read_html(href)
    if html:
        for url in extract_quiz_images(html, exclude=exclude):
            if _is_map_pool_image(url) and url not in imgs:
                imgs.append(url)

    if not imgs:
        return None

    imgs.sort(key=_map_image_rank)
    if len(imgs) < MAP_MIN_IMAGES:
        return None
    return imgs


    return imgs


def _weapon_hrefs() -> set[str]:
    path = DATA / "weapons_index.json"
    if not path.is_file():
        return set()
    data = json.loads(path.read_text(encoding="utf-8"))
    hrefs: set[str] = set()
    for group in data.get("groups") or []:
        for row in group.get("sets") or []:
            href = (row.get("href") or "").strip()
            if href:
                hrefs.add(href)
    return hrefs


def _is_item_quiz_row(row: dict, weapon_hrefs: set[str]) -> bool:
    display = (row.get("display") or "").strip()
    href = (row.get("href") or "").strip()
    if not href or not display or _is_hub_row(display):
        return False
    if href in weapon_hrefs or _ITEM_WEAPON_HREF.search(href):
        return False
    thumb = unquote(row.get("img") or "")
    if _ITEM_WEAPON_IMAGE.search(thumb):
        return False
    return True


def _is_item_pool_image(url: str) -> bool:
    u = unquote(url or "")
    if _ITEM_WEAPON_IMAGE.search(u):
        return False
    return bool(_ITEM_POOL_GOOD.search(u))


def _item_row_images(row: dict) -> list[str] | None:
    imgs = _row_images(row, min_count=ITEM_MIN_IMAGES, enrich_html=True)
    if not imgs:
        return None
    good = [u for u in imgs if _is_item_pool_image(u)]
    if len(good) < ITEM_MIN_IMAGES:
        return None
    return good[:24]


def build_items() -> list[dict]:
    weapon_hrefs = _weapon_hrefs()
    data = json.loads((DATA / "items_index.json").read_text(encoding="utf-8"))
    seen: set[str] = set()
    out: list[dict] = []
    for group in data.get("groups") or []:
        for row in group.get("sets") or []:
            if not _is_item_quiz_row(row, weapon_hrefs):
                continue
            imgs = _item_row_images(row)
            if imgs:
                _append_row(out, seen, row, imgs)
    return out


def main() -> None:
    payload = {
        "v": 2,
        "episodes": build_episodes(),
        "characters": build_characters(),
        "sets": build_sets(),
        "weapons": build_weapons(),
        "maps": build_maps(),
        "items": build_items(),
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(
        f"Wrote {OUT.name}: "
        f"{len(payload['episodes'])} seasons, "
        f"{len(payload['characters'])} outfits, "
        f"{len(payload['sets'])} cosmetics, "
        f"{len(payload['weapons'])} weapons, "
        f"{len(payload['maps'])} maps, "
        f"{len(payload['items'])} items"
    )


if __name__ == "__main__":
    main()
