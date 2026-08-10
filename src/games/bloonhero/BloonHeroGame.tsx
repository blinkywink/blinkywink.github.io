import { useEffect, useRef, type CSSProperties } from "react";
import { CashAmount } from "../../components/CurrencyChip";
import { GameHeader } from "../../components/GameHeader";
import { LivesMeter } from "../../components/LivesMeter";
import { EMPTY_STREAK_KILL } from "./config";
import { useBloonHero } from "./useBloonHero";

type Props = {
  onBack: () => void;
  onRunEnd?: (info: { cleared: boolean; coinsEarned: number }) => void;
};

export function BloonHeroGame({ onBack, onRunEnd }: Props) {
  const {
    state,
    chart,
    start,
    restart,
    applyHit,
    visibleNotes,
    approach,
    noteY,
    maxLives,
    loopProgress,
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
  const progress = loopProgress(state.songTime);
  const scrollPx = state.phase === "ready" ? 0 : state.songTime * 168;

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
          <span className="hero-stat">
            <strong>{state.loops}</strong>
            <span>loops</span>
          </span>
          <span className="hero-stat hero-stat--cash">
            <CashAmount amount={state.cashEarned} size={18} />
          </span>
        </div>

        {playing && state.lastJudge && !countingIn ? (
          <p
            className={`hero-judge is-${state.lastJudge}`}
            key={`${state.perfect}-${state.great}-${state.good}-${state.miss}-${state.emptyStreak}-${state.burst?.id ?? 0}`}
          >
            {state.lastJudge === "miss" && state.emptyStreak > 0
              ? state.emptyStreak >= EMPTY_STREAK_KILL - 1
                ? "DON'T SPAM"
                : "WHIFF"
              : state.lastJudge.toUpperCase()}
          </p>
        ) : (
          <p className="hero-hint">
            {countingIn
              ? "Feel the beat…"
              : playing
                ? state.emptyStreak >= 2
                  ? `Wrong taps ×${state.emptyStreak} — stop spamming`
                  : "Hit when a key meets the receptor"
                : `${chart.title} · bar ${chart.offsetBar}, then loops bar ${chart.loopBar}`}
          </p>
        )}

        <div className="hero-stage">
          <div className="hero-progress" aria-hidden>
            <span style={{ width: `${progress}%` }} />
          </div>

          <div className="hero-board" role="application" aria-label="Bloon Hero lanes">
            {chart.lanes.map((lane) => {
              const pressed = state.pressed.includes(lane.id);
              const burst =
                state.burst?.lane === lane.id ? state.burst : null;
              return (
                <button
                  key={lane.id}
                  type="button"
                  className={[
                    "hero-lane",
                    pressed ? "is-pressed" : "",
                    burst ? `is-burst is-${burst.judge}` : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
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
                        const yHead = noteY(t, n.t, approach);
                        const missed = n.result === "miss";
                        return (
                          <div
                            key={n.id}
                            className={`hero-note${missed ? " is-miss" : ""}`}
                          >
                            <span
                              className="hero-note__key"
                              style={{ top: `${yHead}%` }}
                            />
                          </div>
                        );
                      })}
                  </div>
                  <div className="hero-target" aria-hidden>
                    <span className="hero-target__key" />
                  </div>
                  {burst ? (
                    <span
                      key={burst.id}
                      className={`hero-burst is-${burst.judge}`}
                      aria-hidden
                    />
                  ) : null}
                  <div className="hero-hitline" />
                  <span className="hero-key">{lane.label}</span>
                </button>
              );
            })}
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
                Starts at bar {chart.offsetBar}, then loops from bar{" "}
                {chart.loopBar} forever. Match falling piano keys to the
                receptors. Wrong taps burn lives — spam and you pop out. D F J K
                (or tap).
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
              <h2>{state.cleared ? "Nice run!" : "Popped out"}</h2>
              <p className="hero-overlay__score">
                <CashAmount amount={state.cashEarned} size={22} />
              </p>
              <p className="hero-overlay__detail">
                {state.loops} loop{state.loops === 1 ? "" : "s"} ·{" "}
                {state.perfect} perfect · {state.great} great · {state.good}{" "}
                good · {state.miss} miss · max combo {state.maxCombo}
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
