import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { useCardCollection } from "../auth/CardCollectionProvider";
import { awardCoins } from "../lib/awardCoins";
import {
  DAILY_CASH_AMOUNT,
  formatDailyCountdown,
  msUntilDailyRefresh,
  todaysDailyCard,
} from "../lib/dailyReward";
import { duplicateCashForCard } from "../lib/packPull";
import { formatPathLevels } from "../lib/pathCombos";
import { MonkeyCard } from "./MonkeyCard";

type Props = {
  /** Bigger banner for the games home on first login. */
  variant?: "hero" | "inline";
};

/** Daily Cash + shared daily card — same card for everyone that UTC day. */
export function DailyClaimButton({ variant = "inline" }: Props) {
  const {
    isGuest,
    dailyClaimAvailable,
    claimDailyCash,
    ready,
    setCoinBalance,
  } = useAuth();
  const { owned, awardCards } = useCardCollection();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(() => msUntilDailyRefresh());
  const [dayKey, setDayKey] = useState(() => todaysDailyCard().dayKey);

  useEffect(() => {
    const tick = () => {
      setRemaining(msUntilDailyRefresh());
      const next = todaysDailyCard().dayKey;
      setDayKey((prev) => (prev === next ? prev : next));
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  if (!ready || isGuest) return null;

  const daily = todaysDailyCard();
  // Refresh local pick if the UTC day rolled over.
  const reward = daily.dayKey === dayKey ? daily : todaysDailyCard();
  const alreadyOwnCard = owned.has(reward.card.id);

  async function onClaim() {
    setBusy(true);
    setNote(null);
    const result = await claimDailyCash();
    if (result.error) {
      setBusy(false);
      setNote(result.error);
      return;
    }

    const cashAmount = result.amount ?? DAILY_CASH_AMOUNT;
    if (typeof result.coins === "number") {
      setCoinBalance(result.coins);
    }

    let cardNote: string;
    if (owned.has(reward.card.id)) {
      const dup = duplicateCashForCard(reward.card);
      const bal = await awardCoins(dup);
      if (bal != null) setCoinBalance(bal);
      cardNote = `Already owned · +${dup.toLocaleString()} Cash`;
    } else {
      await awardCards([reward.card.id]);
      cardNote = `${reward.card.entity.name} unlocked`;
    }

    setBusy(false);
    setNote(`+${cashAmount.toLocaleString()} Cash · ${cardNote}`);
  }

  const readyClass = dailyClaimAvailable ? " is-ready" : "";
  const variantClass = variant === "hero" ? " daily-rewards--hero" : "";

  return (
    <section
      className={`daily-rewards${variantClass}${readyClass}`}
      aria-label="Daily rewards"
    >
      <header className="daily-rewards__head">
        <div className="daily-rewards__copy">
          <p className="daily-rewards__eyebrow">Daily rewards</p>
          <h2 className="daily-rewards__title">
            {dailyClaimAvailable || busy
              ? "Today’s free drop"
              : "Claimed for today"}
          </h2>
          <p className="daily-rewards__blurb">
            Same card for everyone · T3 most days · 10% T4
          </p>
        </div>
        <p className="daily-rewards__timer" aria-live="polite">
          Refreshes in <strong>{formatDailyCountdown(remaining)}</strong>
        </p>
      </header>

      <div className="daily-rewards__row">
        <article className="daily-rewards__slot daily-rewards__slot--cash">
          <div className="daily-rewards__cash-face" aria-hidden>
            <img
              src="/images/ui/money-icon.webp"
              alt=""
              width={56}
              height={56}
            />
          </div>
          <p className="daily-rewards__slot-label">Cash</p>
          <p className="daily-rewards__slot-value">
            +{DAILY_CASH_AMOUNT.toLocaleString()}
          </p>
        </article>

        <article
          className={`daily-rewards__slot daily-rewards__slot--card${
            reward.tier === 4 ? " is-t4" : ""
          }`}
        >
          <div className="daily-rewards__card-wrap">
            <MonkeyCard
              entity={reward.card.entity}
              pathLevels={reward.card.pathLevels}
              mode="preview"
              owned
            />
          </div>
          <p className="daily-rewards__slot-label">
            Daily card · T{reward.tier}
            {alreadyOwnCard ? " · owned" : ""}
          </p>
          <p className="daily-rewards__slot-value">
            {reward.card.entity.name}
          </p>
          <p className="daily-rewards__slot-sub">
            {formatPathLevels(reward.card.pathLevels)} · {reward.card.tower}
          </p>
        </article>
      </div>

      <div className="daily-rewards__actions">
        <button
          type="button"
          className={`arcade-link-btn arcade-link-btn--daily${readyClass}`}
          onClick={() => void onClaim()}
          disabled={busy || !dailyClaimAvailable}
        >
          {busy
            ? "Claiming…"
            : dailyClaimAvailable
              ? "Claim rewards"
              : "Claimed today"}
        </button>
        {note ? <p className="daily-rewards__note">{note}</p> : null}
      </div>
    </section>
  );
}
