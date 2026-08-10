import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import { CashAmount } from "../../components/CurrencyChip";
import { GameHeader } from "../../components/GameHeader";
import { LivesMeter } from "../../components/LivesMeter";
import { EMPTY_STREAK_PER_LIFE, LANES } from "./config";
import {
  enchorArtUrl,
  diffScoreFor,
  expertMaxNpsFor,
  expertNotesFor,
  playableInstrumentsOnHit,
} from "./enchorApi";
import { INSTRUMENT_LABEL } from "./instruments";
import { recentPlayToHit } from "./recentPlays";
import { DEFAULT_KEYS, type HeroKeybinds } from "./settings";
import { useBloonHero } from "./useBloonHero";

type Props = {
  onBack: () => void;
  onRunEnd?: (info: {
    cleared: boolean;
    didWell: boolean;
    coinsEarned: number;
  }) => void;
};

function formatKey(k: string): string {
  if (k === " ") return "Space";
  if (k.length === 1) return k.toUpperCase();
  return k;
}

function formatDiffPips(score: number): string {
  return "●".repeat(score) + "○".repeat(Math.max(0, 6 - score));
}

function DiffLine({
  label,
  score,
  nps,
  notes,
}: {
  label: string;
  score: number | null;
  nps: number | null;
  notes: number | null;
}) {
  const bits: string[] = [];
  if (score != null) bits.push(`${score}/6 ${formatDiffPips(score)}`);
  if (nps != null) bits.push(`${nps} nps`);
  if (notes != null) bits.push(`${notes.toLocaleString()} notes`);
  if (!bits.length) return null;
  return (
    <span className="hero-results__diff">
      <em>{label}</em> {bits.join(" · ")}
    </span>
  );
}

