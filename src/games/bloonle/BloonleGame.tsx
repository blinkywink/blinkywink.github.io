import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { GameHeader } from "../../components/GameHeader";
import { useIsCompactViewport } from "../../components/MobileAppNav";
import { isTypingTarget } from "../../lib/keyboard";
import { bloonleSolveReward } from "../rewards";
import { dayNumber, type LetterMark } from "./dictionary";
import { claimBloonleDailyHaulOnce, useBloonle } from "./useBloonle";

type Props = {
  onBack: () => void;
  /** Fired once when solved in ≤3 guesses. */
  onFastSolve?: (guessCount: number) => void;
  /** Fired once when a daily round ends (win or lose). Not on revisit. */
  onRunEnd?: (info: {
    cleared: boolean;
    coinsEarned: number;
    guesses: number;
    answer: string;
  }) => void;
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
  const compact = useIsCompactViewport();
  const {
    state,
    typeLetter,
    backspace,
    setCurrentDraft,
    submit,
    playNext,
    markHaulReported,
    keyMarks,
    maxGuesses,
  } = useBloonle();
  const len = state.puzzle.slug.length;
  const done = state.status !== "playing";
  const isDaily = state.mode === "daily";
  const mobileInputRef = useRef<HTMLInputElement>(null);
  const [kbInset, setKbInset] = useState(0);
  /** Opening an already-finished daily must never re-trigger Nice Haul / packs. */
  const openedAlreadyDone = useRef(
    state.mode === "daily" && state.status !== "playing",
  );
  const dailyHaulLock = useRef(state.haulReported);
  const fastSolveLock = useRef(false);

  useEffect(() => {
    if (state.mode !== "daily") return;
    if (state.status === "playing") return;

    if (openedAlreadyDone.current) {
      if (!state.haulReported && !dailyHaulLock.current) {
        dailyHaulLock.current = true;
        claimBloonleDailyHaulOnce(state.day);
        markHaulReported();
      }
      return;
    }

    if (state.haulReported || dailyHaulLock.current) return;
    if (!claimBloonleDailyHaulOnce(state.day)) {
      dailyHaulLock.current = true;
      markHaulReported();
      return;
    }
    dailyHaulLock.current = true;
    markHaulReported();

    const guesses = state.guesses.length;
    if (state.status === "won") {
      const coinsEarned =
        state.reward > 0
          ? state.reward
          : bloonleSolveReward(state.mode, guesses);
      if (!fastSolveLock.current && guesses > 0 && guesses <= 3) {
        fastSolveLock.current = true;
        onFastSolve?.(guesses);
      }
      onRunEnd?.({
        cleared: true,
        coinsEarned,
        guesses,
        answer: state.puzzle.slug,
      });
      return;
    }

    onRunEnd?.({
      cleared: false,
      coinsEarned: 0,
      guesses,
      answer: state.puzzle.slug,
    });
  }, [
    state.status,
    state.mode,
    state.day,
    state.guesses.length,
    state.reward,
    state.puzzle.slug,
    state.haulReported,
    markHaulReported,
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

  /* Mobile: open system keyboard as soon as Bloonle mounts / after each guess. */
  useLayoutEffect(() => {
    if (!compact || done) return;
    const el = mobileInputRef.current;
    if (!el) return;
    const focus = () => {
      try {
        el.focus({ preventScroll: true });
      } catch {
        el.focus();
      }
    };
    focus();
    const t0 = window.setTimeout(focus, 0);
    const t1 = window.setTimeout(focus, 80);
    const t2 = window.setTimeout(focus, 250);
    return () => {
      window.clearTimeout(t0);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [compact, done, state.guesses.length, state.puzzle.slug]);

  /* Lift the board when the soft keyboard covers the lower viewport. */
  useEffect(() => {
    if (!compact || done) {
      setKbInset(0);
      return;
    }
    const vv = window.visualViewport;
    if (!vv) return;
    const sync = () => {
      const covered = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setKbInset(covered > 80 ? covered : 0);
    };
    sync();
    vv.addEventListener("resize", sync);
    vv.addEventListener("scroll", sync);
    return () => {
      vv.removeEventListener("resize", sync);
      vv.removeEventListener("scroll", sync);
    };
  }, [compact, done]);

  const dayLabel = dayNumber(state.day) - dayNumber("2026-01-01") + 1;

  return (
    <div
      className={`bloonle-page ${done ? "is-done" : ""}${kbInset > 0 ? " is-kb-open" : ""}`}
      style={
        {
          ["--bloonle-kb" as string]: `${kbInset}px`,
        } as CSSProperties
      }
    >
      <GameHeader title="BLOONLE" icon="" />

      <main className="bloonle-main">
        <div className="bloonle-prompt">
          <p className="bloonle-prompt__day">
            {isDaily ? `Daily #${Math.max(1, dayLabel)}` : "Practice"}
          </p>
          <h2>Guess the tower</h2>
          <p className="bloonle-prompt__sub">
            Base towers and T5 upgrades · no spaces · {len} letters ·{" "}
            {maxGuesses} tries
          </p>
          {!done && state.guesses.length >= 2 ? (
            <div className="bloonle-hints" aria-live="polite">
              <p className="bloonle-hints__label">Hints</p>
              <p>
                It is a{" "}
                {state.puzzle.entity.type === "tower" ? "base tower" : "T5"}
              </p>
              {state.guesses.length >= 4 ? (
                <p>It is {state.puzzle.entity.category}</p>
              ) : null}
            </div>
          ) : null}
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
          style={
            {
              ["--bloonle-n" as string]: len,
              ["--bloonle-rows" as string]: maxGuesses,
            } as CSSProperties
          }
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

        {compact && !done ? (
          <input
            ref={mobileInputRef}
            className="bloonle-mobile-input"
            value={state.current}
            aria-label="Type your guess"
            autoFocus
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="go"
            inputMode="text"
            maxLength={len}
            onChange={(e) => setCurrentDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
          />
        ) : null}

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
              {state.status === "won" &&
              isDaily &&
              state.awarded &&
              state.reward === 0 ? (
                <p className="bloonle-result__pack">
                  Already collected today
                </p>
              ) : null}
              {state.status === "won" &&
              isDaily &&
              !state.haulReported &&
              state.guesses.length > 0 &&
              state.guesses.length <= 3 ? (
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

        {!compact ? (
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
        ) : null}
      </main>
    </div>
  );
}
