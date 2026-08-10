import type { PackDef } from "../lib/packTheme";
import { playCardFocus, preloadPackSounds } from "../lib/packSounds";
import { BoosterPack } from "./BoosterPack";

type Props = {
  open: boolean;
  options: PackDef[];
  onPick: (pack: PackDef) => void;
};

/** Simple free bonus pack picker. */
export function BonusPackPicker({ open, options, onPick }: Props) {
  if (!open || options.length === 0) return null;

  return (
    <div className="bonus-pick" role="dialog" aria-modal="true" aria-label="Bonus pack">
      <div className="bonus-pick__panel">
        <h2 className="bonus-pick__title">Nice work, you earned a bonus!</h2>
        <p className="bonus-pick__hint">Pick a pack to open</p>

        <div className="bonus-pick__row">
          {options.map((pack) => (
            <button
              key={pack.id}
              type="button"
              className="bonus-pick__item"
              onClick={() => {
                preloadPackSounds();
                playCardFocus();
                onPick(pack);
              }}
            >
              <BoosterPack
                pack={pack}
                effects={false}
                className="bonus-pick__booster"
              />
              <span className="bonus-pick__label">
                <strong>{pack.title}</strong>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
