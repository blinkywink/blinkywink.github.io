"""
Extract plain-text excerpt and best thumbnail URL from mirrored wiki/character HTML.

Used when building assets/data/wiki_search_index.json for homepage search.
"""

from __future__ import annotations

import html as html_std
import re

# Generic hero fallbacks from manifest — try to replace with real imagery
_FALLBACK_THUMBS = frozenset(
    {
        "/assets/hero.png",
        "/assets/hero-mobile.png",
        "",
    }
)

_WIKIA_CDN = "static.wikia.nocookie.net"


def _is_junk_thumb_url(url: str) -> bool:
    """URLs that should not be used as search preview thumbs."""
    u = (url or "").strip().lower()
    if not u or u.startswith("data:"):
        return True
    if u in _FALLBACK_THUMBS:
        return True
    if "/assets/logo" in u or "brand-img" in u:
        return True
    if "spacer" in u:
        return True
    # Fandom placeholder / missing image
    if "noimage" in u:
        return True
    return False


def _img_urls_from_attributes(attr_blob: str) -> list[str]:
    """Ordered candidates: real src, then lazy data-src."""
    out: list[str] = []
    sm = re.search(r'\bsrc=["\']([^"\']+)["\']', attr_blob, re.I)
    if sm:
        out.append(sm.group(1).strip())
    dm = re.search(r'\bdata-src=["\']([^"\']+)["\']', attr_blob, re.I)
    if dm:
        out.append(dm.group(1).strip())
    return out


def _first_good_wikia_from_img_tags(chunk: str) -> str | None:
    for m in re.finditer(r"<img\b([^>]+)>", chunk, re.I):
        for cand in _img_urls_from_attributes(m.group(1)):
            if _WIKIA_CDN in cand and not _is_junk_thumb_url(cand):
                return cand
    return None


def _strip_tags_to_text(s: str, max_scan: int = 12000) -> str:
    s = s[:max_scan]
    s = re.sub(r"<script[\s\S]*?</script>", " ", s, flags=re.I)
    s = re.sub(r"<style[\s\S]*?</style>", " ", s, flags=re.I)
    s = re.sub(r"<[^>]+>", " ", s)
    t = html_std.unescape(s)
    t = re.sub(r"\s+", " ", t).strip()
    return t


def _first_substantial_p_html(block: str, min_text: int = 42) -> str:
    """Prefer first <p> whose visible text is long enough (skip empty / hatnotes)."""
    for pm in re.finditer(r"<p[^>]*>([\s\S]*?)</p>", block, re.I):
        inner = pm.group(1)
        t = _strip_tags_to_text(inner, 8000)
        if len(t) >= min_text:
            return inner
    return block[:8000]


def excerpt_from_mirror_html(html: str, max_len: int = 118) -> str:
    """First readable bit of article body; word-trimmed + '...' if over max_len."""
    chunk: str | None = None
    sm = re.search(r'class="wiki-char-overview-prose[^"]*"[^>]*>', html, re.I)
    if sm:
        raw = html[sm.end() : sm.end() + 14000]
        raw = re.sub(r"<aside[\s\S]*?</aside>", " ", raw, flags=re.I)
        raw = re.sub(r"<dl[\s\S]*?</dl>", " ", raw, count=4, flags=re.I)
        raw = re.sub(r'<div[^>]*class="[^"]*\bquote\b[^"]*"[\s\S]*?</div>\s*</div>', " ", raw, count=3, flags=re.I)
        chunk = _first_substantial_p_html(raw)
    if not chunk:
        m = re.search(
            r'class="wiki-char-overview-prose[^"]*"[^>]*>([\s\S]*?)(?=</div>\s*<details|</div>\s*</section>\s*<section\s+id="panel-)',
            html,
            re.I,
        )
        if m:
            chunk = m.group(1)
    if not chunk:
        am = re.search(
            r'<article[^>]+class="[^"]*wiki-char-article[^"]*"[^>]*>([\s\S]*?)</article>',
            html,
            re.I,
        )
        body = am.group(1) if am else None
        if not body:
            mm = re.search(r"<main[^>]*>([\s\S]*?)</main>", html, re.I)
            body = mm.group(1) if mm else html
        body = re.sub(r"<aside[\s\S]*?</aside>", " ", body, flags=re.I)
        body = re.sub(r'<nav[^>]*wiki-char-breadcrumb[\s\S]*?</nav>', " ", body, flags=re.I)
        body = re.sub(
            r'<div[^>]+class="[^"]*\bwiki-char-hero\b[^"]*"[\s\S]*?</div>\s*</div>\s*</div>',
            " ",
            body,
            flags=re.I,
        )
        body = re.sub(
            r'<div[^>]+class="[^"]*\btoc\b[^"]*"[\s\S]*?</div>\s*</div>',
            " ",
            body,
            flags=re.I,
        )
        chunk = body
    text = _strip_tags_to_text(chunk or "", 14000)
    text = re.sub(r"^Contents\s+[\d.\s]+\s*", "", text, flags=re.I).strip()
    text = re.sub(
        r"^For other uses, see .+?\.\s*",
        "",
        text,
        flags=re.I,
    )
    text = re.sub(
        r"^This article is about .+?\.\s*For .+?, see .+?\.\s*",
        "",
        text,
        flags=re.I,
    )
    if not text:
        return ""
    if len(text) <= max_len:
        return text
    cut = text[: max_len + 1]
    sp = cut.rfind(" ")
    if sp > max_len // 2:
        cut = cut[:sp]
    else:
        cut = cut[:max_len]
    return cut.rstrip(" ,.;:") + "..."


