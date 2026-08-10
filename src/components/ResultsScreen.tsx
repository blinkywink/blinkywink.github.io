type Props = {
  /** Cash banked during this run (includes perfect-run double if any). */
  coinsEarned: number;
  cleared?: boolean;
  /** Flawless clear, Cash was doubled. */
  perfect?: boolean;
  /** False after the one allowed continue was already used / on clears. */
  continueAvailable?: boolean;
  continueCost: number;
  canAffordContinue: boolean;
  continueBusy?: boolean;
  continueError?: string | null;
  onContinue: () => void;
  onBack: () => void;
};

function formatCoins(n: number): string {
  return n.toLocaleString("en-US");
}

/** End-of-run: cash only on clear (packs follow); fail keeps continue + exit. */
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
  onBack,
}: Props) {
  return (
    <div className="results">
      <div className="results__card">
        <p className="eyebrow">
          {perfect ? "Perfect run" : cleared ? "Run cleared" : "Out of lives"}
        </p>
        <div className="results__hero-score">
          <span className="results__hero-value">
            +{formatCoins(coinsEarned)}
          </span>
          <span className="results__hero-label">Cash earned</span>
        </div>

        {perfect ? (
          <p className="results__pack-note results__pack-note--perfect">
            All correct, Cash doubled!
          </p>
        ) : null}

        {cleared ? (
          <p className="results__pack-note">Opening rewards…</p>
        ) : (
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
              className="btn btn--primary btn--lg"
              onClick={onBack}
              disabled={continueBusy}
            >
              Back to Games
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
