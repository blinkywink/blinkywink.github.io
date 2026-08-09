import { useMemo } from "react";
import { GameHeader } from "../../components/GameHeader";
import { CashAmount } from "../../components/CurrencyChip";
import {
  RED_BLOON_IMAGE,
  SWEEPER_DIFFICULTIES,
  type SweeperDifficulty,
} from "./config";
import { useBloonsSweeper } from "./useBloonsSweeper";

type Props = {
  onBack: () => void;
};

function formatElapsed(ms: number): string {
  const sec = Math.floor(ms / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function BloonsSweeperGame({ onBack }: Props) {
  const { state, minesLeft, setDifficulty, restart, reveal, toggleFlag } =
    useBloonsSweeper();

  const elapsed = useMemo(() => {
    if (state.startedAt == null) return 0;
    const end = state.finishedAt ?? Date.now();
    return Math.max(0, end - state.startedAt);
  }, [state.startedAt, state.finishedAt, state.status, state.board]);

  const done = state.status === "won" || state.status === "lost";

  return (
    <div className={`sweeper-page${done ? " is-done" : ""}`}>
      <GameHeader title="BLOONS SWEEPER" icon="" />

      <main className="sweeper-main">
        <div className="sweeper-hud">
          <div className="sweeper-hud__stats">
            <span className="sweeper-stat" title="Red bloons left">
              <img src={RED_BLOON_IMAGE} alt="" width={22} height={28} />
              <strong>{minesLeft}</strong>
            </span>
            <span className="sweeper-stat">
              <span className="sweeper-stat__label">Time</span>
              <strong>
                {state.startedAt == null ? "0:00" : formatElapsed(elapsed)}
              </strong>
            </span>
          </div>

          <div className="sweeper-diff" role="group" aria-label="Difficulty">
            {(Object.keys(SWEEPER_DIFFICULTIES) as SweeperDifficulty[]).map(
              (id) => (
                <button
                  key={id}
                  type="button"
                  className={`sweeper-diff__btn${state.difficulty === id ? " is-active" : ""}`}
                  disabled={state.status === "playing" && state.minesPlaced}
                  onClick={() => setDifficulty(id)}
                >
                  {SWEEPER_DIFFICULTIES[id].label}
                </button>
              ),
            )}
          </div>

          <button type="button" className="btn btn--ghost btn--sm" onClick={restart}>
            New board
          </button>
        </div>

        <p className="sweeper-hint">
          Tap to pop clear tiles · right-click / long-press to flag red bloons
        </p>

        <div
          className="sweeper-board"
          style={{
            ["--sweeper-cols" as string]: state.cfg.cols,
            ["--sweeper-rows" as string]: state.cfg.rows,
          }}
          role="grid"
          aria-label="Bloons sweeper board"
          onContextMenu={(e) => e.preventDefault()}
        >
          {state.board.map((row, r) =>
            row.map((cell, c) => {
              const showMine =
                cell.mine && (cell.revealed || state.status === "lost");
              const showNum = cell.revealed && !cell.mine && cell.adjacent > 0;
              return (
                <button
                  key={`${r}-${c}`}
                  type="button"
                  role="gridcell"
                  className={[
                    "sweeper-cell",
                    cell.revealed ? "is-open" : "is-closed",
                    cell.flagged ? "is-flagged" : "",
                    showMine ? "is-mine" : "",
                    cell.revealed && cell.mine ? "is-boom" : "",
                    showNum ? `is-n${cell.adjacent}` : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  disabled={done && !cell.revealed}
                  aria-label={
                    cell.flagged
                      ? "Flagged"
                      : cell.revealed
                        ? cell.mine
                          ? "Red bloon"
                          : cell.adjacent
                            ? `${cell.adjacent} nearby`
                            : "Clear"
                        : "Hidden"
                  }
                  onClick={() => reveal(r, c)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    toggleFlag(r, c);
                  }}
                >
                  {showMine ? (
                    <img
                      className="sweeper-cell__mine"
                      src={RED_BLOON_IMAGE}
                      alt=""
                      draggable={false}
                    />
                  ) : null}
                  {showNum ? <span>{cell.adjacent}</span> : null}
                </button>
              );
            }),
          )}
        </div>

        {state.status === "won" ? (
          <div className="sweeper-result is-win" role="status">
            <h2>Board clear!</h2>
            <p>
              No red bloons left hidden ·{" "}
              <CashAmount amount={state.reward} size={18} />
            </p>
            <div className="sweeper-result__actions">
              <button type="button" className="btn btn--primary" onClick={restart}>
                Play again
              </button>
              <button type="button" className="btn btn--ghost" onClick={onBack}>
                Games
              </button>
            </div>
          </div>
        ) : null}

        {state.status === "lost" ? (
          <div className="sweeper-result is-lose" role="status">
            <h2>Popped a red bloon</h2>
            <p>Flag the reds next time — try another board.</p>
            <div className="sweeper-result__actions">
              <button type="button" className="btn btn--primary" onClick={restart}>
                Try again
              </button>
              <button type="button" className="btn btn--ghost" onClick={onBack}>
                Games
              </button>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}
