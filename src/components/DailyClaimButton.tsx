import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { useCardCollection } from "../auth/CardCollectionProvider";
import {
  DAILY_CASH_AMOUNT,
  formatDailyCountdown,
  msUntilDailyRefresh,
  todaysDailyCard,
} from "../lib/dailyReward";
import { formatPathLevels } from "../lib/pathCombos";
import { MonkeyCard } from "./MonkeyCard";

type Props = {
  /** Slightly roomier layout for the games home. */
  variant?: "hero" | "inline";
};

/** Daily Cash + shared daily card — claimable separately. */
export function DailyClaimButton({ variant = "inline" }: Props) {
  const {
    isGuest,
    dailyClaimAvailable,
    dailyCardClaimAvailable,
    claimDailyCash,
    claimDailyCard,
    ready,
    setCoinBalance,
  } = useAuth();
  const { owned, awardCards } = useCardCollection();
  const [cashBusy, setCashBusy] = useState(false);
  const [cardBusy, setCardBusy] = useState(false);
  const [cashNote, setCashNote] = useState<string | null>(null);
  const [cardNote, setCardNote] = useState<string | null>(null);
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
  const reward = daily.dayKey === dayKey ? daily : todaysDailyCard();
  const alreadyOwnCard = owned.has(reward.card.id);
  const cashClaimed = !dailyClaimAvailable;
  const cardClaimed = !dailyCardClaimAvailable;
  const cardLocked = alreadyOwnCard || cardClaimed;

  async function onClaimCash() {
    setCashBusy(true);
    setCashNote(null);
    const result = await claimDailyCash();
    setCashBusy(false);
    if (result.error) {
      setCashNote(result.error);
      return;
    }
    if (typeof result.coins === "number") setCoinBalance(result.coins);
    setCashNote(`+${(result.amount ?? DAILY_CASH_AMOUNT).toLocaleString()} Cash`);
  }

  async function onClaimCard() {
    if (alreadyOwnCard) return;
    setCardBusy(true);
    setCardNote(null);
    const result = await claimDailyCard();
    if (result.error) {
      setCardBusy(false);
      setCardNote(result.error);
      return;
    }
    await awardCards([reward.card.id]);
    setCardBusy(false);
    setCardNote(`${reward.card.entity.name} unlocked`);
  }

  return (
    <section
      className={`daily-rewards${variant === "hero" ? " daily-rewards--hero" : ""}`}
      aria-label="Daily rewards"
    >
      <div className="pack-shelf__head">
        <h3 className="section-label">Daily rewards</h3>
        <p className="shop-timer" aria-live="polite">
          Refresh in <strong>{formatDailyCountdown(remaining)}</strong>
        </p>
      </div>

      <div className="daily-rewards__row">
        <article
          className={`daily-rewards__slot${cashClaimed ? " is-claimed" : ""}`}
        >
          <div className="daily-rewards__cash-face" aria-hidden>
            <img
              src="/images/ui/money-icon.webp"
              alt=""
              width={72}
              height={72}
            />
          </div>
          <p className="daily-rewards__slot-label">Cash</p>
          <p className="daily-rewards__slot-value">
            +{DAILY_CASH_AMOUNT.toLocaleString()}
          </p>
          <button
            type="button"
            className="btn btn--primary btn--sm"
            disabled={cashBusy || cashClaimed}
            onClick={() => void onClaimCash()}
          >
            {cashBusy ? "Claiming…" : cashClaimed ? "Claimed" : "Claim"}
          </button>
          {cashNote ? <p className="daily-rewards__note">{cashNote}</p> : null}
        </article>

        <article
          className={`daily-rewards__slot${cardLocked ? " is-claimed" : ""}`}
        >
          <div className="daily-rewards__card-wrap">
            <MonkeyCard
              entity={reward.card.entity}
              pathLevels={reward.card.pathLevels}
              mode="preview"
              owned={!cardLocked}
            />
          </div>
          <p className="daily-rewards__slot-label">
            Daily card · T{reward.tier}
          </p>
          <p className="daily-rewards__slot-value">
            {reward.card.entity.name}
          </p>
          <p className="daily-rewards__slot-sub">
            {formatPathLevels(reward.card.pathLevels)} · {reward.card.tower}
          </p>
          <button
            type="button"
            className="btn btn--primary btn--sm"
            disabled={cardBusy || cardLocked}
            onClick={() => void onClaimCard()}
          >
            {cardBusy
              ? "Claiming…"
              : alreadyOwnCard
                ? "Owned"
                : cardClaimed
                  ? "Claimed"
                  : "Claim"}
          </button>
          {cardNote ? <p className="daily-rewards__note">{cardNote}</p> : null}
        </article>
      </div>
    </section>
  );
}
