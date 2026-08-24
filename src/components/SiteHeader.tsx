import { useEffect, useId, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  getLogoHomeId,
  logoHomePage,
  subscribeLogoHome,
} from "../lib/logoHome";
import { SITE_LOGO, SITE_NAME } from "../lib/brand";
import { AccountBar } from "./AccountBar";
import { TradeInbox } from "./TradeInbox";

const NAV = [
  { to: "/games", label: "Games" },
  { to: "/shop", label: "Shop" },
  { to: "/collection", label: "Cards" },
  { to: "/marketplace", label: "Market" },
  { to: "/leaderboard", label: "Leaderboard" },
] as const;

/** Fixed top bar - brand + main nav + account, stays on every screen. */
export function SiteHeader() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [logoHome, setLogoHome] = useState(() => logoHomePage(getLogoHomeId()));
  const menuId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);

  function onCardsNavClick(e: ReactMouseEvent<HTMLAnchorElement>) {
    if (pathname !== "/collection") return;
    e.preventDefault();
    navigate("/collection", {
      replace: true,
      state: { cardsHome: Date.now() },
    });
  }

  useEffect(() => subscribeLogoHome((id) => setLogoHome(logoHomePage(id))), []);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    function onPointer(e: Event) {
      const el = wrapRef.current;
      if (!el || !(e.target instanceof Node)) return;
      if (!el.contains(e.target)) setMenuOpen(false);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onPointer);
    window.addEventListener("touchstart", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onPointer);
      window.removeEventListener("touchstart", onPointer);
    };
  }, [menuOpen]);

  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link
          to={logoHome.path}
          className="site-header__brand"
          aria-label={`Go to ${logoHome.label}`}
        >
          <img
            className="site-header__logo"
            src={SITE_LOGO}
            alt=""
            height={66}
            draggable={false}
          />
          <span>{SITE_NAME}</span>
        </Link>

        <nav className="site-nav site-nav--desktop" aria-label="Main">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/collection"}
              onClick={item.to === "/collection" ? onCardsNavClick : undefined}
              className={({ isActive }) =>
                `site-nav__link${isActive ? " is-active" : ""}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="site-header__actions">
          <div className="site-nav-mobile" ref={wrapRef}>
            <button
              type="button"
              className={`site-nav-mobile__btn${menuOpen ? " is-open" : ""}`}
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              aria-controls={menuId}
              onClick={() => setMenuOpen((o) => !o)}
            >
              <span className="site-nav-mobile__bars" aria-hidden>
                <i />
                <i />
                <i />
              </span>
            </button>
            {menuOpen ? (
              <nav
                id={menuId}
                className="site-nav-mobile__panel"
                aria-label="Main"
              >
                {NAV.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === "/collection"}
                    onClick={item.to === "/collection" ? onCardsNavClick : undefined}
                    className={({ isActive }) =>
                      `site-nav-mobile__link${isActive ? " is-active" : ""}`
                    }
                  >
                    {item.label}
                  </NavLink>
                ))}
              </nav>
            ) : null}
          </div>
          <TradeInbox />
          <AccountBar />
        </div>
      </div>
    </header>
  );
}
