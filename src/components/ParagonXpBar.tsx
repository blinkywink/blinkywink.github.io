import {
  clampParagonDegree,
  PARAGON_MAX_DEGREE,
  xpToNextDegree,
} from "../lib/paragonProgress";

type Props = {
  degree: number;
  xp: number;
};

export function ParagonXpBar({ degree, xp }: Props) {
  const d = clampParagonDegree(degree);
  const have = Math.max(0, Math.floor(xp));
  const need = xpToNextDegree(d);
  const maxed = d >= PARAGON_MAX_DEGREE;
  const pct = maxed ? 100 : need <= 0 ? 0 : Math.min(100, (have / need) * 100);

  return (
    <div className="paragon-xp-bar">
      <div className="paragon-xp-bar__meta">
        <span>
          {maxed ? `Degree ${d} · Max` : `Degree ${d} → ${d + 1}`}
        </span>
        <span>
          {maxed
            ? "Maxed"
            : `${have.toLocaleString()} / ${need.toLocaleString()} XP`}
        </span>
      </div>
      <div
        className="paragon-xp-bar__track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={maxed ? 100 : need}
        aria-valuenow={maxed ? 100 : have}
        aria-label={maxed ? "Max degree" : "XP to next degree"}
      >
        <span className="paragon-xp-bar__fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
