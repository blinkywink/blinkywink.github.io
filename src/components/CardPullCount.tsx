import { useEffect, useState } from "react";
import { fetchCardPullCount } from "../lib/cardPullStats";

type Props = {
  cardId: string;
  className?: string;
};

/** “This card has been pulled X times” under fullscreen card views. */
export function CardPullCount({ cardId, className = "" }: Props) {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setCount(null);
    void fetchCardPullCount(cardId).then((n) => {
      if (!cancelled) setCount(n);
    });
    return () => {
      cancelled = true;
    };
  }, [cardId]);

  if (count == null) {
    return (
      <p className={`card-pull-count is-loading ${className}`.trim()} aria-hidden>
        {"\u00a0"}
      </p>
    );
  }

  const label =
    count === 1
      ? "This card has been pulled 1 time"
      : `This card has been pulled ${count.toLocaleString()} times`;

  return (
    <p className={`card-pull-count ${className}`.trim()} role="status">
      {label}
    </p>
  );
}
