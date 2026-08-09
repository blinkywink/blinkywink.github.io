type CurrencyChipProps = {
  amount: number;
  className?: string;
};

/** Cash balance chip. */
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
