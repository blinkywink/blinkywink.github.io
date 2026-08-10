import {
  useEffect,
  useRef,
  type CSSProperties,
  type FormEvent,
} from "react";
import { CashAmount } from "../../components/CurrencyChip";
import { GameHeader } from "../../components/GameHeader";
import { LivesMeter } from "../../components/LivesMeter";
import { EMPTY_STREAK_KILL, LANES, noteY } from "./config";
import {
  enchorArtUrl,
  expertNotesFor,
  playableInstrumentsOnHit,
} from "./enchorApi";
import { INSTRUMENT_LABEL } from "./instruments";
import { useBloonHero } from "./useBloonHero";

type Props = {
  onBack: () => void;
  onRunEnd?: (info: { cleared: boolean; coinsEarned: number }) => void;
};

export function BloonHeroGame({ onBack, onRunEnd }: Props) {
  const {
    state,
    artUrl,
    noteCount,
    search,
    setQuery,
    setVolume,
    pickSong,
    setInstrument,
    start,
    restart,
    backToBrowse,
    applyHit,
    releaseLane,
    visibleNotes,
    approach,
    maxLives,
    setBoardEl,
    setProgressFillEl,
    setNoteEl,
  } = useBloonHero();

  const volumeSlider = (
    <label className="hero-volume">
      <span>Vol {Math.round(state.volume * 100)}</span>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={Math.round(state.volume * 100)}
        aria-label="Bloon Hero volume"
        onChange={(e) => setVolume(Number(e.target.value) / 100)}
      />
    </label>
  );
  const prevPhase = useRef(state.phase);

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

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    void search();
  };

  return (
    <div className={`hero-page${state.phase === "results" ? " is-done" : ""}`}>
      <GameHeader title="BLOON HERO" icon="" />

      <main className="hero-main">
        {state.phase === "browse" || state.phase === "loading" ? (
          <div className="hero-browse">
            <h2>Search Encore charts</h2>
            <p className="hero-browse__sub">
              Pulls Clone Hero charts from{" "}
              <a href="https://www.enchor.us/" target="_blank" rel="noreferrer">
                enchor.us
              </a>
              . Packed audio stays in sync. Controls: D F J K L — hold for
              sustains. Multi-instrument charts let you pick guitar, bass, or
              drums.
            </p>
            <form className="hero-search" onSubmit={onSearch}>
              <input
                value={state.query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Song or artist…"
                autoFocus
              />
              <button
                type="submit"
                className="btn btn--primary"
                disabled={state.searching || !state.query.trim()}
              >
                {state.searching ? "Searching…" : "Search"}
              </button>
            </form>
            {volumeSlider}
            {state.error ? <p className="hero-browse__err">{state.error}</p> : null}
            {state.phase === "loading" ? (
              <p className="hero-browse__loading">
                Downloading &amp; parsing chart…
              </p>
            ) : null}
            <ul className="hero-results">
              {state.results.map((hit) => {
                const instruments = playableInstrumentsOnHit(hit);
                const primary =
                  instruments.includes("guitar")
                    ? "guitar"
                    : (instruments[0] ?? "guitar");
                const notes = expertNotesFor(hit, primary);
                const cover = enchorArtUrl(hit.albumArtMd5);
                return (
                  <li key={`${hit.md5}-${hit.chartId}`}>
                    <button
                      type="button"
                      className="hero-results__item"
                      onClick={() => void pickSong(hit)}
                      disabled={state.phase === "loading"}
                    >
                      <span
                        className="hero-results__art"
                        style={
                          cover
                            ? ({
                                backgroundImage: `url(${cover})`,
                              } as CSSProperties)
                            : undefined
                        }
                        aria-hidden
                      />
                      <span className="hero-results__meta">
                        <strong>
                          {hit.artist}, {hit.name}
                        </strong>
                        <span>
                          {hit.charter ? `charter ${hit.charter}` : "charter ?"}
                          {notes != null ? ` · ${notes} notes` : ""}
                          {hit.song_length
                            ? ` · ${Math.round(hit.song_length / 1000)}s`
                            : ""}
                        </span>
                        {instruments.length > 1 ? (
                          <span className="hero-results__inst">
                            {instruments
                              .map((i) => INSTRUMENT_LABEL[i])
                              .join(" · ")}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <button type="button" className="btn btn--ghost" onClick={onBack}>
              Games
            </button>
          </div>
        ) : (
          <>
            <div className="hero-hud">
              <span className="hero-stat">
                <strong>{state.combo}</strong>
                <span>combo</span>
              </span>
              <LivesMeter maxAttempts={maxLives} attemptsUsed={attemptsUsed} />
              <span className="hero-stat hero-stat--cash">
                <CashAmount amount={state.cashEarned} size={18} />
              </span>
              {volumeSlider}
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
                  ? "Get ready…"
                  : playing
                    ? state.emptyStreak >= 2
                      ? `Wrong taps ×${state.emptyStreak}`
                      : `${state.artist}, ${state.title}`
                    : `${state.artist}, ${state.title}`}
              </p>
            )}

            <div
              className="hero-stage"
              style={
                artUrl
                  ? ({
                      ["--hero-art" as string]: `url(${artUrl})`,
                    } as CSSProperties)
                  : undefined
              }
            >
              <div className="hero-stage__art" aria-hidden />
              <div className="hero-progress" aria-hidden>
                <span ref={setProgressFillEl} />
              </div>

              <div
                className="hero-board hero-board--5"
                role="application"
                aria-label="Chart lanes"
                ref={setBoardEl}
                style={
                  {
                    ["--approach" as string]: String(approach),
                  } as CSSProperties
                }
              >
                {LANES.map((lane) => {
                  const pressed =
                    state.pressed.includes(lane.id) ||
                    state.holdingLanes.includes(lane.id);
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
                        } as CSSProperties
                      }
                      aria-label={`Lane ${lane.label}`}
                      onPointerDown={(e) => {
                        e.preventDefault();
                        if (!playing) return;
                        (e.currentTarget as HTMLElement).setPointerCapture?.(
                          e.pointerId,
                        );
                        applyHit(lane.id);
                      }}
                      onPointerUp={(e) => {
                        if (!playing) return;
                        releaseLane(lane.id);
                        try {
                          (e.currentTarget as HTMLElement).releasePointerCapture?.(
                            e.pointerId,
                          );
                        } catch {
                          /* ignore */
                        }
                      }}
                      onPointerCancel={() => {
                        if (!playing) return;
                        releaseLane(lane.id);
                      }}
                    >
                      <div className="hero-lane__highway" aria-hidden />
                      <div className="hero-lane__notes">
                        {visibleNotes
                          .filter((n) => n.lane === lane.id)
                          .map((n) => (
                            <div
                              key={n.id}
                              ref={(el) => setNoteEl(n.id, el)}
                              className={[
                                "hero-note",
                                n.result === "miss" ? "is-miss" : "",
                                n.sustain ? "is-sustain" : "",
                                n.holding ? "is-holding" : "",
                              ]
                                .filter(Boolean)
                                .join(" ")}
                            >
                              {n.sustain ? (
                                <span
                                  className="hero-note__trail"
                                  style={{
                                    top: `${noteY(state.songTime, n.t, approach)}%`,
                                    height: `${Math.max(
                                      0,
                                      noteY(state.songTime, n.t + n.dur, approach) -
                                        noteY(state.songTime, n.t, approach),
                                    )}%`,
                                  }}
                                />
                              ) : null}
                              <span
                                className="hero-note__key"
                                style={{
                                  top: `${noteY(state.songTime, n.t, approach)}%`,
                                }}
                              />
                            </div>
                          ))}
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
                  <h2>{state.title}</h2>
                  <p>{state.artist}</p>
                  {state.availableInstruments.length > 1 ? (
                    <div
                      className="hero-instrument-pick"
                      role="group"
                      aria-label="Instrument"
                    >
                      {state.availableInstruments.map((inst) => (
                        <button
                          key={inst}
                          type="button"
                          className={`hero-instrument-pick__btn${
                            state.instrument === inst ? " is-active" : ""
                          }`}
                          onClick={() => setInstrument(inst)}
                        >
                          {INSTRUMENT_LABEL[inst]}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <p className="hero-overlay__detail">
                    {INSTRUMENT_LABEL[state.instrument]} ·{" "}
                    {noteCount.toLocaleString()} notes · D F J K L
                  </p>
                  <div className="hero-overlay__actions">
                    <button
                      type="button"
                      className="btn btn--primary"
                      onClick={start}
                    >
                      Play
                    </button>
                    <button
                      type="button"
                      className="btn btn--ghost"
                      onClick={backToBrowse}
                    >
                      Other song
                    </button>
                  </div>
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
                    <button
                      type="button"
                      className="btn btn--ghost"
                      onClick={backToBrowse}
                    >
                      Search
                    </button>
                    <button
                      type="button"
                      className="btn btn--ghost"
                      onClick={onBack}
                    >
                      Games
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
