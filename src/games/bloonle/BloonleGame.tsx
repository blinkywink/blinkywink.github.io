import {
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { GameHeader } from "../../components/GameHeader";
import { useIsCompactViewport } from "../../components/MobileAppNav";
import { isTypingTarget } from "../../lib/keyboard";
import { bloonleSolveReward } from "../rewards";
import {
  armBloonleKeyboard,
  useBloonleKeyboardSession,
} from "./bloonleKeyboardBridge";
import { dayNumber, type LetterMark } from "./dictionary";
import {
  claimBloonleDailyHaulOnce,
  useBloonle,
  type BloonleGuess,
} from "./useBloonle";
import { towerTypeIcon, type TowerCategory } from "../../lib/packTheme";

type Props = {
  onBack: () => void;
  /** Fired once when solved in ≤3 guesses. */
  onFastSolve?: (guessCount: number) => void;
  /** Fired once when a round ends (win or lose). Daily revisit does not fire. */
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

function pathShort(label: string): string {
  if (label === "middle") return "mid";
  if (label === "bottom") return "bot";
  return label;
}

function pathPhrase(label: string): string {
  if (label === "base") return "base";
  if (label === "top") return "top path";
  if (label === "middle") return "middle path";
  if (label === "bottom") return "bottom path";
  return label;
}

function FeedbackChip({
  tip,
  match,
  icon,
  children,
  openId,
  chipId,
  onOpenChange,
}: {
  tip: string;
  match: boolean;
  icon?: boolean;
  children: ReactNode;
  openId: string | null;
  chipId: string;
  onOpenChange: (id: string | null) => void;
}) {
  const open = openId === chipId;
  const rootRef = useRef<HTMLButtonElement>(null);

  const onDocPointer = useEffectEvent((e: PointerEvent) => {
    if (!open) return;
    const el = rootRef.current;
    if (el && e.target instanceof Node && el.contains(e.target)) return;
    onOpenChange(null);
  });

  useEffect(() => {
    if (!open) return;
    document.addEventListener("pointerdown", onDocPointer);
    return () => document.removeEventListener("pointerdown", onDocPointer);
  }, [open, onDocPointer]);

  return (
    <button
      ref={rootRef}
      type="button"
      className={`bloonle-feedback-chip${icon ? " bloonle-feedback-chip--icon" : ""} is-${match ? "match" : "miss"}${open ? " is-tip-open" : ""}`}
      aria-label={tip}
      onClick={() => {
        // Hover shows the tip on desktop; tap toggles on touch.
        if (
          typeof window !== "undefined" &&
          window.matchMedia("(hover: hover) and (pointer: fine)").matches
        ) {
          return;
        }
        onOpenChange(open ? null : chipId);
      }}
    >
      {children}
      <span className="bloonle-feedback-tip" role="tooltip">
        {tip}
      </span>
    </button>
  );
}

function GuessFeedbackRow({ guess }: { guess: BloonleGuess }) {
  const rowId = useId();
  const [openId, setOpenId] = useState<string | null>(null);

  if (!guess.feedback) {
    return (
      <div className="bloonle-feedback-row">
        <span className="bloonle-feedback-chip is-miss">?</span>
      </div>
    );
  }
  const { category, price, path } = guess.feedback;
  const priceOk = price.cmp === "equal";
  const categoryArt = towerTypeIcon(category.guess as TowerCategory);
  const categoryTip = category.correct
    ? `The tower is ${category.guess}`
    : `The tower is not ${category.guess}`;
  const priceTip = priceOk
    ? "The tower costs the same"
    : price.cmp === "higher"
      ? "The tower costs more"
      : "The tower costs less";
  const pathShown = path.correct ? path.answer : path.guess;
  const pathTip = path.correct
    ? `The tower is ${pathPhrase(path.answer)}`
    : `The tower is not ${pathPhrase(path.guess)}`;

  return (
    <div className="bloonle-feedback-row">
      <FeedbackChip
        tip={categoryTip}
        match={category.correct}
        icon
        chipId={`${rowId}-cat`}
        openId={openId}
        onOpenChange={setOpenId}
      >
        <img
          className="bloonle-feedback-art"
          src={categoryArt}
          alt=""
          width={36}
          height={36}
          draggable={false}
        />
      </FeedbackChip>
      <FeedbackChip
        tip={priceTip}
        match={priceOk}
        icon
        chipId={`${rowId}-price`}
        openId={openId}
        onOpenChange={setOpenId}
      >
        <img
          className="bloonle-feedback-coin"
          src="/images/ui/money-icon.webp"
          alt=""
          width={28}
          height={28}
          draggable={false}
        />
        {!priceOk ? (
          <span className="bloonle-feedback-mark" aria-hidden>
            {price.cmp === "higher" ? "↑" : "↓"}
          </span>
        ) : null}
      </FeedbackChip>
      <FeedbackChip
        tip={pathTip}
        match={path.correct}
        chipId={`${rowId}-path`}
        openId={openId}
        onOpenChange={setOpenId}
      >
        {pathShort(pathShown)}
      </FeedbackChip>
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
  const [kbInset, setKbInset] = useState(0);
  const prevStatus = useRef(state.status);
  const dailyHaulLock = useRef(state.haulReported);
  const fastSolveLock = useRef(false);
  const runEndLock = useRef(false);
  const practiceHaulLock = useRef(false);

  useEffect(() => {
    const wasPlaying = prevStatus.current === "playing";
    prevStatus.current = state.status;

    if (state.status === "playing") {
      if (state.mode === "practice") practiceHaulLock.current = false;
      return;
    }

    if (state.mode === "practice") {
      if (!wasPlaying || practiceHaulLock.current) return;
      practiceHaulLock.current = true;
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
      return;
    }

    if (!state.haulReported && !dailyHaulLock.current) {
      dailyHaulLock.current = true;
      claimBloonleDailyHaulOnce(state.day);
      markHaulReported();
    }

    // Revisit / account-sync of an already-finished daily: keep the next-puzzle
    // panel. Nice Haul only on a real playing → done finish this visit.
    // haulReported is also set when the account already claimed today, even if
    // local state briefly looked like a playing → won transition.
    if (
      state.haulReported ||
      !wasPlaying ||
      state.guesses.length < 1 ||
      runEndLock.current
    ) {
      return;
    }
    runEndLock.current = true;

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

  useBloonleKeyboardSession({
    active: compact && !done,
    value: state.current,
    maxLength: len,
    onChange: setCurrentDraft,
    onSubmit: submit,
  });

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

        {state.guesses.length > 0 ? (
          <div className="bloonle-feedback-list" aria-live="polite">
            {state.guesses.map((g, i) => (
              <GuessFeedbackRow key={i} guess={g} />
            ))}
          </div>
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
                onClick={() => {
                  if (compact) armBloonleKeyboard();
                  playNext();
                }}
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
