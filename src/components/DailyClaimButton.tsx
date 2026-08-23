import { useEffect, useState } from "react";
import { useAuth, utcToday } from "../auth/AuthProvider";
import { useCardCollection } from "../auth/CardCollectionProvider";
import { awardCoins } from "../lib/awardCoins";
import {
  DAILY_CASH_AMOUNT,
  formatDailyCountdown,
  msUntilDailyRefresh,
  todaysDailyCard,
} from "../lib/dailyReward";
import { duplicateCashForCard } from "../lib/packPull";
import { useQuizHeroFx } from "../lib/quizHeroFx";
import { MonkeyCard } from "./MonkeyCard";

type Props = {
  /** Slightly roomier layout for the games home. */
  variant?: "hero" | "inline";
};

/** Daily Cash + shared daily card — claimable separately. */
export function DailyClaimButton({ variant = "inline" }: Props) {
  const {
    isGuest,
    claimDailyCash,
    claimDailyCard,
    ready,
    profile,
    setCoinBalance,
  } = useAuth();
  const { owned, awardCards, feedParagonsFromCards } = useCardCollection();
  const { dupCashMods } = useQuizHeroFx();
  const [cashBusy, setCashBusy] = useState(false);
  const [cardBusy, setCardBusy] = useState(false);
  const [cashError, setCashError] = useState<string | null>(null);
  const [cardError, setCardError] = useState<string | null>(null);
  /** Sticky local claimed flags so spam / profile races don't flash Claim again. */
  const [cashClaimedLocal, setCashClaimedLocal] = useState(false);
  const [cardClaimedLocal, setCardClaimedLocal] = useState(false);
  const [remaining, setRemaining] = useState(() => msUntilDailyRefresh());
  const [dayKey, setDayKey] = useState(() => todaysDailyCard().dayKey);

  useEffect(() => {
    const tick = () => {
      setRemaining(msUntilDailyRefresh());
      const next = todaysDailyCard().dayKey;
      setDayKey((prev) => {
        if (prev === next) return prev;
        setCashClaimedLocal(false);
        setCardClaimedLocal(false);
        return next;
      });
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (ready && !isGuest && profile?.last_daily_claim === utcToday()) {
      setCashClaimedLocal(true);
    }
  }, [ready, isGuest, profile?.last_daily_claim]);

  useEffect(() => {
    if (ready && !isGuest && profile?.last_daily_card_claim === utcToday()) {
      setCardClaimedLocal(true);
    }
  }, [ready, isGuest, profile?.last_daily_card_claim]);

  if (!ready || isGuest) return null;

  const daily = todaysDailyCard();
  const reward = daily.dayKey === dayKey ? daily : todaysDailyCard();
  const cashClaimed =
    cashClaimedLocal || profile?.last_daily_claim === utcToday();
  const cardClaimed =
    cardClaimedLocal || profile?.last_daily_card_claim === utcToday();

  async function onClaimCash() {
    if (cashBusy || cashClaimed) return;
    setCashBusy(true);
    setCashError(null);
    const result = await claimDailyCash();
    setCashBusy(false);
    if (result.error) {
      setCashError(result.error);
      return;
    }
    setCashClaimedLocal(true);
    if (typeof result.coins === "number") setCoinBalance(result.coins);
  }

  async function onClaimCard() {
    if (cardBusy || cardClaimed) return;
    setCardBusy(true);
    setCardError(null);
    const result = await claimDailyCard();
    if (result.error) {
      setCardBusy(false);
      setCardError(result.error);
      return;
    }
    setCardClaimedLocal(true);
    if (result.already) {
      setCardBusy(false);
      return;
    }

    const wasNew = !owned.has(reward.card.id);
    if (owned.has(reward.card.id)) {
      const dup = duplicateCashForCard(reward.card, dupCashMods());
      const bal = await awardCoins(dup);
      if (bal != null) setCoinBalance(bal);
    } else {
      await awardCards([reward.card.id]);
    }
    await feedParagonsFromCards([reward.card.id], wasNew ? [reward.card.id] : []);
    setCardBusy(false);
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
          <p className="daily-rewards__slot-value">
            +{DAILY_CASH_AMOUNT.toLocaleString()} Cash
          </p>
          <button
            type="button"
            className="btn btn--primary btn--sm"
            disabled={cashBusy || cashClaimed}
            aria-disabled={cashBusy || cashClaimed}
            onClick={() => void onClaimCash()}
          >
            {cashBusy ? "Claiming…" : cashClaimed ? "Claimed" : "Claim"}
          </button>
          {cashError ? (
            <p className="daily-rewards__err" role="alert">
              {cashError}
            </p>
          ) : null}
        </article>

        <article
          className={`daily-rewards__slot${cardClaimed ? " is-claimed" : ""}`}
        >
          <div className="daily-rewards__card-wrap">
            <MonkeyCard
              entity={reward.card.entity}
              pathLevels={reward.card.pathLevels}
              mode="preview"
              owned
            />
          </div>
          <p className="daily-rewards__slot-value">
            {reward.card.entity.name}
          </p>
          <button
            type="button"
            className="btn btn--primary btn--sm"
            disabled={cardBusy || cardClaimed}
            aria-disabled={cardBusy || cardClaimed}
            onClick={() => void onClaimCard()}
          >
            {cardBusy ? "Claiming…" : cardClaimed ? "Claimed" : "Claim"}
          </button>
          {cardError ? (
            <p className="daily-rewards__err" role="alert">
              {cardError}
            </p>
          ) : null}
        </article>
      </div>
    </section>
  );
}
