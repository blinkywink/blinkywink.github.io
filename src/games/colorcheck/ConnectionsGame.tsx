import { useEffect, useRef } from "react";
import { CashAmount } from "../../components/CurrencyChip";
import { GameHeader } from "../../components/GameHeader";
import { isTypingTarget } from "../../lib/keyboard";
import type { TowerEntity } from "../../data/types";
import {
  entityById,
  type ConnectionDifficulty,
  type ConnectionGroup,
} from "./generatePuzzle";
import {
  connectionsDailyReward,
  connectionsPracticeReward,
} from "./config";
import { claimDailyHaulOnce, useConnections } from "./useConnections";

type Props = {
  onBack: () => void;
  onRunEnd?: (info: {
    cleared: boolean;
    correctCount: number;
    coinsEarned: number;
    mode: "daily" | "practice";
    fresh: boolean;
  }) => void;
};

const DIFF_CLASS: Record<ConnectionDifficulty, string> = {
  0: "is-diff-0",
  1: "is-diff-1",
  2: "is-diff-2",
  3: "is-diff-3",
};

function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function SolvedRow({ group }: { group: ConnectionGroup }) {
  const ents = group.entityIds
    .map((id) => entityById(id))
    .filter(Boolean) as TowerEntity[];
  return (
    <div
      className={`conn-solved ${DIFF_CLASS[group.difficulty]}`}
      role="status"
    >
      <div className="conn-solved__label">{group.label}</div>
      <div className="conn-solved__names">
        {ents.map((e) => e.name).join(" · ")}
      </div>
    </div>
  );
}

function Tile({
  entity,
  selected,
  onToggle,
}: {
  entity: TowerEntity;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className={`conn-tile${selected ? " is-selected" : ""}`}
      onClick={onToggle}
      aria-pressed={selected}
    >
      <img
        className="conn-tile__img"
        src={entity.image}
        alt=""
        draggable={false}
      />
      <span className="conn-tile__name">{entity.name}</span>
    </button>
  );
}

/** Connections with BTD towers (Color Check arcade slot). */
export function ColorCheckGame({ onBack, onRunEnd }: Props) {
  const {
    state,
    toggle,
    deselectAll,
    submit,
    playPractice,
    markHaulReported,
  } = useConnections();

  const prevStatus = useRef(state.status);
  const dailyHaulLock = useRef(state.haulReported);
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
      onRunEnd?.({
        cleared: true,
        correctCount: state.solved.length,
        coinsEarned:
          state.reward > 0 ? state.reward : connectionsPracticeReward(),
        mode: "practice",
        fresh: true,
      });
      return;
    }

    if (!state.haulReported && !dailyHaulLock.current) {
      dailyHaulLock.current = true;
      claimDailyHaulOnce(state.day);
      markHaulReported();
    }

    if (state.haulReported || !wasPlaying || runEndLock.current) return;
    runEndLock.current = true;
    onRunEnd?.({
      cleared: true,
      correctCount: state.solved.length,
      coinsEarned: state.reward > 0 ? state.reward : connectionsDailyReward(),
      mode: "daily",
      fresh: true,
    });
  }, [
    state.status,
    state.mode,
    state.day,
    state.solved.length,
    state.reward,
    state.haulReported,
    markHaulReported,
    onRunEnd,
  ]);

  useEffect(() => {
    if (state.status !== "playing") return;
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (e.key === "Enter") {
        e.preventDefault();
        submit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        deselectAll();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state.status, submit, deselectAll]);

  const isDaily = state.mode === "daily";
  const done = state.status === "won";
  const canSubmit = state.selected.length === 4 && !done;

  return (
    <div className={`conn-page${done ? " is-cleared" : ""}`}>
      <GameHeader title="CONNECTIONS" icon="" />

      <main className="conn-main">
        <div className="conn-stage">
          <p className="conn-prompt">
            {done
              ? isDaily
                ? "Daily complete"
                : "Practice complete"
              : isDaily
                ? "Daily · four groups of four"
                : "Practice · four groups of four"}
          </p>

          <div className="conn-solved-stack">
            {state.solved.map((g) => (
              <SolvedRow key={g.id} group={g} />
            ))}
          </div>

          {!done ? (
            <div
              className="conn-grid"
              role="grid"
              aria-label="Connections board"
            >
              {state.remaining.map((id) => {
                const entity = entityById(id);
                if (!entity) return null;
                return (
                  <Tile
                    key={id}
                    entity={entity}
                    selected={state.selected.includes(id)}
                    onToggle={() => toggle(id)}
                  />
                );
              })}
            </div>
          ) : null}

          {!done ? (
            <div className="conn-hud">
              {state.toast ? (
                <p className="conn-toast" role="status">
                  {state.toast}
                </p>
              ) : (
                <p className="conn-toast conn-toast--spacer">.</p>
              )}
            </div>
          ) : null}
        </div>
      </main>

      <footer className="conn-footer">
        {done ? (
          <div className="conn-result">
            {state.reward > 0 ? (
              <p className="conn-result__cash">
                <CashAmount amount={state.reward} size={28} />
              </p>
            ) : isDaily && state.awarded ? (
              <p className="conn-result__hint">
                Already collected today's payout.
              </p>
            ) : null}
            {isDaily ? (
              <p className="conn-result__hint">
                Next daily in {formatCountdown(state.msUntilNext)}
              </p>
            ) : null}
            <button
              type="button"
              className="btn btn--primary conn-submit"
              onClick={playPractice}
              autoFocus
            >
              {isDaily ? "Practice" : "New practice"}
            </button>
            <button type="button" className="btn conn-back" onClick={onBack}>
              Back
            </button>
          </div>
        ) : (
          <div className="conn-actions">
            <button
              type="button"
              className="btn btn--primary conn-submit"
              disabled={!canSubmit}
              onClick={submit}
            >
              Submit
            </button>
          </div>
        )}
      </footer>
    </div>
  );
}
