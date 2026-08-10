import { useEffect, useRef } from "react";
import { CashAmount } from "../../components/CurrencyChip";
import { GameHeader } from "../../components/GameHeader";
import { LivesMeter } from "../../components/LivesMeter";
import { BLOON_IMAGES, HERO_LIVES } from "./config";
import { useBloonHero } from "./useBloonHero";

type Props = {
  onBack: () => void;
  onRunEnd?: (info: { cleared: boolean; coinsEarned: number }) => void;
};

export function BloonHeroGame({ onBack, onRunEnd }: Props) {
  const { state, chart, start, restart, applyHit, visibleNotes, approach } =
    useBloonHero();
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
  const attemptsUsed = HERO_LIVES - state.lives;
  const progress = Math.min(100, (state.songTime / chart.duration) * 100);

  return (
    <div className={`hero-page${state.phase === "results" ? " is-done" : ""}`}>
      <GameHeader title="BLOON HERO" icon="" />

      <main className="hero-main">
        <div className="hero-hud">
          <span className="hero-stat">
            <strong>{state.combo}</strong>
            <span>combo</span>
          </span>
          <LivesMeter maxAttempts={HERO_LIVES} attemptsUsed={attemptsUsed} />
          <span className="hero-stat hero-stat--cash">
            <CashAmount amount={state.cashEarned} size={18} />
          </span>
        </div>

        {playing && state.lastJudge ? (
          <p
            className={`hero-judge is-${state.lastJudge}`}
            key={`${state.perfect}-${state.great}-${state.good}-${state.miss}`}
          >
            {state.lastJudge.toUpperCase()}
          </p>
        ) : (
          <p className="hero-hint">
            {playing
              ? "D F · J K — hit when bloons meet the line"
              : `${chart.title} · ${chart.bpm} BPM`}
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
                style={{ ["--lane" as string]: lane.color }}
                aria-label={`Lane ${lane.label}`}
                onPointerDown={(e) => {
                  e.preventDefault();
                  if (!playing) return;
                  applyHit(lane.id);
                }}
              >
                <div className="hero-lane__notes">
                  {notes
                    .filter((n) => n.lane === lane.id)
                    .map((n) => {
                      const t =
                        playing || state.phase === "results"
                          ? state.songTime
                          : 0;
                      // 1 at spawn, 0 at hit line
                      const u = Math.min(1, Math.max(0, (n.t - t) / approach));
                      const y = (1 - u) * 100;
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
                <div className="hero-hitline" />
                <span className="hero-key">{lane.label}</span>
              </button>
            ))}
          </div>

          {state.phase === "ready" ? (
            <div className="hero-overlay">
              <h2>BLOON HERO</h2>
              <p>
                {chart.title}, four lanes, Guitar Hero style. Hit D F J K
                (or tap) when bloons land on the line. Missed notes stay silent.
              </p>
              <button type="button" className="btn btn--primary" onClick={start}>
                Play
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
                {state.perfect} perfect · {state.great} great · {state.good}{" "}
                good · {state.miss} miss · max combo {state.maxCombo}
              </p>
              <div className="hero-overlay__actions">
                <button type="button" className="btn btn--primary" onClick={() => { restart(); start(); }}>
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
