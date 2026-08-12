import { useCallback, useEffect, useRef, useState } from "react";
import { CashAmount } from "../../components/CurrencyChip";
import { GameHeader } from "../../components/GameHeader";
import { LivesMeter } from "../../components/LivesMeter";
import { isDesktopShell } from "../../lib/desktopOnline";
import { readCatchBgmVolume, writeCatchBgmVolume } from "./bgmTracks";
import {
  BANANA_IMAGE,
  BFB_IMAGE,
  BLUE_BLOON_IMAGE,
  CATCH_CLEAR_BANANAS,
  CATCH_LIVES,
  GREEN_BLOON_IMAGE,
  MOAB_IMAGE,
  MONKEY_IMAGE,
  PINK_BLOON_IMAGE,
  PLAYER_HEIGHT,
  PLAYER_WIDTH,
  RED_BLOON_IMAGE,
} from "./config";
import { useBananaCatch, type DropKind } from "./useBananaCatch";
import { useCatchBgm } from "./useCatchBgm";

type Props = {
  onBack: () => void;
  onRunEnd?: (info: {
    cleared: boolean;
    coinsEarned: number;
    /** Bananas caught (high-score metric). */
    score: number;
  }) => void;
};

/** WKWebView / Tauri desktop does not support pointer lock reliably. */
const USE_POINTER_LOCK = !isDesktopShell();

const DROP_SRC: Record<DropKind, string> = {
  banana: BANANA_IMAGE,
  blue: BLUE_BLOON_IMAGE,
  green: GREEN_BLOON_IMAGE,
  pink: PINK_BLOON_IMAGE,
  moab: MOAB_IMAGE,
  bfb: BFB_IMAGE,
  red: RED_BLOON_IMAGE,
};

function preloadDropImages(): Map<DropKind, HTMLImageElement> {
  const map = new Map<DropKind, HTMLImageElement>();
  for (const kind of Object.keys(DROP_SRC) as DropKind[]) {
    const img = new Image();
    img.src = DROP_SRC[kind];
    map.set(kind, img);
  }
  return map;
}

