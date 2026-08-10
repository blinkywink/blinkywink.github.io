import { useEffect, useRef, type CSSProperties } from "react";
import { CashAmount } from "../../components/CurrencyChip";
import { GameHeader } from "../../components/GameHeader";
import { LivesMeter } from "../../components/LivesMeter";
import { BLOON_IMAGES } from "./config";
import { DIFFICULTY_META, type Difficulty } from "./difficulty";
import { useBloonHero } from "./useBloonHero";

type Props = {
  onBack: () => void;
  onRunEnd?: (info: { cleared: boolean; coinsEarned: number }) => void;
};

const DIFFS: Difficulty[] = ["easy", "normal", "hard"];

export function BloonHeroGame({ onBack, onRunEnd }: Props) {
  const {
    state,
    chart,
    noteCounts,
    start,
    restart,
    setDifficulty,
    applyHit,
    visibleNotes,
    approach,
    noteY,
    maxLives,
  } = useBloonHero();
  const prevPhase = useRef(state.phase);
  const notes = visibleNotes();

  useEffect(() => {
    const was = prevPhase.current;
    prevPhase.current = state.phase;
    if (was === "results") return;
    if (state.phase === "results") {
      onRunEnd?.({ cleared: state.cleared, coinsEarned: state.cashEarned });
    }
  }, [state.phase, state.cleared, state.cashEarned, onRunEnd]);

  const playing = state.phase === "playing";
  const countingIn = playing && state.songTime < 0;
  const attemptsUsed = maxLives - state.lives;
  const progress = Math.min(
    100,
    Math.max(0, (state.songTime / chart.duration) * 100),
  );
  const meta = DIFFICULTY_META[state.difficulty];
  const scrollPx = state.phase === "ready" ? 0 : state.songTime * 140;

  return (
    <div className={`hero-page${state.phase === "results" ? " is-done" : ""}`}>
      <GameHeader title="BLOON HERO" icon="" />

      <main className="hero-main">
        <div className="hero-hud">
          <span className="hero-stat">
            <strong>{state.combo}</strong>
            <span>combo</span>
          </span>
          <LivesMeter maxAttempts={maxLives} attemptsUsed={attemptsUsed} />
          <span className="hero-stat hero-stat--cash">
            <CashAmount amount={state.cashEarned} size={18} />
          </span>
        </div>

        {playing && state.lastJudge && !countingIn ? (
          <p
            className={`hero-judge is-${state.lastJudge}`}
            key={`${state.perfect}-${state.great}-${state.good}-${state.miss}`}
          >
            {state.lastJudge.toUpperCase()}
          </p>
        ) : (
          <p className="hero-hint">
            {countingIn
              ? "Feel the beat…"
              : playing
                ? "Tap when a bloon covers its outline"
                : `${chart.title} · ${meta.label}`}
          </p>
        )}

        <div className="hero-stage">
          <div className="hero-progress" aria-hidden>
            <span style={{ width: `${progress}%` }} />
          </div>

          <div className="hero-board" role="application" aria-label="Bloon Hero lanes">
            {chart.lanes.map((lane) => (
              <button
                key={lane.id}
                type="button"
                className="hero-lane"
                style={
                  {
                    ["--lane" as string]: lane.color,
                    ["--scroll" as string]: `${scrollPx}px`,
                  } as CSSProperties
                }
                aria-label={`Lane ${lane.label}`}
                onPointerDown={(e) => {
                  e.preventDefault();
                  if (!playing) return;
                  applyHit(lane.id);
                }}
              >
                <div className="hero-lane__highway" aria-hidden />
                <div className="hero-lane__notes">
                  {notes
                    .filter((n) => n.lane === lane.id)
                    .map((n) => {
                      const t =
                        playing || state.phase === "results"
                          ? state.songTime
                          : 0;
                      const y = noteY(t, n.t, approach);
                      return (
                        <img
                          key={n.id}
                          className={`hero-note${n.result === "miss" ? " is-miss" : ""}`}
                          src={BLOON_IMAGES[lane.id]}
                          alt=""
                          draggable={false}
                          style={{ top: `${y}%` }}
                        />
                      );
                    })}
                </div>
                <div className="hero-target" aria-hidden>
                  <img
                    className="hero-target__fill"
                    src={BLOON_IMAGES[lane.id]}
                    alt=""
                    draggable={false}
                  />
                  <img
                    className="hero-target__outline"
                    src={BLOON_IMAGES[lane.id]}
                    alt=""
                    draggable={false}
                  />
                </div>
                <div className="hero-hitline" />
                <span className="hero-key">{lane.label}</span>
              </button>
            ))}
          </div>

          {playing && state.countdown ? (
            <div className="hero-countdown" aria-live="polite">
              <span key={state.countdown}>{state.countdown}</span>
            </div>
          ) : null}

          {state.phase === "ready" ? (
            <div className="hero-overlay">
              <h2>BLOON HERO</h2>
              <p>
                Match falling bloons to the outlines. Keyboard: D F J K. Missed
                notes stay silent. Harder modes pay more.
              </p>
              <div className="hero-diff" role="group" aria-label="Difficulty">
                {DIFFS.map((d) => {
                  const m = DIFFICULTY_META[d];
                  const active = state.difficulty === d;
                  return (
                    <button
                      key={d}
                      type="button"
                      className={`hero-diff__btn${active ? " is-active" : ""}`}
                      onClick={() => setDifficulty(d)}
                    >
                      <strong>{m.label}</strong>
                      <span>
                        {noteCounts[d]} notes · ×{m.cashMul.toFixed(1)} cash
                      </span>
                    </button>
                  );
                })}
              </div>
              <button type="button" className="btn btn--primary" onClick={start}>
                Play {meta.label}
              </button>
            </div>
          ) : null}

          {state.phase === "results" ? (
            <div
              className={`hero-overlay${state.cleared ? " is-win" : " is-lose"}`}
              role="status"
            >
              <h2>{state.cleared ? "Track cleared!" : "Popped out"}</h2>
              <p className="hero-overlay__score">
                <CashAmount amount={state.cashEarned} size={22} />
              </p>
              <p className="hero-overlay__detail">
                {meta.label} · {state.perfect} perfect · {state.great} great ·{" "}
                {state.good} good · {state.miss} miss · max combo{" "}
                {state.maxCombo}
              </p>
              <div className="hero-overlay__actions">
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => {
                    restart();
                    start();
                  }}
                >
                  Play again
                </button>
                <button type="button" className="btn btn--ghost" onClick={onBack}>
                  Games
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}
