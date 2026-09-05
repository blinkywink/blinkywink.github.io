import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useAuth } from "../../auth/AuthProvider";
import { formatPathLevels } from "../../lib/pathCombos";
import { isTypingTarget } from "../../lib/keyboard";
import { GameHeader } from "../../components/GameHeader";
import { LivesMeter } from "../../components/LivesMeter";
import { ResultsScreen } from "../../components/ResultsScreen";
import { formatCash, type PricedCombo } from "../pricecheck/costs";
import { useOrderUp } from "./useOrderUp";
import { createInstantPlayGuard } from "../../lib/instantPlayGuard";
import { useGameFarm } from "../../components/GameFarmGate";

type Props = {
  onBack: () => void;
  onRunEnd?: (info: { cleared: boolean; correctCount: number; coinsEarned: number }) => void;
};

function reorder(
  list: PricedCombo[],
  from: number,
  to: number,
): PricedCombo[] {
  if (from === to || from < 0 || to < 0) return list;
  const next = list.slice();
  const [item] = next.splice(from, 1);
  if (!item) return list;
  next.splice(to, 0, item);
  return next;
}

function OrderTile({
  combo,
  index,
  revealed,
  dragActive,
  isDragging,
  correctPos,
  onPointerDown,
}: {
  combo: PricedCombo;
  index: number;
  revealed: boolean;
  dragActive: boolean;
  isDragging: boolean;
  /** 0-based correct rank when revealed, else null. */
  correctPos: number | null;
  onPointerDown: (index: number, e: ReactPointerEvent) => void;
}) {
  let tone = "";
  if (revealed && correctPos != null) {
    tone = correctPos === index ? "is-win" : "is-miss";
  }

  return (
    <article
      className={`order-tile ${tone}${isDragging ? " is-dragging" : ""}${dragActive ? " is-drag-active" : ""}`}
      onPointerDown={(e) => onPointerDown(index, e)}
      style={{ touchAction: "none" }}
    >
      <span className="order-tile__rank" aria-hidden>
        {index + 1}
      </span>
      <img
        className="order-tile__img"
        src={combo.entity.image}
        alt=""
        draggable={false}
      />
      <div className="order-tile__caption">
        <span className="order-tile__path">
          {formatPathLevels(combo.pathLevels)}
        </span>
        <span className="order-tile__name">{combo.entity.name}</span>
        {revealed ? (
          <span className="order-tile__cost">{formatCash(combo.cost)}</span>
        ) : null}
      </div>
    </article>
  );
}

