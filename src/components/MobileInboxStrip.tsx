import { useEffect } from "react";
import { useAuth } from "../auth/AuthProvider";
import { useIsCompactViewport } from "./MobileAppNav";
import { isNativeShell } from "../lib/nativeShell";
import { setTradeInboxUiOpen } from "../lib/tradeInboxUi";
import { TradeInbox } from "./TradeInbox";

/** Inbox strip at the top of the profile page (inline, not a global overlay). */
export function MobileInboxStrip() {
  const { user } = useAuth();
  const compact = useIsCompactViewport();
  const native = isNativeShell();

  useEffect(() => {
    return () => setTradeInboxUiOpen(false);
  }, []);

  if (!user) return null;
  if (!native && !compact) return null;

  return (
    <div className="mobile-inbox-strip mobile-inbox-strip--profile">
      <TradeInbox variant="mobile" />
    </div>
  );
}
