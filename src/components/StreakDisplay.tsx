type Props = {
  streak: number;
};

/** Compact streak chip used in headers / HUD. */
export function StreakDisplay({ streak }: Props) {
  return (
    <div className={`stat-chip stat-chip--streak ${streak > 0 ? "is-hot" : ""}`}>
      <span className="stat-chip__label">Streak</span>
      <span className="stat-chip__value">
        {streak > 0 ? "🔥 " : ""}
        {streak}
      </span>
    </div>
  );
}
