import { Link } from "react-router-dom";
import { AccountBar } from "./AccountBar";
import { TradeInbox } from "./TradeInbox";

/** Fixed top bar — brand + account, stays on every screen. */
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
        <div className="site-header__actions">
          <TradeInbox />
          <AccountBar />
        </div>
      </div>
    </header>
  );
}
