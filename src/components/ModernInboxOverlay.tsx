import { useAuth } from "../auth/AuthProvider";
import { TradeInbox } from "./TradeInbox";

/** Mobile inbox sheet (trigger is the profile tab badge). */
export function ModernInboxOverlay() {
  const { user } = useAuth();
  if (!user) return null;

  return (
    <div className="modern-inbox-overlay" aria-hidden={!user}>
      <TradeInbox variant="mobile" />
    </div>
  );
}