def _normalize_card_thumb(url: str, width: int = 220) -> str:
    u = (url or "").strip()
    if not u or _WIKIA_CDN not in u:
        return u
    if "scale-to-width-down/" in u:
        return re.sub(r"scale-to-width-down/\d+", f"scale-to-width-down/{width}", u)
    base, _, qs = u.partition("?")
    if "/revision/latest" in base:
        base = re.sub(r"/revision/latest(?:/scale-to-width-down/\d+)?$", f"/revision/latest/scale-to-width-down/{width}", base)
    return base + (f"?{qs}" if qs else "")


def outfit_card_thumb_from_mirror_html(html: str, fallback: str | None = None) -> str | None:
    """Outfit browse card: prefer Featured render from the hero infobox image tabber."""
    block = None
    hero_m = re.search(
        r'<div class="wiki-char-hero-card[^"]*"[\s\S]*?<aside\b[^>]*\bportable-infobox\b[^>]*>([\s\S]*?)</aside>',
        html,
        re.I,
    )
    if hero_m:
        block = hero_m.group(1)
    else:
        infobox_m = re.search(r'<aside[^>]*\bportable-infobox\b[^>]*>([\s\S]{0,56000})</aside>', html, re.I)
        if infobox_m:
            block = infobox_m.group(1)

    if block:
        coll_m = re.search(
            r'data-source=["\']image["\'][\s\S]{0,14000}?(?=</section>|<h2 class="pi-item pi-header|data-source=["\']featured["\'])',
            block,
            re.I,
        )
        chunk = coll_m.group(0) if coll_m else block
        featured_hit = None
        thumb_hit = None
        for m in re.finditer(r"<img\b([^>]+)>", chunk, re.I):
            attrs = m.group(1)
            if "pi-image-thumbnail" not in attrs:
                continue
            for cand in _img_urls_from_attributes(attrs):
                if _WIKIA_CDN not in cand or _is_junk_thumb_url(cand):
                    continue
                if not thumb_hit:
                    thumb_hit = cand
                if re.search(r'alt=["\']Featured["\']', attrs, re.I):
                    featured_hit = cand
                    break
                if re.search(r"Featured", attrs) and "Outfit" in attrs:
                    featured_hit = cand
                    break
            if featured_hit:
                break
        if featured_hit:
            return _normalize_card_thumb(featured_hit)
        if thumb_hit:
            return _normalize_card_thumb(thumb_hit)

    extracted = thumb_from_mirror_html(html, fallback)
    return _normalize_card_thumb(extracted) if extracted else None


def thumb_from_mirror_html(html: str, existing: str | None) -> str | None:
    """Prefer infobox / hero / overview / og:image / gallery over generic hero / placeholders."""
    ex = (existing or "").strip()
    if ex and not _is_junk_thumb_url(ex) and ex not in _FALLBACK_THUMBS:
        return ex

    og = re.search(
        r'<meta\s+property=["\']og:image["\']\s+content=["\']([^"\']+)["\']',
        html,
        re.I,
    )
    if og:
        u = og.group(1).strip()
        if u and not _is_junk_thumb_url(u):
            return u

    # Portable infobox / pi-image: capture full <img ...> for src + data-src (lazy)
    infobox = re.search(r'<aside[^>]*\bportable-infobox\b[^>]*>([\s\S]{0,24000})</aside>', html, re.I)
    if infobox:
        hit = _first_good_wikia_from_img_tags(infobox.group(1))
        if hit:
            return hit

    patterns_src_only = (
        r'class="[^"]*wiki-char-hero-card[^"]*"[\s\S]{0,18000}?<img\b([^>]+)>',
        r'class="[^"]*wiki-char-overview-prose[^"]*"[\s\S]{0,14000}?<img\b([^>]+)>',
        r'<figure[^>]*class="[^"]*pi-image[^"]*"[\s\S]{0,6000}?<img\b([^>]+)>',
    )
    for pat in patterns_src_only:
        mm = re.search(pat, html, re.I)
        if not mm:
            continue
        for cand in _img_urls_from_attributes(mm.group(1)):
            if cand and not _is_junk_thumb_url(cand) and not cand.startswith("data:"):
                return cand

    # Wikia galleries often put the real URL inside <noscript><img src=...>
    for nsm in re.finditer(r"<noscript>([\s\S]{0,8000}?)</noscript>", html, re.I):
        hit = _first_good_wikia_from_img_tags(nsm.group(1))
        if hit:
            return hit

    # Article body: first substantial Wikia image (skip header chrome — <main> only)
    mainm = re.search(r"<main\b[^>]*>([\s\S]{0,280000})</main>", html, re.I)
    if mainm:
        hit = _first_good_wikia_from_img_tags(mainm.group(1))
        if hit:
            return hit

    if ex and ex not in _FALLBACK_THUMBS and not _is_junk_thumb_url(ex):
        return ex
    return None
