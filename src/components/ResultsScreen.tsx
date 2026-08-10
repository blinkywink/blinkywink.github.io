type Props = {
  /** Cash banked during this run (includes perfect-run double if any). */
  coinsEarned: number;
  cleared?: boolean;
  /** Flawless clear — Cash was doubled. */
  perfect?: boolean;
  /** False after the one allowed continue was already used. */
  continueAvailable?: boolean;
  continueCost: number;
  canAffordContinue: boolean;
  continueBusy?: boolean;
  continueError?: string | null;
  onContinue: () => void;
  onPlayAgain: () => void;
  onBack: () => void;
};

function formatCoins(n: number): string {
  return n.toLocaleString("en-US");
}

/** Compact run-over panel — earnings + continue / again / games. */
export function ResultsScreen({
  coinsEarned,
  cleared = false,
  perfect = false,
  continueAvailable = true,
  continueCost,
  canAffordContinue,
  continueBusy = false,
  continueError = null,
  onContinue,
  onPlayAgain,
  onBack,
}: Props) {
  return (
    <div className="results">
      <div className="results__card">
        <p className="eyebrow">
          {perfect
            ? "Perfect run"
            : cleared
              ? "Run cleared"
              : "Out of lives"}
        </p>
        <h2 className="results__title">
          {perfect ? "PERFECT" : cleared ? "NICE RUN" : "GAME OVER"}
        </h2>

        <div className="results__hero-score">
          <span className="results__hero-value">
            +{formatCoins(coinsEarned)}
          </span>
          <span className="results__hero-label">Cash earned</span>
        </div>

        {perfect ? (
          <p className="results__pack-note results__pack-note--perfect">
            All correct — Cash doubled!
          </p>
        ) : null}

        <div className="results__actions">
          {continueAvailable ? (
            <>
              <button
                type="button"
                className="btn btn--primary btn--lg results__continue"
                onClick={onContinue}
                disabled={continueBusy || !canAffordContinue}
              >
                Continue
                <span className="results__continue-cost">
                  <img
                    src="/images/ui/money-icon.webp"
                    alt=""
                    width={22}
                    height={22}
                  />
                  {continueCost}
                </span>
              </button>
              <p className="results__continue-note">
                {canAffordContinue
                  ? "One continue per run · refill to 5 lives"
                  : `Need ${continueCost} Cash for 5 more lives`}
              </p>
              {continueError ? (
                <p className="results__continue-error">{continueError}</p>
              ) : null}
            </>
          ) : null}

          <button
            type="button"
            className="btn btn--secondary btn--lg"
            onClick={onPlayAgain}
            disabled={continueBusy}
          >
            Play again
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--lg"
            onClick={onBack}
            disabled={continueBusy}
          >
            Games
          </button>
        </div>
      </div>
    </div>
  );
}
