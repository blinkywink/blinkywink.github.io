import { CashAmount } from "./CurrencyChip";
import type { GamePath } from "../lib/routes";

export type RunHaulSummary = {
  game: GamePath;
  cleared: boolean;
  cashEarned: number;
  /** Short lines under the result, e.g. "7 correct", "Round 40 · 2 guesses". */
  details: string[];
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
  ricoshot: "HELIUM POP",
  blowfree: "BLOW FREE",
};

type Props = {
  summary: RunHaulSummary;
  onPlayAgain: () => void;
  onBackToGames: () => void;
};

export function RewardsHaulCard({
  summary,
  onPlayAgain,
  onBackToGames,
}: Props) {
  const title = GAME_HAUL_TITLES[summary.game];

  return (
    <div className="rewards-done" role="dialog" aria-label="Run summary">
      <div className="rewards-done__card">
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

        <div className="rewards-done__actions">
          <button
            type="button"
            className="btn btn--primary btn--lg"
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