export function OrderUpGame({ onBack, onRunEnd }: Props) {
  const {
    state,
    setOrder,
    lockIn,
    goNext,
    buyContinue,
    continueCost,
    roundsPerRun,
    maxLives,
    timerSeconds,
  } = useOrderUp();
  const { profile } = useAuth();
  const farm = useGameFarm();
  const guard = useRef(
    createInstantPlayGuard({ instantLimit: 3, nextLimit: 3 }),
  );
  const roundShownAt = useRef(
    typeof performance !== "undefined" ? performance.now() : 0,
  );
  const revealAt = useRef(0);
  const didDrag = useRef(false);

  const dragFrom = useRef<number | null>(null);
  const runEndNotified = useRef(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  const revealed = state.phase === "reveal";
  const playing = state.phase === "playing";

  useEffect(() => {
    if (state.phase === "playing") {
      roundShownAt.current =
        typeof performance !== "undefined" ? performance.now() : 0;
      didDrag.current = false;
    }
    if (state.phase === "reveal") {
      revealAt.current =
        typeof performance !== "undefined" ? performance.now() : 0;
    }
  }, [state.phase, state.round.round]);

  useEffect(() => {
    if (state.phase === "results" && !runEndNotified.current) {
      runEndNotified.current = true;
      onRunEnd?.({
        cleared: state.clearedRun,
        correctCount: state.correct,
        coinsEarned:
          (state.lastRun?.score ?? 0) * (state.perfectRun ? 2 : 1),
      });
    }
    if (state.phase !== "results") runEndNotified.current = false;
  }, [state.phase, state.clearedRun, state.correct, state.lastRun, state.perfectRun, onRunEnd]);

  const indexFromClientX = useCallback((clientX: number) => {
    const track = trackRef.current;
    if (!track) return 0;
    const tiles = track.querySelectorAll<HTMLElement>(".order-tile");
    if (!tiles.length) return 0;
    let best = 0;
    let bestDist = Infinity;
    tiles.forEach((el, i) => {
      const r = el.getBoundingClientRect();
      const mid = r.left + r.width / 2;
      const d = Math.abs(clientX - mid);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    return best;
  }, []);

  const onPointerDown = useCallback(
    (index: number, e: ReactPointerEvent) => {
      if (!playing) return;
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      dragFrom.current = index;
      didDrag.current = true;
      setDragId(state.order[index]?.id ?? null);
    },
    [playing, state.order],
  );

  useEffect(() => {
    if (dragId == null) return;

    const onMove = (e: PointerEvent) => {
      const from = dragFrom.current;
      if (from == null) return;
      const to = indexFromClientX(e.clientX);
      if (to === from) return;
      setOrder((prev) => {
        const next = reorder(prev, from, to);
        dragFrom.current = to;
        return next;
      });
    };
    const onUp = () => {
      dragFrom.current = null;
      setDragId(null);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [dragId, indexFromClientX, setOrder]);

  useEffect(() => {
    dragFrom.current = null;
    setDragId(null);
  }, [state.round.round, state.phase]);

  const onLockIn = useCallback(() => {
    const instant =
      !didDrag.current &&
      typeof performance !== "undefined" &&
      performance.now() - roundShownAt.current < 2500;
    if (guard.current.markAction(instant)) farm?.reportInstantSpam();
    lockIn();
  }, [farm, lockIn]);

  const onGoNext = useCallback(() => {
    const instant =
      typeof performance !== "undefined" &&
      performance.now() - revealAt.current < 800;
    if (guard.current.markNext(instant)) farm?.reportInstantSpam();
    goNext();
  }, [farm, goNext]);

  useEffect(() => {
    if (state.phase !== "reveal") return;
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onGoNext();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state.phase, onGoNext]);

  if (state.phase === "results" && state.lastRun) {
    return (
      <div className="orderup-page">
        <ResultsScreen
          coinsEarned={
            state.lastRun.score * (state.perfectRun ? 2 : 1)
          }
          cleared={state.clearedRun}
          perfect={state.perfectRun}
          continueAvailable={!state.freePlay && !state.clearedRun}
          continueCost={continueCost}
          canAffordContinue={(profile?.coins ?? 0) >= continueCost}
          continueBusy={state.continueBusy}
          continueError={state.continueError}
          onContinue={() => {
            void buyContinue();
          }}
          onBack={onBack}
        />
      </div>
    );
  }

  const attemptsUsed = maxLives - state.lives;
  const endLabel =
    state.lives <= 0 ||
    (!state.freePlay && state.round.round >= roundsPerRun)
      ? "DONE"
      : "NEXT";

  const secondsLeft = Math.ceil(state.timeLeftMs / 1000);
  const urgent = playing && state.timeLeftMs <= 3000;

  const correctRank = new Map(
    state.round.correctIds.map((id, i) => [id, i] as const),
  );

  return (
    <div className={`orderup-page ${revealed ? "is-reveal" : ""}`}>
      <GameHeader
        title="ORDER UP"
        icon=""
        round={state.round.round}
        roundsPerRun={roundsPerRun}
        freePlay={state.freePlay}
      />

      <main className="orderup-main">
        <div className="orderup-prompt">
          <div className="orderup-prompt__row">
            <h2>Cheapest → most expensive</h2>
            <div className="orderup-prompt__hud">
              <LivesMeter maxAttempts={maxLives} attemptsUsed={attemptsUsed} />
            </div>
          </div>
          {playing ? (
            <div
              className={`orderup-timer ${urgent ? "is-urgent" : ""}`}
              role="timer"
              aria-live="off"
              aria-label={`${secondsLeft} seconds left`}
            >
              <div className="orderup-timer__track">
                <div
                  className="orderup-timer__fill"
                  key={state.round.round}
                  style={{ animationDuration: `${timerSeconds}s` }}
                />
              </div>
              <span className="orderup-timer__num">{secondsLeft}</span>
            </div>
          ) : state.feedback ? (
            <p
              className={`orderup-result ${state.feedback.correct ? "is-win" : state.feedback.points > 0 ? "is-partial" : "is-miss"}`}
            >
              {state.feedback.correct
                ? `Correct! +${state.feedback.points}`
                : state.feedback.points > 0
                  ? `${state.feedback.placedCorrect}/${state.feedback.handSize} right · +${state.feedback.points}`
                  : "Wrong order"}
            </p>
          ) : null}
        </div>

        <div className="orderup-axis" aria-hidden>
          <span>← CHEAP</span>
          <span>EXPENSIVE →</span>
        </div>

        <div
          ref={trackRef}
          className={`orderup-track ${revealed ? "is-reveal" : ""}`}
          style={{ ["--order-n" as string]: state.order.length }}
        >
          {state.order.map((combo, i) => (
            <OrderTile
              key={combo.id}
              combo={combo}
              index={i}
              revealed={revealed}
              dragActive={dragId != null}
              isDragging={dragId === combo.id}
              correctPos={
                revealed ? (correctRank.get(combo.id) ?? null) : null
              }
              onPointerDown={onPointerDown}
            />
          ))}
        </div>

        {playing ? (
          <div className="orderup-actions">
            <p className="orderup-hint">Drag to reorder</p>
            <button
              type="button"
              className="btn btn--primary btn--lg"
              onClick={onLockIn}
            >
              LOCK IN
            </button>
          </div>
        ) : null}
      </main>

      {revealed ? (
        <div className="orderup-next-bar">
          <button
            type="button"
            className="btn btn--primary btn--lg orderup-next-bar__btn"
            onClick={onGoNext}
            autoFocus
          >
            {endLabel}
          </button>
        </div>
      ) : null}
    </div>
  );
}
