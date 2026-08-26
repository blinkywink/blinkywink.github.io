import { CashAmount } from "./CurrencyChip";
import { BoosterPack } from "./BoosterPack";
import { RewardsHaulActions } from "./RewardsHaulActions";
import { categoryPack, type TowerCategory } from "../lib/packTheme";
import type { GamePath } from "../lib/routes";

export type RunHaulSummary = {
  game: GamePath;
  cleared: boolean;
  cashEarned: number;
  /** Short lines under the result, e.g. "7 correct", "Round 40 · 2 guesses". */
  details: string[];
  /** Bonus category pack credit - open free in the shop. */
  categoryPack?: TowerCategory | null;
};

type Props = {
  summary: RunHaulSummary;
  onPlayAgain: () => void;
  onBackToGames: () => void;
  onOpenShop: () => void;
  onDismiss: () => void;
  onPlayNextBonus?: () => void;
};

export function RewardsHaulCard({
  summary,
  onPlayAgain,
  onBackToGames,
  onOpenShop,
  onDismiss,
  onPlayNextBonus,
}: Props) {
  const bonusPack = summary.categoryPack
    ? categoryPack(summary.categoryPack)
    : null;

  return (
    <div className="rewards-done" role="dialog" aria-label="Nice haul">
      <div className="rewards-done__card">
        <button
          type="button"
          className="rewards-done__close"
          aria-label="Close"
          onClick={onDismiss}
        >
          ✕
        </button>
        <h2>Nice haul</h2>

        <p
          className={`rewards-done__outcome${summary.cleared ? " is-clear" : " is-miss"}`}
        >
          {summary.cleared ? "Cleared" : "Not cleared"}
        </p>

        {summary.details.length > 0 ? (
          <ul className="rewards-done__details">
            {summary.details.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : null}

        <div className="rewards-done__cash">
          <CashAmount amount={summary.cashEarned} size={28} />
          <span className="rewards-done__cash-label">Cash earned</span>
        </div>

        {bonusPack ? (
          <div className="rewards-done__pack">
            <BoosterPack
              pack={bonusPack}
              effects={false}
              className="rewards-done__pack-art"
            />
            <p className="rewards-done__pack-title">
              {summary.categoryPack} pack
            </p>
            <p className="rewards-done__pack-note">
              Open it free in the Shop
            </p>
          </div>
        ) : null}

        <RewardsHaulActions
          onPlayAgain={onPlayAgain}
          onBackToGames={onBackToGames}
          onOpenShop={onOpenShop}
          onPlayNextBonus={onPlayNextBonus}
        />
      </div>
    </div>
  );
}
