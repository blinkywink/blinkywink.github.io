import { createPortal } from "react-dom";
import { useAuth } from "../auth/AuthProvider";
import { CurrencyChip } from "./CurrencyChip";

/** Floating cash readout for Modern mobile Shop + Market. */
export function ShopCashOverlay() {
  const { user, profile } = useAuth();
  if (profile == null) return null;

  return createPortal(
    <div className="shop-cash-overlay" aria-live="polite">
      <CurrencyChip
        amount={profile.coins}
        resetKey={user?.id ?? "guest"}
      />
    </div>,
    document.body,
  );
}
