import { useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import {
  useIsCompactViewport,
  useMobileView,
} from "./MobileAppNav";
import { showsMobileAppNav } from "../lib/mobileView";
import { isNativeShell } from "../lib/nativeShell";
import { TradeInbox } from "./TradeInbox";

/** Mobile inbox strip at the top of the page (not a modal). */
export function MobileInboxStrip() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const compact = useIsCompactViewport();
  const view = useMobileView();
  const native = isNativeShell();
  const show =
    user &&
    (native || (compact && view === "modern" && showsMobileAppNav(pathname)));

  if (!show) return null;

  return (
    <div className="mobile-inbox-strip">
      <TradeInbox variant="mobile" />
    </div>
  );
}
