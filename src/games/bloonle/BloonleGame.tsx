import { useEffect, useRef } from "react";
import { GameHeader } from "../../components/GameHeader";
import { isTypingTarget } from "../../lib/keyboard";
import { bloonleSolveReward } from "../rewards";
import { dayNumber, type LetterMark } from "./dictionary";
import { useBloonle } from "./useBloonle";

type Props = {
  onBack: () => void;
  /** Fired once when solved in ≤3 guesses. */
  onFastSolve?: (guessCount: number) => void;
  /** Fired once when a round ends (win or lose). */
  onRunEnd?: (info: { cleared: boolean; coinsEarned: number }) => void;
};

const ROWS = [
  "qwertyuiop".split(""),
  "asdfghjkl".split(""),
  ["enter", ..."zxcvbnm".split(""), "back"] as string[],
];

function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
}

function Tile({
  letter,
  mark,
  filled,
  reveal,
}: {
  letter: string;
  mark?: LetterMark;
  filled?: boolean;
  reveal?: boolean;
}) {
  const cls = [
    "bloonle-tile",
    filled ? "is-filled" : "",
    mark ? `is-${mark}` : "",
    reveal ? "is-reveal" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={cls} aria-hidden={!letter}>
      {letter}
    </div>
  );
}

export function BloonleGame({
  onBack: _onBack,
  onFastSolve,
  onRunEnd,
}: Props) {
  const {
    state,
    typeLetter,
    backspace,
    submit,
    playNext,
    keyMarks,
    maxGuesses,
  } = useBloonle();
  const len = state.puzzle.slug.length;
  const done = state.status !== "playing";
  const isDaily = state.mode === "daily";
  const prevStatus = useRef(state.status);

  useEffect(() => {
    const was = prevStatus.current;
    prevStatus.current = state.status;
    if (was !== "playing") return;
    if (state.status === "won") {
      const guesses = state.guesses.length;
      // Award is applied async; compute the same payout for Nice Haul now.
      const coinsEarned =
        state.reward > 0
          ? state.reward
          : bloonleSolveReward(state.mode, guesses);
      if (guesses > 0 && guesses <= 3) onFastSolve?.(guesses);
      onRunEnd?.({ cleared: true, coinsEarned });
      return;
    }
    if (state.status === "lost") {
      onRunEnd?.({ cleared: false, coinsEarned: 0 });
    }
  }, [
    state.status,
    state.guesses.length,
    state.mode,
    state.reward,
    onFastSolve,
    onRunEnd,
  ]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      if (e.key === "Enter") {
        e.preventDefault();
        if (done) playNext();
        else submit();
        return;
      }
      if (e.key === "Backspace") {
        e.preventDefault();
        backspace();
        return;
      }
      if (/^[a-zA-Z]$/.test(e.key)) {
        e.preventDefault();
        typeLetter(e.key);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [typeLetter, backspace, submit, playNext, done]);

  const dayLabel = dayNumber(state.day) - dayNumber("2026-01-01") + 1;

  return (
    <div className={`bloonle-page ${done ? "is-done" : ""}`}>
      <GameHeader title="BLOONLE" icon="" />

      <main className="bloonle-main">
        <div className="bloonle-prompt">
          <p className="bloonle-prompt__day">
            {isDaily ? `Daily #${Math.max(1, dayLabel)}` : "Practice"}
          </p>
          <h2>Guess the tower</h2>
          <p className="bloonle-prompt__sub">
            Tower &amp; upgrade names · no spaces · {len} letters ·{" "}
            {maxGuesses} tries
          </p>
        </div>

        {state.toast ? (
          <div className="bloonle-toast" role="status">
            {state.toast}
          </div>
        ) : (
          <div className="bloonle-toast bloonle-toast--spacer" aria-hidden />
        )}

        <div
          className="bloonle-board"
          style={{ ["--bloonle-n" as string]: len }}
        >
          {Array.from({ length: maxGuesses }, (_, row) => {
            const guess = state.guesses[row];
            const isCurrent = row === state.guesses.length && !done;
            const letters = guess
              ? guess.letters
              : isCurrent
                ? state.current.padEnd(len, " ")
                : " ".repeat(len);

            return (
              <div key={row} className="bloonle-row">
                {Array.from({ length: len }, (_, i) => {
                  const ch = letters[i] === " " ? "" : (letters[i] ?? "");
                  return (
                    <Tile
                      key={i}
                      letter={ch}
                      mark={guess?.marks[i]}
                      filled={Boolean(ch) && !guess}
                      reveal={Boolean(guess)}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>

        {done ? (
          <div className="bloonle-result">
            <img
              className="bloonle-result__img"
              src={state.puzzle.entity.image}
              alt=""
              draggable={false}
            />
            <div className="bloonle-result__copy">
              <p className="bloonle-result__status">
                {state.status === "won" ? "Solved!" : "Out of tries"}
                {!isDaily ? " · practice" : ""}
              </p>
              <h3>{state.puzzle.displayName}</h3>
              <p className="bloonle-result__slug">{state.puzzle.slug}</p>
              {state.status === "won" && state.guesses.length === 1 ? (
                <p className="bloonle-result__pack">
                  First try, Cash doubled!
                </p>
              ) : null}
              {state.status === "won" && state.guesses.length <= 3 ? (
                <p className="bloonle-result__pack">
                  Fast solve, pick a bonus pack!
                </p>
              ) : null}
              {state.status === "won" && state.reward > 0 ? (
                <p className="bloonle-result__cash">+{state.reward} Cash</p>
              ) : null}
              {isDaily ? (
                <p className="bloonle-result__next">
                  Next daily in {formatCountdown(state.msUntilNext)}, or keep
                  playing practice below
                </p>
              ) : null}
              <button
                type="button"
                className="btn btn--primary bloonle-result__play"
                onClick={playNext}
                autoFocus
              >
                Next puzzle
              </button>
            </div>
          </div>
        ) : null}

        <div className="bloonle-keyboard" aria-label="Keyboard">
          {ROWS.map((row, ri) => (
            <div key={ri} className="bloonle-keyboard__row">
              {row.map((key) => {
                if (key === "enter") {
                  return (
                    <button
                      key={key}
                      type="button"
                      className="bloonle-key bloonle-key--wide"
                      onClick={done ? playNext : submit}
                    >
                      {done ? "Next" : "Enter"}
                    </button>
                  );
                }
                if (key === "back") {
                  return (
                    <button
                      key={key}
                      type="button"
                      className="bloonle-key bloonle-key--wide"
                      onClick={backspace}
                      disabled={done}
                      aria-label="Backspace"
                    >
                      ⌫
                    </button>
                  );
                }
                const mark = keyMarks.get(key);
                return (
                  <button
                    key={key}
                    type="button"
                    className={`bloonle-key${mark ? ` is-${mark}` : ""}`}
                    onClick={() => typeLetter(key)}
                    disabled={done}
                  >
                    {key}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
