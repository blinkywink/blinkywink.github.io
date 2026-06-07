"""Shared header, footer, and nav markup for the Fortnite wiki site."""

from __future__ import annotations

SITE_NAME = "Fortnite Wiki Project"
THEME_COLOR = "#12081c"
LOGO_SRC = "/assets/logo.png"

NAV_LINKS = """
          <a href="/characters">Outfits</a>
          <a href="/episodes">Seasons</a>
          <a href="/weapons">Items</a>
          <a href="/sets">Cosmetics</a>
          <a href="/media">Media</a>
          <a href="/trivia" class="nav-link--featured">Trivia <span class="nav-badge">New</span></a>
          <a href="/all-pages">All Pages</a>"""

FOOTER_LINE = "Fan-made Fortnite wiki. Not affiliated with Epic Games."


def header_html() -> str:
    return f"""    <header class="site-header">
      <div class="container header-inner">
        <a class="brand" href="/">
          <span class="brand-mark" aria-hidden="true">
            <img class="brand-img" src="{LOGO_SRC}" alt="Fortnite Wiki Project" loading="eager" decoding="async" />
          </span>
          <span class="brand-text">Wiki</span>
        </a>

        <input class="menu-toggle" type="checkbox" id="menu-toggle" />
        <label class="menu-button" for="menu-toggle" aria-label="Open navigation" role="button">
          <span class="menu-button-lines" aria-hidden="true">
            <span></span>
          </span>
        </label>

        <nav class="nav" aria-label="Primary">
{NAV_LINKS}
        </nav>
      </div>
    </header>"""


def footer_html() -> str:
    return f"""    <footer class="site-footer">
      <div class="container footer-inner footer-inner--min">
        <div class="footer-left">
          <div class="footer-meta">
            <div class="footer-line footer-line--muted">{FOOTER_LINE}</div>
          </div>
        </div>
        <div class="footer-links" aria-label="Footer links">
          <a class="footer-link" href="/about">About</a>
          <a class="footer-link" href="https://www.epicgames.com/fortnite" rel="noopener noreferrer" target="_blank">Epic Games</a>
        </div>
      </div>
    </footer>"""
