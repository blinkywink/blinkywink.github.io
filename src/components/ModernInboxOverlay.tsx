import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { isShopPath } from "../lib/mobileView";
import { TradeInbox } from "./TradeInbox";

/** Trade/market inbox for Modern mobile chrome (classic uses SiteHeader). */
export function ModernInboxOverlay() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  if (!user) return null;

  const withCash = isShopPath(pathname);

  return createPortal(
    <div
      className={`modern-inbox-overlay${withCash ? " modern-inbox-overlay--with-cash" : ""}`}
    >
      <TradeInbox className="trade-inbox--modern" />
    </div>,
    document.body,
  );
}
