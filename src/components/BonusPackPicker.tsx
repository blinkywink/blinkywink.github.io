import type { PackDef } from "../lib/packTheme";
import { BoosterPack } from "./BoosterPack";

type Props = {
  open: boolean;
  options: PackDef[];
  /** Short, plain reason — shown under the headline. */
  blurb: string;
  onPick: (pack: PackDef) => void;
  onSkip: () => void;
};

/** Simple “you earned a bonus — pick one” overlay. */
export function BonusPackPicker({
  open,
  options,
  blurb,
  onPick,
  onSkip,
}: Props) {
  if (!open || options.length === 0) return null;

  return (
    <div className="bonus-pick" role="dialog" aria-modal="true" aria-label="Bonus pack">
      <div className="bonus-pick__panel">
        <p className="eyebrow">Nice work</p>
        <h2 className="bonus-pick__title">Bonus pack</h2>
        <p className="bonus-pick__blurb">{blurb}</p>
        <p className="bonus-pick__hint">Pick one to open</p>

        <div className="bonus-pick__row">
          {options.map((pack) => (
            <button
              key={pack.id}
              type="button"
              className="bonus-pick__item"
              onClick={() => onPick(pack)}
            >
              <BoosterPack
                pack={pack}
                effects={false}
                className="bonus-pick__booster"
              />
              <span className="bonus-pick__label">
                <strong>{pack.title}</strong>
                <span>{pack.subtitle}</span>
              </span>
            </button>
          ))}
        </div>

        <button type="button" className="btn btn--ghost" onClick={onSkip}>
          Skip
        </button>
      </div>
    </div>
  );
}