export function BananaCatchGame({ onBack, onRunEnd }: Props) {
  const {
    state,
    clearAt,
    start,
    aimAt,
    aimByDelta,
    setFieldSize,
    setPaintLoop,
    setPlayerMover,
    getLiveDrops,
  } = useBananaCatch();
  const fieldRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playerRef = useRef<HTMLImageElement>(null);
  const dropImagesRef = useRef<Map<DropKind, HTMLImageElement> | null>(null);
  const fieldSizeRef = useRef({ w: state.fieldW, h: state.fieldH });
  fieldSizeRef.current = { w: state.fieldW, h: state.fieldH };
  const prevPhase = useRef(state.phase);
  const [pointerLocked, setPointerLocked] = useState(false);
  const [lockUnavailable, setLockUnavailable] = useState(!USE_POINTER_LOCK);
  const [musicVolume, setMusicVolume] = useState(() => readCatchBgmVolume());

  useCatchBgm(state.phase, musicVolume);

  useEffect(() => {
    dropImagesRef.current = preloadDropImages();
  }, []);

  useEffect(() => {
    setPlayerMover((x) => {
      const el = playerRef.current;
      if (el) el.style.left = `${x * 100}%`;
    });
    return () => setPlayerMover(null);
  }, [setPlayerMover]);

  useEffect(() => {
    const paint = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const { w, h } = fieldSizeRef.current;
      if (w <= 0 || h <= 0) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const pw = Math.round(w * dpr);
      const ph = Math.round(h * dpr);
      if (canvas.width !== pw || canvas.height !== ph) {
        canvas.width = pw;
        canvas.height = ph;
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const images = dropImagesRef.current;
      if (!images) return;
      for (const d of getLiveDrops()) {
        const img = images.get(d.kind);
        if (!img?.complete || !img.naturalWidth) continue;
        ctx.save();
        ctx.translate(d.x, d.y);
        ctx.rotate((d.rot * Math.PI) / 180);
        ctx.drawImage(img, -d.w / 2, -d.h / 2, d.w, d.h);
        ctx.restore();
      }
    };
    setPaintLoop(paint);
    return () => setPaintLoop(null);
  }, [getLiveDrops, setPaintLoop]);

  const onMusicVolume = useCallback((next: number) => {
    const v = Math.max(0, Math.min(1, next));
    setMusicVolume(v);
    writeCatchBgmVolume(v);
  }, []);

  const requestLock = useCallback(() => {
    if (!USE_POINTER_LOCK || lockUnavailable) return;
    const el = fieldRef.current;
    if (!el || typeof el.requestPointerLock !== "function") {
      setLockUnavailable(true);
      return;
    }
    if (document.pointerLockElement === el) return;
    void el.requestPointerLock().catch(() => {
      setLockUnavailable(true);
    });
  }, [lockUnavailable]);

  const releaseLock = useCallback(() => {
    if (document.pointerLockElement && document.exitPointerLock) {
      document.exitPointerLock();
    }
  }, []);

  useEffect(() => {
    const el = fieldRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (!box) return;
      setFieldSize(box.width, box.height);
    });
    ro.observe(el);
    setFieldSize(el.clientWidth, el.clientHeight);
    return () => ro.disconnect();
  }, [setFieldSize]);

  useEffect(() => {
    const was = prevPhase.current;
    prevPhase.current = state.phase;
    if (was === "lost") return;
    if (state.phase === "lost") {
      onRunEnd?.({
        cleared: state.cleared,
        coinsEarned: state.cashEarned,
        score: state.bananas,
      });
    }
  }, [state.phase, state.cleared, state.cashEarned, state.bananas, onRunEnd]);

  // Track lock state; Esc exits pointer lock natively.
  useEffect(() => {
    if (!USE_POINTER_LOCK) return;
    const onChange = () => {
      setPointerLocked(document.pointerLockElement === fieldRef.current);
    };
    const onError = () => {
      setLockUnavailable(true);
      setPointerLocked(false);
    };
    document.addEventListener("pointerlockchange", onChange);
    document.addEventListener("pointerlockerror", onError);
    return () => {
      document.removeEventListener("pointerlockchange", onChange);
      document.removeEventListener("pointerlockerror", onError);
    };
  }, []);

  // Release lock when the run ends / leaves playing.
  useEffect(() => {
    if (state.phase !== "playing") releaseLock();
  }, [state.phase, releaseLock]);

  useEffect(() => () => releaseLock(), [releaseLock]);

  const playing = state.phase === "playing";
  const done = state.phase === "lost";
  const attemptsUsed = CATCH_LIVES - state.lives;
  const useRelativeMouse = USE_POINTER_LOCK && !lockUnavailable && pointerLocked;

  const pointerToAim = useCallback(
    (clientX: number) => {
      const el = fieldRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      aimAt(clientX, rect.left, rect.width);
    },
    [aimAt],
  );

  // Without pointer lock, track the mouse anywhere over the window while playing.
  useEffect(() => {
    if (!playing || useRelativeMouse) return;
    const onMove = (e: MouseEvent) => pointerToAim(e.clientX);
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, [playing, useRelativeMouse, pointerToAim]);

  function beginRun() {
    start();
    if (USE_POINTER_LOCK && !lockUnavailable) {
      // User gesture from Start — lock immediately.
      queueMicrotask(() => requestLock());
    }
  }

  return (
    <div className={`catch-page${done ? " is-done" : ""}`}>
      <GameHeader title="BANANA CATCH" icon="" />

      <main className="catch-main">
        <div className="catch-hud">
          <span className="catch-stat" title="Bananas collected">
            <img src={BANANA_IMAGE} alt="" width={28} height={28} />
            <strong>{state.bananas}</strong>
          </span>
          <LivesMeter maxAttempts={CATCH_LIVES} attemptsUsed={attemptsUsed} />
          <span className="catch-stat catch-stat--cash">
            <CashAmount amount={state.cashEarned} size={18} />
          </span>
        </div>

        <label className="catch-volume">
          <span>Music {Math.round(musicVolume * 100)}</span>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={Math.round(musicVolume * 100)}
            aria-label="Banana Catch music volume"
            onChange={(e) => onMusicVolume(Number(e.target.value) / 100)}
          />
        </label>

        <p className="catch-hint">
          {playing
            ? useRelativeMouse
              ? "Move to catch · Esc frees the mouse"
              : USE_POINTER_LOCK && !lockUnavailable
                ? "Click the field to lock the mouse again"
                : "Move mouse to catch"
            : "Catch bananas forever · dodge reds, blues, greens, pinks, then blimps"}
        </p>

        <div
          ref={fieldRef}
          className={`catch-field${playing ? " is-playing" : ""}${pointerLocked ? " is-locked" : ""}`}
          role="application"
          aria-label="Banana catch playfield"
          onPointerDown={(e) => {
            if (!playing) return;
            pointerToAim(e.clientX);
            if (useRelativeMouse) {
              e.currentTarget.setPointerCapture(e.pointerId);
              return;
            }
            if (
              USE_POINTER_LOCK &&
              !lockUnavailable &&
              document.pointerLockElement !== e.currentTarget
            ) {
              requestLock();
            }
          }}
          onPointerMove={(e) => {
            if (!playing) return;
            if (useRelativeMouse) {
              aimByDelta(e.movementX);
              return;
            }
            pointerToAim(e.clientX);
          }}
        >
          <div className="catch-field__sky" aria-hidden="true" />

          <canvas
            ref={canvasRef}
            className="catch-canvas"
            aria-hidden="true"
          />

          <img
            ref={playerRef}
            className="catch-player"
            src={MONKEY_IMAGE}
            alt=""
            draggable={false}
            style={{
              width: PLAYER_WIDTH,
              height: PLAYER_HEIGHT,
              left: `${state.playerX * 100}%`,
            }}
          />

          {state.phase === "ready" ? (
            <div className="catch-overlay">
              <img
                className="catch-overlay__monkey"
                src={MONKEY_IMAGE}
                alt=""
                draggable={false}
              />
              <h2>Ready to harvest?</h2>
              <p>
                Endless run, grab bananas, dodge everything. Survive for{" "}
                <strong>{CATCH_CLEAR_BANANAS}+</strong> bananas to clear.
              </p>
              <p className="catch-overlay__note">
                {USE_POINTER_LOCK
                  ? "Mouse locks while you play · Esc to free it"
                  : "Move the mouse to slide the monkey"}
              </p>
              <button type="button" className="btn btn--primary" onClick={beginRun}>
                Start
              </button>
            </div>
          ) : null}

          {state.phase === "lost" ? (
            <div
              className={`catch-overlay${state.cleared ? " is-win" : " is-lose"}`}
              role="status"
            >
              <h2>{state.cleared ? "Solid haul!" : "Popped!"}</h2>
              <p>
                Caught <strong>{state.bananas}</strong> bananas ·{" "}
                <CashAmount amount={state.cashEarned} size={18} />
                {state.cleared ? (
                  <span className="catch-overlay__note">
                    Cleared ({clearAt}+ bananas), packs unlocked.
                  </span>
                ) : (
                  <span className="catch-overlay__note">
                    Reach {clearAt} bananas in one run to clear.
                  </span>
                )}
              </p>
              <div className="catch-overlay__actions">
                <button type="button" className="btn btn--primary" onClick={beginRun}>
                  Try again
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
