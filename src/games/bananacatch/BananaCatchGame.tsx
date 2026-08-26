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
  CATCH_LOGIC_H,
  CATCH_LOGIC_W,
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
import { playBloonPop } from "../../lib/packSounds";

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

type Spark = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  r: number;
  color: string;
};

export function BananaCatchGame({ onBack, onRunEnd }: Props) {
  const {
    state,
    clearAt,
    start,
    aimAt,
    aimByDelta,
    setFieldSize,
    setDisplayWidth,
    setPaintLoop,
    setPlayerMover,
    setBananaPickupFx,
    getLiveDrops,
  } = useBananaCatch();
  const fieldRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playerRef = useRef<HTMLImageElement>(null);
  const dropImagesRef = useRef<Map<DropKind, HTMLImageElement> | null>(null);
  const sparksRef = useRef<Spark[]>([]);
  const displaySizeRef = useRef({ w: CATCH_LOGIC_W, h: CATCH_LOGIC_H });
  const prevPhase = useRef(state.phase);
  const [pointerLocked, setPointerLocked] = useState(false);
  const [lockUnavailable, setLockUnavailable] = useState(!USE_POINTER_LOCK);
  const [musicVolume, setMusicVolume] = useState(() => readCatchBgmVolume());
  const [bananaPulse, setBananaPulse] = useState(0);

  const resumeBgm = useCatchBgm(state.phase, musicVolume);

  useEffect(() => {
    dropImagesRef.current = preloadDropImages();
  }, []);

  useEffect(() => {
    setFieldSize(CATCH_LOGIC_W, CATCH_LOGIC_H);
  }, [setFieldSize]);

  useEffect(() => {
    setPlayerMover((x) => {
      const el = playerRef.current;
      if (el) el.style.left = `${x * 100}%`;
    });
    return () => setPlayerMover(null);
  }, [setPlayerMover]);

  useEffect(() => {
    setBananaPickupFx((x, y) => {
      playBloonPop(0.45);
      setBananaPulse((n) => n + 1);
      for (let i = 0; i < 18; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 120 + Math.random() * 220;
        sparksRef.current.push({
          x,
          y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp - 80,
          life: 1,
          max: 0.35 + Math.random() * 0.35,
          r: 3 + Math.random() * 5,
          color: Math.random() > 0.45 ? "#ffe566" : "#ffb020",
        });
      }
    });
    return () => setBananaPickupFx(null);
  }, [setBananaPickupFx]);

  useEffect(() => {
    const paint = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const { w: dw, h: dh } = displaySizeRef.current;
      if (dw < 2 || dh < 2) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const pw = Math.max(1, Math.round(dw * dpr));
      const ph = Math.max(1, Math.round(dh * dpr));
      if (canvas.width !== pw || canvas.height !== ph) {
        canvas.width = pw;
        canvas.height = ph;
      }
      ctx.setTransform(
        (pw / CATCH_LOGIC_W),
        0,
        0,
        (ph / CATCH_LOGIC_H),
        0,
        0,
      );
      ctx.clearRect(0, 0, CATCH_LOGIC_W, CATCH_LOGIC_H);
      const images = dropImagesRef.current;
      if (images) {
        for (const d of getLiveDrops()) {
          const img = images.get(d.kind);
          if (!img?.complete || !img.naturalWidth) continue;
          ctx.save();
          ctx.translate(d.x, d.y);
          ctx.rotate((d.rot * Math.PI) / 180);
          ctx.drawImage(img, -d.w / 2, -d.h / 2, d.w, d.h);
          ctx.restore();
        }
      }
      const dt = 1 / 60;
      const next: Spark[] = [];
      for (const p of sparksRef.current) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 420 * dt;
        p.life -= dt / p.max;
        if (p.life <= 0) continue;
        next.push(p);
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
        ctx.fill();
      }
      sparksRef.current = next;
      ctx.globalAlpha = 1;
    };
    setPaintLoop(paint);
    return () => setPaintLoop(null);
  }, [getLiveDrops, setPaintLoop]);

  const onMusicVolume = useCallback((next: number) => {
    const v = Math.max(0, Math.min(1, next));
    setMusicVolume(v);
    writeCatchBgmVolume(v);
    resumeBgm();
  }, [resumeBgm]);

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
    const sync = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      displaySizeRef.current = { w, h };
      setDisplayWidth(w);
    };
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    sync();
    return () => ro.disconnect();
  }, [setDisplayWidth]);

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
    resumeBgm();
    sparksRef.current = [];
    start();
    if (USE_POINTER_LOCK && !lockUnavailable) {
      queueMicrotask(() => requestLock());
    }
  }

  const playerWPct = (PLAYER_WIDTH / CATCH_LOGIC_W) * 100;
  const playerHPct = (PLAYER_HEIGHT / CATCH_LOGIC_H) * 100;

  return (
    <div className={`catch-page${done ? " is-done" : ""}`}>
      <GameHeader title="BANANA CATCH" icon="" />

      <main className="catch-main">
        <div className="catch-board-slot">
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

            <div className="catch-hud">
              <span
                className={`catch-stat${bananaPulse ? " is-pulse" : ""}`}
                title="Bananas collected"
                key={bananaPulse}
              >
                <img src={BANANA_IMAGE} alt="" width={28} height={28} />
                <strong>{state.bananas}</strong>
              </span>
              <LivesMeter maxAttempts={CATCH_LIVES} attemptsUsed={attemptsUsed} />
              <span className="catch-stat catch-stat--cash">
                <CashAmount amount={state.cashEarned} size={18} />
              </span>
            </div>

          {state.phase === "ready" ? (
            <label className="catch-volume">
              <span>Music {Math.round(musicVolume * 100)}</span>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={Math.round(musicVolume * 100)}
                aria-label="Banana Catch music volume"
                onPointerDown={() => resumeBgm()}
                onInput={(e) => onMusicVolume(Number(e.currentTarget.value) / 100)}
                onChange={(e) => onMusicVolume(Number(e.currentTarget.value) / 100)}
              />
            </label>
          ) : null}

          <img
            ref={playerRef}
            className="catch-player"
            src={MONKEY_IMAGE}
            alt=""
            draggable={false}
            style={{
              width: `${playerWPct}%`,
              height: `${playerHPct}%`,
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
        </div>
      </main>
    </div>
  );
}