function relativePlayAge(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const sec = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (sec < 60) return "just now";
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

export function BloonHeroGame({ onBack, onRunEnd }: Props) {
  const {
    state,
    settings,
    noteCount,
    search,
    setQuery,
    setVolume,
    updateSettings,
    pickSong,
    setInstrument,
    start,
    restart,
    backToBrowse,
    applyHit,
    releaseLane,
    maxLives,
    setCanvasEl,
    setProgressFillEl,
    setCountdownEl,
    togglePause,
  } = useBloonHero();

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [capturingLane, setCapturingLane] = useState<number | null>(null);
  const prevPhase = useRef(state.phase);

  useEffect(() => {
    const was = prevPhase.current;
    prevPhase.current = state.phase;
    if (was === "results") return;
    if (state.phase === "results") {
      onRunEnd?.({
        cleared: state.cleared,
        didWell: state.didWell,
        coinsEarned: state.cashEarned,
      });
    }
  }, [state.phase, state.cleared, state.didWell, state.cashEarned, onRunEnd]);

  useEffect(() => {
    if (capturingLane == null) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        setCapturingLane(null);
        return;
      }
      const next = e.key.toLowerCase();
      if (!next || next === "tab" || next === "shift" || next === "control" || next === "alt" || next === "meta") {
        return;
      }
      const keys = [...settings.keys] as HeroKeybinds;
      // Clear duplicates
      for (let i = 0; i < keys.length; i++) {
        if (i !== capturingLane && keys[i] === next) keys[i] = "";
      }
      keys[capturingLane] = next;
      // Fill blanks with defaults that aren't used
      const used = new Set(keys.filter(Boolean));
      for (let i = 0; i < keys.length; i++) {
        if (keys[i]) continue;
        const fill = DEFAULT_KEYS.find((d) => !used.has(d)) ?? `f${i + 1}`;
        keys[i] = fill;
        used.add(fill);
      }
      updateSettings({ keys });
      setCapturingLane(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [capturingLane, settings.keys, updateSettings]);

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

  const playing = state.phase === "playing";
  const countingIn =
    playing &&
    !state.paused &&
    (state.countdown != null || state.songTime < 0);
  const attemptsUsed = maxLives - state.lives;
  const keyHint = settings.keys.map((k) => formatKey(k)).join(" ");
  const needsInstrumentPick = state.availableInstruments.length > 1;
  const resuming =
    playing && state.paused && state.countdown != null;

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    void search();
  };

  const settingsPanel = settingsOpen ? (
    <div
      className="hero-settings"
      role="dialog"
      aria-label="Bloon Hero settings"
    >
      <div className="hero-settings__card">
        <header className="hero-settings__head">
          <h3>Settings</h3>
          <button
            type="button"
            className="hero-settings__close"
            aria-label="Close settings"
            onClick={() => {
              setCapturingLane(null);
              setSettingsOpen(false);
            }}
          >
            ×
          </button>
        </header>

        <label className="hero-settings__row">
          <span>
            Track speed <strong>{settings.trackSpeed.toFixed(2)}×</strong>
          </span>
          <input
            type="range"
            min={60}
            max={180}
            step={5}
            value={Math.round(settings.trackSpeed * 100)}
            aria-label="Track speed"
            onChange={(e) =>
              updateSettings({ trackSpeed: Number(e.target.value) / 100 })
            }
          />
          <span className="hero-settings__hint">
            Higher = notes arrive sooner
          </span>
        </label>

        <label className="hero-settings__row">
          <span>
            Bloon size <strong>{Math.round(settings.bloonScale * 100)}%</strong>
          </span>
          <input
            type="range"
            min={60}
            max={180}
            step={5}
            value={Math.round((settings.bloonScale ?? 1) * 100)}
            aria-label="Bloon size"
            onChange={(e) =>
              updateSettings({ bloonScale: Number(e.target.value) / 100 })
            }
          />
          <span className="hero-settings__hint">
            Smaller can make stacked notes easier to read
          </span>
        </label>

        <div className="hero-settings__binds">
          <span>Keybinds</span>
          <div className="hero-settings__keys" role="group" aria-label="Lane keys">
            {LANES.map((lane) => (
              <button
                key={lane.id}
                type="button"
                className={`hero-settings__key${
                  capturingLane === lane.id ? " is-listening" : ""
                }`}
                style={{ "--lane": lane.color } as CSSProperties}
                onClick={() =>
                  setCapturingLane((c) => (c === lane.id ? null : lane.id))
                }
              >
                <i style={{ background: lane.color }} aria-hidden />
                {capturingLane === lane.id
                  ? "…"
                  : formatKey(settings.keys[lane.id] ?? "?")}
              </button>
            ))}
          </div>
          <span className="hero-settings__hint">
            Click a lane, then press a key
          </span>
          <button
            type="button"
            className="btn btn--ghost hero-settings__reset"
            onClick={() =>
              updateSettings({
                trackSpeed: 1,
                bloonScale: 1,
                keys: [...DEFAULT_KEYS] as HeroKeybinds,
              })
            }
          >
            Reset defaults
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <div className={`hero-page${state.phase === "results" ? " is-done" : ""}`}>
      <GameHeader title="BLOON HERO" icon="" />

      <button
        type="button"
        className="hero-gear"
        aria-label="Open settings"
        onClick={() => setSettingsOpen(true)}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
          <path
            fill="currentColor"
            d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.03 7.03 0 0 0-1.63-.94l-.36-2.54A.5.5 0 0 0 13.9 2h-3.8a.5.5 0 0 0-.49.42l-.36 2.54c-.58.23-1.12.54-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.71 8.48a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94L2.83 14.5a.5.5 0 0 0-.12.64l1.92 3.32c.14.24.43.34.69.22l2.39-.96c.5.4 1.05.72 1.63.94l.36 2.54c.05.24.25.42.49.42h3.8c.24 0 .44-.18.49-.42l.36-2.54c.58-.23 1.12-.54 1.63-.94l2.39.96c.26.12.55.02.69-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58ZM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7Z"
          />
        </svg>
      </button>

      {settingsPanel}

      <main className="hero-main">
        {state.phase === "browse" || state.phase === "loading" ? (
          <div className="hero-browse">
            <h2>Search Encore charts</h2>
            <p className="hero-browse__sub">
              Pulls Clone Hero charts from{" "}
              <a href="https://www.enchor.us/" target="_blank" rel="noreferrer">
                enchor.us
              </a>
              . Expert Guitar charts — Vocals when the pack has them. Defaults{" "}
              {keyHint} (hold for sustains).
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

            {state.results.length > 0 ? (
              <h3 className="hero-browse__results-title">Search results</h3>
            ) : null}
            <ul className="hero-results">
              {state.results.map((hit) => {
                const instruments = playableInstrumentsOnHit(hit);
                const notes = expertNotesFor(hit, "guitar");
                const guitarDiff = diffScoreFor(hit, "guitar");
                const guitarNps = expertMaxNpsFor(hit, "guitar");
                const vocalsDiff = instruments.includes("vocals")
                  ? diffScoreFor(hit, "vocals")
                  : null;
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
                          {hit.song_length
                            ? ` · ${Math.round(hit.song_length / 1000)}s`
                            : ""}
                        </span>
                        <DiffLine
                          label="Guitar"
                          score={guitarDiff}
                          nps={guitarNps}
                          notes={notes}
                        />
                        {instruments.includes("vocals") ? (
                          <DiffLine
                            label="Vocals"
                            score={vocalsDiff}
                            nps={null}
                            notes={null}
                          />
                        ) : null}
                        <span className="hero-results__inst">
                          {instruments
                            .map((i) => INSTRUMENT_LABEL[i])
                            .join(" · ")}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            {state.recentPlays.length > 0 || state.recentLoading ? (
              <section className="hero-recent" aria-label="Recently played">
                <h3>Recently played</h3>
                {state.recentLoading && !state.recentPlays.length ? (
                  <p className="hero-browse__loading">Loading recent picks…</p>
                ) : (
                  <ul className="hero-results hero-results--recent">
                    {state.recentPlays.map((row) => {
                      const cover = enchorArtUrl(row.albumArtMd5);
                      return (
                        <li key={`${row.md5}-${row.id}`}>
                          <button
                            type="button"
                            className="hero-results__item"
                            onClick={() => void pickSong(recentPlayToHit(row))}
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
                                {row.artist}, {row.songName}
                              </strong>
                              <span>
                                played by {row.username}
                                {row.songLength
                                  ? ` · ${Math.round(row.songLength / 1000)}s`
                                  : ""}
                              </span>
                              <span className="hero-results__played">
                                {relativePlayAge(row.playedAt)}
                              </span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            ) : null}

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

            {playing && state.lastJudge && !countingIn && !state.paused ? (
              <p
                className={`hero-judge is-${state.lastJudge}`}
                key={`${state.perfect}-${state.great}-${state.good}-${state.miss}-${state.emptyStreak}-${state.burst?.id ?? 0}`}
              >
                {state.lastJudge === "miss" && state.emptyStreak > 0
                  ? state.emptyStreak % EMPTY_STREAK_PER_LIFE >=
                    EMPTY_STREAK_PER_LIFE - 1
                    ? "DON'T SPAM"
                    : "WHIFF"
                  : state.lastJudge.toUpperCase()}
              </p>
            ) : (
              <p className="hero-hint">
                {state.paused
                  ? resuming
                    ? "Get ready…"
                    : "Paused"
                  : countingIn
                    ? "Get ready…"
                    : playing
                      ? state.emptyStreak >= 2
                        ? `Wrong taps ×${state.emptyStreak}`
                        : `${state.artist}, ${state.title}`
                      : `${state.artist}, ${state.title}`}
              </p>
            )}

            <div className="hero-stage">
              {state.hasVocals ? (
                <div
                  className={`hero-singer${state.talking ? " is-talking" : ""}${state.singing ? " is-open" : ""}`}
                  aria-hidden
                >
                  <img
                    src={
                      state.singing
                        ? "/images/bloonhero/dart-monkey-open.webp?v=4"
                        : "/images/bloonhero/dart-monkey-closed.webp?v=4"
                    }
                    alt=""
                    draggable={false}
                  />
                </div>
              ) : null}
              <div className="hero-progress" aria-hidden>
                <span ref={setProgressFillEl} />
              </div>

              <div
                className="hero-board"
                role="application"
                aria-label="Chart lanes"
              >
                <canvas
                  ref={setCanvasEl}
                  className="hero-highway-canvas"
                  aria-hidden
                />
                <div className="hero-lane-hits">
                  {LANES.map((lane) => (
                    <button
                      key={lane.id}
                      type="button"
                      className="hero-lane-hit"
                      aria-label={`Lane ${formatKey(settings.keys[lane.id] ?? "")}`}
                      onPointerDown={(e) => {
                        e.preventDefault();
                        if (!playing || state.paused) return;
                        e.currentTarget.setPointerCapture?.(e.pointerId);
                        applyHit(lane.id);
                      }}
                      onPointerUp={(e) => {
                        if (!playing || state.paused) return;
                        releaseLane(lane.id);
                        try {
                          e.currentTarget.releasePointerCapture?.(e.pointerId);
                        } catch {
                          /* ignore */
                        }
                      }}
                      onPointerCancel={() => {
                        if (!playing || state.paused) return;
                        releaseLane(lane.id);
                      }}
                    />
                  ))}
                </div>
              </div>

              <div
                className="hero-countdown"
                ref={setCountdownEl}
                hidden={
                  !playing ||
                  !state.countdown ||
                  (state.paused && !resuming)
                }
                aria-live="polite"
              >
                <span>{state.countdown ?? ""}</span>
              </div>

              {playing && state.paused && !resuming ? (
                <div className="hero-overlay hero-overlay--pause" role="dialog">
                  <h2>Paused</h2>
                  <p className="hero-overlay__detail">
                    Press Esc to resume — 3 · 2 · 1 · GO
                  </p>
                  <div className="hero-overlay__actions">
                    <button
                      type="button"
                      className="btn btn--primary"
                      onClick={togglePause}
                    >
                      Resume
                    </button>
                    <button
                      type="button"
                      className="btn btn--ghost"
                      onClick={backToBrowse}
                    >
                      Quit song
                    </button>
                  </div>
                </div>
              ) : null}

              {state.phase === "ready" ? (
                <div className="hero-overlay">
                  <h2>{state.title}</h2>
                  <p>{state.artist}</p>
                  {needsInstrumentPick ? (
                    <>
                      <p className="hero-overlay__detail">
                        Choose your instrument
                      </p>
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
                    </>
                  ) : null}
                  <p className="hero-overlay__detail">
                    {state.instrument
                      ? `${INSTRUMENT_LABEL[state.instrument]} · ${noteCount.toLocaleString()} notes · ${keyHint}`
                      : "Pick Guitar or Vocals"}
                  </p>
                  {state.error ? (
                    <p className="hero-browse__err">{state.error}</p>
                  ) : null}
                  <div className="hero-overlay__actions">
                    <button
                      type="button"
                      className="btn btn--primary"
                      onClick={start}
                      disabled={!state.instrument}
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
                  <h2>
                    {state.cleared
                      ? state.didWell
                        ? "Clean clear!"
                        : "Song clear!"
                      : "Tilted out"}
                  </h2>
                  <p className="hero-overlay__score">
                    <CashAmount amount={state.cashEarned} size={22} />
                  </p>
                  <p className="hero-overlay__detail">
                    {state.cleared
                      ? state.didWell
                        ? "Finished the song + strong accuracy — pack & bonus"
                        : "Finished the song — free pack unlocked"
                      : "Too much spamming — finish the track to clear"}
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
