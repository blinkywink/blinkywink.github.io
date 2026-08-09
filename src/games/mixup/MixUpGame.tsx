import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { AnswerReveal } from "../../components/AnswerReveal";
import { AnswerSearch } from "../../components/AnswerSearch";
import { ChallengeImage } from "../../components/ChallengeImage";
import { GameHeader } from "../../components/GameHeader";
import { MapAnswerSearch } from "../../components/MapAnswerSearch";
import { formatPathLevels } from "../../lib/pathCombos";
import type { TransformParams } from "../../utils/imageProcessing";
import { CAMO_IMAGE } from "../camodetection/config";
import { isCorrectOrder } from "../orderup/generateRound";
import { formatCash, type PricedCombo } from "../pricecheck/costs";
import {
  MIXUP_CONFIG,
  MIXUP_KIND_LABEL,
  type MixupKind,
} from "./config";
import type { MixupQuestion } from "./generateRun";
import { mixupQuestionValue } from "./scoring";
import { useMixUp } from "./useMixUp";

type Props = {
  onBack: () => void;
  onRunEnd?: (info: { cleared: boolean; bestStreak: number }) => void;
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

function PricePanel({
  question,
  revealed,
  onGuess,
}: {
  question: Extract<MixupQuestion, { kind: "pricecheck" }>;
  revealed: boolean;
  onGuess: (side: "left" | "right") => void;
}) {
  const { left, right } = question.payload;
  const renderSide = (sideKey: "left" | "right", side: typeof left) => (
    <button
      type="button"
      className={`price-side price-side--n${Math.min(side.combos.length, 5)}`}
      disabled={revealed}
      onClick={() => onGuess(sideKey)}
    >
      <span className="price-side__label">
        {sideKey === "left" ? "Left" : "Right"}
      </span>
      <div className="price-side__art">
        {side.combos.map((c) => (
          <article key={c.id} className="price-tile">
            <img
              className="price-tile__img"
              src={c.entity.image}
              alt=""
              draggable={false}
            />
            <div className="price-tile__caption">
              <span className="price-tile__path">
                {formatPathLevels(c.pathLevels)}
              </span>
              <span className="price-tile__name">{c.entity.name}</span>
              {revealed ? (
                <span className="price-tile__cost">{formatCash(c.cost)}</span>
              ) : null}
            </div>
          </article>
        ))}
      </div>
      {revealed ? (
        <span className="price-side__total">{formatCash(side.total)}</span>
      ) : (
        <span className="price-side__hint">Higher</span>
      )}
    </button>
  );

  return (
    <div className="price-arena mixup-embed">
      {renderSide("left", left)}
      <div className="price-vs" aria-hidden>
        VS
      </div>
      {renderSide("right", right)}
    </div>
  );
}

function OrderPanel({
  question,
  revealed,
  locked,
  onSubmit,
}: {
  question: Extract<MixupQuestion, { kind: "orderup" }>;
  revealed: boolean;
  locked: boolean;
  onSubmit: (ids: string[]) => void;
}) {
  const [items, setItems] = useState(() => question.payload.items.slice());
  const dragFrom = useRef<number | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);

  useEffect(() => {
    setItems(question.payload.items.slice());
    dragFrom.current = null;
    setDragging(null);
  }, [question.payload]);

  const onPointerDown = (index: number, e: ReactPointerEvent) => {
    if (revealed || locked) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragFrom.current = index;
    setDragging(index);
  };

  const onPointerUp = () => {
    dragFrom.current = null;
    setDragging(null);
  };

  const onPointerEnter = (index: number) => {
    if (dragFrom.current == null || revealed || locked) return;
    const from = dragFrom.current;
    if (from === index) return;
    setItems((list) => reorder(list, from, index));
    dragFrom.current = index;
    setDragging(index);
  };

  const correctRank = useMemo(() => {
    const map = new Map(
      question.payload.correctIds.map((id, i) => [id, i] as const),
    );
    return map;
  }, [question.payload.correctIds]);

  return (
    <div className="orderup-track mixup-embed">
      {items.map((combo, index) => {
          const rank = correctRank.get(combo.id);
          let tone = "";
          if (revealed && rank != null) {
            tone = rank === index ? "is-win" : "is-miss";
          }
          return (
            <article
              key={combo.id}
              className={`order-tile ${tone}${dragging === index ? " is-dragging" : ""}`}
              onPointerDown={(e) => onPointerDown(index, e)}
              onPointerEnter={() => onPointerEnter(index)}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
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
                  <span className="order-tile__cost">
                    {formatCash(combo.cost)}
                  </span>
                ) : null}
              </div>
            </article>
          );
        })}
      {!revealed ? (
        <div className="orderup-actions">
          <button
            type="button"
            className="btn btn--primary"
            disabled={locked}
            onClick={() => onSubmit(items.map((c) => c.id))}
          >
            Lock in
          </button>
        </div>
      ) : null}
    </div>
  );
}

