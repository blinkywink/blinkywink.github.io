import { Link, NavLink } from "react-router-dom";
import { AccountBar } from "./AccountBar";
import { TradeInbox } from "./TradeInbox";

const NAV = [
  { to: "/collection", label: "Cards" },
  { to: "/marketplace", label: "Market" },
  { to: "/leaderboard", label: "Board" },
] as const;

/** Fixed top bar — brand + main nav + account, stays on every screen. */
export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link
          to="/"
          className="site-header__brand"
          aria-label="blinkywink.co home"
        >
          <img
            className="site-header__logo"
            src="/images/ui/site-logo.png"
            alt=""
            width={36}
            height={36}
            draggable={false}
          />
          <span>blinkywink.co</span>
        </Link>

        <nav className="site-nav" aria-label="Main">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `site-nav__link${isActive ? " is-active" : ""}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="site-header__actions">
          <TradeInbox />
          <AccountBar />
        </div>
      </div>
    </header>
  );
}
