type CurrencyChipProps = {
  kind: "bloonjamins" | "monkey-money";
  amount: number;
  className?: string;
};

const CURRENCY = {
  bloonjamins: {
    src: "/images/ui/money-icon.webp",
    title: "Cash",
  },
  "monkey-money": {
    src: "/images/ui/monkey-money-icon.webp",
    title: "Monkey Money",
  },
} as const;

/** Shared wallet chip for account currencies. */
export function CurrencyChip({ kind, amount, className = "" }: CurrencyChipProps) {
  const meta = CURRENCY[kind];
  return (
    <div
      className={`coin-chip ${kind === "monkey-money" ? "coin-chip--mm" : ""} ${className}`.trim()}
      title={meta.title}
    >
      <img
        src={meta.src}
        alt=""
        className="coin-chip__icon"
        width={34}
        height={34}
      />
      <span className="coin-chip__value">{amount.toLocaleString()}</span>
    </div>
  );
}
