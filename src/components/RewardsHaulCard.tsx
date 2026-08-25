import { CashAmount } from "./CurrencyChip";
import { BoosterPack } from "./BoosterPack";
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

export const GAME_HAUL_TITLES: Record<GamePath, string> = {
  zoomed: "ZOOMED",
  geoguessr: "GEOGUESSR",
  pricecheck: "PRICE CHECK",
  orderup: "ORDER UP",
  bloonle: "BLOONLE",
  camodetection: "CAMO DETECTION",
  bloonssweeper: "BLOONS SWEEPER",
  bananacatch: "BANANA CATCH",
  bloonhero: "BLOON HERO",
  roundcheck: "ROUND CHECK",
  heliumpop: "HELIUM POP",
  blowfree: "BLOW FREE",
};

type Props = {
  summary: RunHaulSummary;
  onPlayAgain: () => void;
  onBackToGames: () => void;
  onDismiss: () => void;
  onPlayNextBonus?: () => void;
};

export function RewardsHaulCard({
  summary,
  onPlayAgain,
  onBackToGames,
  onDismiss,
  onPlayNextBonus,
}: Props) {
  const title = GAME_HAUL_TITLES[summary.game];
  const bonusPack = summary.categoryPack
    ? categoryPack(summary.categoryPack)
    : null;

  return (
    <div className="rewards-done" role="dialog" aria-label="Run summary">
      <div className="rewards-done__card">
        <button
          type="button"
          className="rewards-done__close"
          aria-label="Close"
          onClick={onDismiss}
        >
          ✕
        </button>
        <p className="eyebrow">{title}</p>
        <h2>{summary.cleared ? "Nice haul" : "Run over"}</h2>

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

        <div className="rewards-done__actions">
          {onPlayNextBonus ? (
            <button
              type="button"
              className="btn btn--primary btn--lg"
              onClick={onPlayNextBonus}
            >
              Play next bonus game
            </button>
          ) : null}
          <button
            type="button"
            className={`btn btn--lg${onPlayNextBonus ? " btn--secondary" : " btn--primary"}`}
            onClick={onPlayAgain}
          >
            Play again
          </button>
          <button
            type="button"
            className="btn btn--secondary btn--lg"
            onClick={onBackToGames}
          >
            Back to Games
          </button>
        </div>
      </div>
    </div>
  );
}
