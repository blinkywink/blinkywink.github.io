import { useEffect, useRef, useState } from "react";

type CurrencyChipProps = {
  amount: number;
  className?: string;
  /** When this changes (e.g. user id), don't animate the first balance. */
  resetKey?: string | null;
};

type CashAmountProps = {
  amount: number;
  className?: string;
  /** Icon pixel size. */
  size?: number;
};

type CashPop = {
  id: number;
  delta: number;
};

/** Cash balance chip (header) with floating +/- on change. */
export function CurrencyChip({
  amount,
  className = "",
  resetKey = null,
}: CurrencyChipProps) {
  const prevAmount = useRef<number | null>(null);
  const prevKey = useRef(resetKey);
  const seq = useRef(0);
  const [pops, setPops] = useState<CashPop[]>([]);

  useEffect(() => {
    if (prevKey.current !== resetKey) {
      prevKey.current = resetKey;
      prevAmount.current = amount;
      setPops([]);
      return;
    }

    if (prevAmount.current == null) {
      prevAmount.current = amount;
      return;
    }

    const delta = amount - prevAmount.current;
    prevAmount.current = amount;
    if (delta === 0) return;

    const id = ++seq.current;
    setPops((list) => [...list.slice(-3), { id, delta }]);
    window.setTimeout(() => {
      setPops((list) => list.filter((p) => p.id !== id));
    }, 1500);
  }, [amount, resetKey]);

  return (
    <div className={`coin-chip ${className}`.trim()} title="Cash">
      <img
        src="/images/ui/money-icon.webp"
        alt=""
        className="coin-chip__icon"
        width={34}
        height={34}
      />
      <span className="coin-chip__value">{amount.toLocaleString()}</span>
      <span className="coin-chip__pops" aria-live="polite" aria-atomic="false">
        {pops.map((pop) => (
          <span
            key={pop.id}
            className={`coin-chip__pop${pop.delta > 0 ? " is-gain" : " is-loss"}`}
          >
            {pop.delta > 0 ? "+" : "−"}
            {Math.abs(pop.delta).toLocaleString()}
          </span>
        ))}
      </span>
    </div>
  );
}

/** Inline price with money icon (market, offers, shop). */
export function CashAmount({
  amount,
  className = "",
  size = 18,
}: CashAmountProps) {
  return (
    <span
      className={`cash-amount ${className}`.trim()}
      title={`${amount.toLocaleString()} Cash`}
    >
      <img
        src="/images/ui/money-icon.webp"
        alt=""
        width={size}
        height={size}
        draggable={false}
      />
      <span>{amount.toLocaleString()}</span>
    </span>
  );
}