function CamoPanel({
  question,
  revealed,
  locked,
  onSubmit,
}: {
  question: Extract<MixupQuestion, { kind: "camodetection" }>;
  revealed: boolean;
  locked: boolean;
  onSubmit: (picked: number[]) => void;
}) {
  const { grid, camo, flashMs } = question.payload;
  const cells = grid * grid;
  const [phase, setPhase] = useState<"watching" | "recalling">("watching");
  const [picked, setPicked] = useState<Set<number>>(() => new Set());
  const camoSet = useMemo(() => new Set(camo), [camo]);

  useEffect(() => {
    setPhase("watching");
    setPicked(new Set());
    const t = window.setTimeout(() => setPhase("recalling"), flashMs);
    return () => window.clearTimeout(t);
  }, [question.payload, flashMs]);

  const toggle = (i: number) => {
    if (phase !== "recalling" || revealed || locked) return;
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  return (
    <div className={`camo-main mixup-embed${phase === "watching" ? " is-watching" : ""}`}>
      <p className="mixup-camo-hint">
        {phase === "watching"
          ? "Memorize the camo bloons…"
          : "Tap where the camo were"}
      </p>
      <div
        className="camo-grid"
        style={
          {
            "--camo-n": grid,
          } as CSSProperties
        }
      >
        {Array.from({ length: cells }, (_, i) => {
          const isCamo = camoSet.has(i);
          const isPicked = revealed ? picked.has(i) : picked.has(i);
          const showCamo =
            phase === "watching"
              ? isCamo
              : revealed
                ? isCamo || isPicked
                : isPicked;
          let tone = "";
          if (revealed) {
            if (isCamo && isPicked) tone = "is-hit";
            else if (isCamo) tone = "is-miss";
            else if (isPicked) tone = "is-wrong";
          } else if (isPicked) {
            tone = "is-picked";
          }
          return (
            <button
              key={i}
              type="button"
              className={`camo-cell ${tone}`}
              disabled={phase !== "recalling" || revealed || locked}
              onClick={() => toggle(i)}
            >
              {showCamo ? (
                <img src={CAMO_IMAGE} alt="" draggable={false} />
              ) : null}
            </button>
          );
        })}
      </div>
      {phase === "recalling" && !revealed ? (
        <button
          type="button"
          className="btn btn--primary"
          disabled={locked}
          onClick={() => onSubmit([...picked].sort((a, b) => a - b))}
        >
          Submit
        </button>
      ) : null}
    </div>
  );
}

function SearchPanel({
  kind,
  question,
  revealed,
  locked,
  onAnswer,
}: {
  kind: "zoomed" | "geoguessr";
  question: Extract<MixupQuestion, { kind: "zoomed" | "geoguessr" }>;
  revealed: boolean;
  locked: boolean;
  onAnswer: (ok: boolean) => void;
}) {
  const [transform, setTransform] = useState<TransformParams | null>(null);
  const payload = question.payload;
  const correctId = payload.correct.id;

  return (
    <div className="zoomed-main mixup-embed">
      <div className={`zoomed-stage${revealed ? " zoomed-stage--reveal" : ""}`}>
        {revealed ? (
          <AnswerReveal
            imageSrc={payload.correct.image}
            name={payload.correct.name}
            transform={transform}
          />
        ) : (
          <ChallengeImage
            imageSrc={payload.correct.image}
            difficulty={payload.difficulty}
            seed={`${payload.round}-${payload.correct.id}-${payload.startedAt}`}
            onTransformChange={setTransform}
          />
        )}
      </div>
      {!revealed ? (
        <div className="zoomed-controls">
          {kind === "zoomed" ? (
            <AnswerSearch
              disabled={locked}
              roundKey={`${payload.round}-${correctId}`}
              onSelect={(entity) => onAnswer(entity.id === correctId)}
            />
          ) : (
            <MapAnswerSearch
              disabled={locked}
              roundKey={`${payload.round}-${correctId}`}
              onSelect={(entity) => onAnswer(entity.id === correctId)}
            />
          )}
        </div>
      ) : null}
    </div>
  );
}

export function MixUpGame({ onBack, onRunEnd }: Props) {
  const { state, current, roundsPerRun, settle, goNext, playAgain } =
    useMixUp();
  const runEndNotified = useRef(false);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (state.phase === "results" && state.results && !runEndNotified.current) {
      runEndNotified.current = true;
      onRunEnd?.({
        cleared: state.results.correct === state.results.total,
        bestStreak: state.results.correct,
      });
    }
    if (state.phase !== "results") runEndNotified.current = false;
  }, [state.phase, state.results, onRunEnd]);

  // Timers for price / order
  useEffect(() => {
    if (state.phase !== "playing" || !current) return;
    if (current.kind !== "pricecheck" && current.kind !== "orderup") return;
    setTimedOut(false);
    const secs =
      current.kind === "pricecheck"
        ? MIXUP_CONFIG.priceTimerSeconds
        : MIXUP_CONFIG.orderTimerSeconds;
    const t = window.setTimeout(() => {
      setTimedOut(true);
      settle(false);
    }, secs * 1000);
    return () => window.clearTimeout(t);
  }, [state.phase, current, settle]);

  const onRevealNext = useCallback(() => {
    goNext();
  }, [goNext]);

  useEffect(() => {
    if (state.phase !== "reveal") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onRevealNext();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state.phase, onRevealNext]);

  if (state.phase === "results" && state.results) {
    const r = state.results;
    const cleared = r.correct === r.total;
    return (
      <div className="mixup-page">
        <div className="results">
          <div className="results__card">
            <p className="eyebrow">Mix Up</p>
            <h2 className="results__title">
              {cleared ? "MIX CLEAR" : "MIX DONE"}
            </h2>
            <p className="mixup-results__scoreline">
              {r.correct} / {r.total} correct
            </p>
            <div className="results__hero-score">
              <span className="results__hero-value">
                +{r.totalCash.toLocaleString()}
              </span>
              <span className="results__hero-label">Cash earned</span>
            </div>
            <p className="mixup-results__breakdown">
              Questions {r.base.toLocaleString()}
              {r.bonus > 0
                ? ` + ${Math.round(MIXUP_CONFIG.clearBonusRate * 100)}% bonus ${r.bonus.toLocaleString()}`
                : ""}
            </p>
            <p className="mixup-results__note">
              Cash is paid at the end only. Bonus applies to what you got right.
            </p>
            <div className="results__actions">
              <button
                type="button"
                className="btn btn--primary"
                onClick={playAgain}
              >
                Play again
              </button>
              <button type="button" className="btn btn--ghost" onClick={onBack}>
                Back
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!current) return null;

  const kindLabel = MIXUP_KIND_LABEL[current.kind as MixupKind];
  const potential = mixupQuestionValue(current.kind);
  const revealed = state.phase === "reveal";
  const locked = revealed || timedOut;

  let status = `Medium ${kindLabel}`;
  if (revealed && state.feedback) {
    status = state.feedback.correct
      ? `Correct (+${state.feedback.value.toLocaleString()} later)`
      : "Wrong";
  }

  return (
    <div className="mixup-page">
      <GameHeader
        title="MIX UP"
        icon=""
        round={state.index + 1}
        roundsPerRun={roundsPerRun}
      />

      <main className="mixup-main">
        <div className="mixup-banner">
          <div>
            <p className="mixup-banner__kind">{kindLabel}</p>
            <h2
              className={
                revealed
                  ? state.feedback?.correct
                    ? "is-win"
                    : "is-miss"
                  : undefined
              }
            >
              {status}
            </h2>
          </div>
          <p className="mixup-banner__note">
            Worth {potential.toLocaleString()} Cash at the end
            {revealed ? "" : " · no payout until you finish"}
          </p>
        </div>

        {current.kind === "zoomed" || current.kind === "geoguessr" ? (
          <SearchPanel
            kind={current.kind}
            question={current}
            revealed={revealed}
            locked={locked}
            onAnswer={(ok) => settle(ok)}
          />
        ) : null}

        {current.kind === "pricecheck" ? (
          <PricePanel
            question={current}
            revealed={revealed}
            onGuess={(side) =>
              settle(side === current.payload.answer)
            }
          />
        ) : null}

        {current.kind === "orderup" ? (
          <OrderPanel
            question={current}
            revealed={revealed}
            locked={locked}
            onSubmit={(ids) =>
              settle(isCorrectOrder(ids, current.payload.correctIds))
            }
          />
        ) : null}

        {current.kind === "camodetection" ? (
          <CamoPanel
            question={current}
            revealed={revealed}
            locked={locked}
            onSubmit={(picked) => {
              const want = current.payload.camo;
              const ok =
                picked.length === want.length &&
                picked.every((v, i) => v === want[i]);
              settle(ok);
            }}
          />
        ) : null}

        {revealed ? (
          <button
            type="button"
            className="btn btn--primary mixup-next"
            onClick={onRevealNext}
          >
            {state.index + 1 >= roundsPerRun ? "See results" : "Next"}
          </button>
        ) : null}
      </main>
    </div>
  );
}
