import { useState } from "react";
import { useAuth } from "../auth/AuthProvider";

type Props = {
  /** Bigger banner for the games home on first login. */
  variant?: "hero" | "inline";
};

/** Daily Cash claim — prominent when available, hidden for guests. */
export function DailyClaimButton({ variant = "inline" }: Props) {
  const { isGuest, dailyClaimAvailable, claimDailyCash, ready } = useAuth();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [justClaimed, setJustClaimed] = useState(false);

  if (!ready || isGuest) return null;

  // Hero only when there's something to claim (or we just claimed and want feedback).
  if (variant === "hero" && !dailyClaimAvailable && !justClaimed && !note) {
    return null;
  }

  async function onClaim() {
    setBusy(true);
    setNote(null);
    const result = await claimDailyCash();
    setBusy(false);
    if (result.error) {
      setNote(result.error);
      return;
    }
    const amount = result.amount ?? 500;
    setNote(`+${amount.toLocaleString()} Cash`);
    setJustClaimed(true);
  }

  const readyClass = dailyClaimAvailable ? " is-ready" : "";
  const variantClass = variant === "hero" ? " daily-claim--hero" : "";

  return (
    <section
      className={`daily-claim${variantClass}${readyClass}`}
      aria-label="Daily reward"
    >
      {variant === "hero" ? (
        <div className="daily-claim__copy">
          <p className="daily-claim__eyebrow">Daily reward</p>
          <h2 className="daily-claim__title">
            {dailyClaimAvailable || busy
              ? "Free 500 Cash waiting"
              : "Daily Cash claimed"}
          </h2>
          <p className="daily-claim__blurb">
            {dailyClaimAvailable || busy
              ? "Claim it before you hop into a game."
              : "Come back tomorrow for another drop."}
          </p>
        </div>
      ) : null}

      <button
        type="button"
        className={`arcade-link-btn arcade-link-btn--daily${readyClass}`}
        onClick={() => void onClaim()}
        disabled={busy || !dailyClaimAvailable}
      >
        {busy
          ? "Claiming…"
          : dailyClaimAvailable
            ? "Claim 500 Cash"
            : "Claimed today"}
      </button>
      {note ? <p className="daily-claim__note">{note}</p> : null}
    </section>
  );
}
