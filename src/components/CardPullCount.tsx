import { useEffect, useState } from "react";
import {
  fetchCardPullStats,
  type CardPullStats,
} from "../lib/cardPullStats";

type Props = {
  cardId: string;
  className?: string;
};

/** “This card has been pulled X times out of Y pulls” under focus views. */
export function CardPullCount({ cardId, className = "" }: Props) {
  const [stats, setStats] = useState<CardPullStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    setStats(null);
    void fetchCardPullStats(cardId).then((n) => {
      if (!cancelled) setStats(n);
    });
    return () => {
      cancelled = true;
    };
  }, [cardId]);

  if (stats == null) {
    return (
      <p className={`card-pull-count is-loading ${className}`.trim()} aria-hidden>
        {"\u00a0"}
      </p>
    );
  }

  const { count, total } = stats;
  const cardWord = count === 1 ? "time" : "times";
  const totalWord = total === 1 ? "pull" : "pulls";
  const label = `This card has been pulled ${count.toLocaleString()} ${cardWord} out of ${total.toLocaleString()} ${totalWord}`;

  return (
    <p className={`card-pull-count ${className}`.trim()} role="status">
      {label}
    </p>
  );
}
