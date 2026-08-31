import { useAuth } from "../auth/AuthProvider";
import { useIsCompactViewport, useMobileView } from "./MobileAppNav";
import { isNativeShell } from "../lib/nativeShell";
import { setTradeInboxSlot } from "../lib/tradeInboxUi";
import { TradeInbox } from "./TradeInbox";

function useModernMobileChrome() {
  const compact = useIsCompactViewport();
  const mobileView = useMobileView();
  return isNativeShell() || (compact && mobileView === "modern");
}

/** Keep inbox polling on every tab so the You-tab badge stays live. */
export function MobileInboxHost() {
  const { user } = useAuth();
  const modernMobile = useModernMobileChrome();
  if (!user || !modernMobile) return null;
  return <TradeInbox variant="mobile" />;
}

/** Inline slot at the top of Profile — the host portals the panel here. */
export function MobileInboxSlot() {
  const { user } = useAuth();
  const modernMobile = useModernMobileChrome();
  if (!user || !modernMobile) return null;
  return (
    <div
      className="mobile-inbox-strip mobile-inbox-strip--profile"
      ref={(el) => setTradeInboxSlot(el)}
    />
  );
}
