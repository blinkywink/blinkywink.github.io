type CurrencyChipProps = {
  amount: number;
  className?: string;
};

type CashAmountProps = {
  amount: number;
  className?: string;
  /** Icon pixel size. */
  size?: number;
};

/** Cash balance chip (header). */
export function CurrencyChip({ amount, className = "" }: CurrencyChipProps) {
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
