import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { awardCoins } from "../../lib/awardCoins";
import {
  BFB_UNLOCK_S,
  BLUE_UNLOCK_S,
  BLIMP_BASE_ROT,
  BLIMP_MIN_GAP_S,
  CATCH_CLEAR_BANANAS,
  CATCH_LIVES,
  CASH_PER_BANANA,
  GREEN_UNLOCK_S,
  KIND_DAMAGE,
  KIND_HIT,
  KIND_SPEED,
  MOAB_UNLOCK_S,
  PINK_UNLOCK_S,
  PLAYER_HEIGHT,
  PLAYER_HIT,
  PLAYER_LERP,
  PLAYER_WIDTH,
  SPAWN_BANANA_MS_MIN,
  SPAWN_BANANA_MS_START,
  SPAWN_BLIMP_MS_MIN,
  SPAWN_BLIMP_MS_START,
  SPAWN_BLOON_MS_MIN,
  SPAWN_BLOON_MS_START,
  drawSizeFor,
  isBlimp,
  type DropKind,
} from "./config";

export type { DropKind };

export type Drop = {
  id: number;
  kind: DropKind;
  x: number;
  y: number;
  /** Fixed for the kind for the whole life of the drop. */
  vy: number;
  w: number;
  h: number;
  rot: number;
  spin: number;
  damage: number;
  /** Horizontal rest position; sway offsets from this. */
  anchorX: number;
  swayAmp: number;
  swayFreq: number;
  swayPhase: number;
};

export type CatchPhase = "ready" | "playing" | "lost";

export type CatchState = {
  phase: CatchPhase;
  bananas: number;
  lives: number;
  cashEarned: number;
  drops: Drop[];
  playerX: number;
  fieldW: number;
  fieldH: number;
  cleared: boolean;
};

type OrdinaryKind = "red" | "blue" | "green" | "pink";

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

function spanFor(kind: DropKind, w: number, h: number) {
  return isBlimp(kind) ? h : w;
}

function heightFor(kind: DropKind, w: number, h: number) {
  return isBlimp(kind) ? w : h;
}

function makeDropAt(
  kind: DropKind,
  fieldW: number,
  nextId: () => number,
  opts: {
    x: number;
    y?: number;
    swayAmp?: number;
    swayFreq?: number;
    swayPhase?: number;
  },
): Drop {
  const { w, h } = drawSizeFor(kind);
  const spanW = spanFor(kind, w, h);
  const half = spanW * 0.5;
  const anchorX = clamp(opts.x, half, Math.max(half, fieldW - half));
  let rot = 0;
  let spin = 0;
  if (kind === "banana") {
    rot = rand(-55, 55);
    spin = rand(-40, 40);
  } else if (isBlimp(kind)) {
    rot = BLIMP_BASE_ROT;
  }

  return {
    id: nextId(),
    kind,
    x: anchorX,
    y: opts.y ?? -heightFor(kind, w, h),
    vy: KIND_SPEED[kind],
    w,
    h,
    rot,
    spin,
    damage: KIND_DAMAGE[kind],
    anchorX,
    swayAmp: opts.swayAmp ?? 0,
    swayFreq: opts.swayFreq ?? 0,
    swayPhase: opts.swayPhase ?? 0,
  };
}

function pickOrdinary(elapsed: number): OrdinaryKind {
  const unlocked: OrdinaryKind[] = ["red"];
  if (elapsed >= BLUE_UNLOCK_S) unlocked.push("blue");
  if (elapsed >= GREEN_UNLOCK_S) unlocked.push("green");
  if (elapsed >= PINK_UNLOCK_S) unlocked.push("pink");
  const weights = unlocked.map((k) => {
    if (k === "pink") return 1.1;
    if (k === "green") return 1.2;
    if (k === "blue") return 1.25;
    return 1.4;
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = Math.random() * total;
  for (let i = 0; i < unlocked.length; i++) {
    roll -= weights[i]!;
    if (roll <= 0) return unlocked[i]!;
  }
  return unlocked[0]!;
}

function pickBlimp(elapsed: number): "moab" | "bfb" | null {
  if (elapsed < MOAB_UNLOCK_S) return null;
  if (elapsed >= BFB_UNLOCK_S && Math.random() < 0.32) return "bfb";
  return "moab";
}

/** Horizontal / double / thick / column / sway patterns for ordinary bloons. */
function spawnFormation(
  fieldW: number,
  elapsed: number,
  nextId: () => number,
): Drop[] {
  const kind = pickOrdinary(elapsed);
  const { w, h } = drawSizeFor(kind);
  const gap = w * 1.35;
  const patternRoll = Math.random();

  // ~40% stay as a lone float (sometimes with a little sway)
  if (patternRoll < 0.38) {
    return [
      makeDropAt(kind, fieldW, nextId, {
        x: rand(w, Math.max(w, fieldW - w)),
        swayAmp: Math.random() < 0.45 ? rand(18, 42) : 0,
        swayFreq: rand(1.6, 2.6),
        swayPhase: rand(0, Math.PI * 2),
      }),
    ];
  }

  const swayAmp = rand(28, 56);
  const swayFreq = rand(1.4, 2.4);
  const phase = rand(0, Math.PI * 2);
  const sharedSway = {
    swayAmp,
    swayFreq,
    swayPhase: phase,
  };

  // Single thick horizontal line (4–6)
  if (patternRoll < 0.58) {
    const count = 4 + Math.floor(Math.random() * 3);
    const totalW = (count - 1) * gap;
    const startX = rand(w * 0.5, Math.max(w * 0.5, fieldW - totalW - w * 0.5));
    return Array.from({ length: count }, (_, i) =>
      makeDropAt(kind, fieldW, nextId, {
        x: startX + i * gap,
        ...sharedSway,
      }),
    );
  }

  // Double line (2 rows)
  if (patternRoll < 0.74) {
    const count = 3 + Math.floor(Math.random() * 3);
    const totalW = (count - 1) * gap;
    const startX = rand(w * 0.5, Math.max(w * 0.5, fieldW - totalW - w * 0.5));
    const rowGap = h * 1.15;
    const out: Drop[] = [];
    for (let row = 0; row < 2; row++) {
      for (let i = 0; i < count; i++) {
        out.push(
          makeDropAt(kind, fieldW, nextId, {
            x: startX + i * gap + (row === 1 ? gap * 0.35 : 0),
            y: -h - row * rowGap,
            ...sharedSway,
            swayPhase: phase + row * 0.35,
          }),
        );
      }
    }
    return out;
  }

  // Thick packed bar (2 deep, tight)
  if (patternRoll < 0.88) {
    const count = 5 + Math.floor(Math.random() * 2);
    const tight = gap * 0.78;
    const totalW = (count - 1) * tight;
    const startX = rand(w * 0.5, Math.max(w * 0.5, fieldW - totalW - w * 0.5));
    const out: Drop[] = [];
    for (let row = 0; row < 2; row++) {
      for (let i = 0; i < count; i++) {
        out.push(
          makeDropAt(kind, fieldW, nextId, {
            x: startX + i * tight,
            y: -h - row * (h * 0.85),
            ...sharedSway,
          }),
        );
      }
    }
    return out;
  }

  // Vertical column with staggered snake sway
  const count = 4 + Math.floor(Math.random() * 3);
  const x = rand(w, Math.max(w, fieldW - w));
  return Array.from({ length: count }, (_, i) =>
    makeDropAt(kind, fieldW, nextId, {
      x,
      y: -h - i * (h * 1.1),
      swayAmp: swayAmp * 0.85,
      swayFreq,
      swayPhase: phase + i * 0.55,
    }),
  );
}

/** Axis-aligned player catch body vs elliptical/circular drop body. */
function hitsPlayer(
  playerLeft: number,
  playerTop: number,
  playerW: number,
  playerH: number,
  d: Drop,
): boolean {
  const hit = KIND_HIT[d.kind];
  const boxW = isBlimp(d.kind) ? d.h : d.w;
  const boxH = isBlimp(d.kind) ? d.w : d.h;
  let rx: number;
  let ry: number;
  if (hit.shape === "circle") {
    const r = (Math.min(boxW, boxH) / 2) * hit.rx;
    rx = r;
    ry = r;
  } else {
    rx = (boxW / 2) * hit.rx;
    ry = (boxH / 2) * hit.ry;
  }
  const cx = d.x;
  const cy = d.y;
  const nearestX = Math.max(playerLeft, Math.min(cx, playerLeft + playerW));
  const nearestY = Math.max(playerTop, Math.min(cy, playerTop + playerH));
  const dx = (cx - nearestX) / Math.max(rx, 0.001);
  const dy = (cy - nearestY) / Math.max(ry, 0.001);
  return dx * dx + dy * dy <= 1;
}

const INITIAL: CatchState = {
  phase: "ready",
  bananas: 0,
  lives: CATCH_LIVES,
  cashEarned: 0,
  drops: [],
  playerX: 0.5,
  fieldW: 360,
  fieldH: 480,
  cleared: false,
};

export function useBananaCatch() {
  const { setCoinBalance } = useAuth();
  const setCoinBalanceRef = useRef(setCoinBalance);
  setCoinBalanceRef.current = setCoinBalance;

  const [state, setState] = useState<CatchState>(INITIAL);
  const stateRef = useRef(state);
  stateRef.current = state;

  const targetXRef = useRef(0.5);
  const playerXRef = useRef(0.5);
  const nextIdRef = useRef(1);
  const bananaTimerRef = useRef(0);
  const bloonTimerRef = useRef(0);
  const blimpTimerRef = useRef(0);
  const lastBlimpAtRef = useRef(-999);
  const elapsedRef = useRef(0);
  const awardedRef = useRef(false);
  const frameRef = useRef(0);
  const lastTsRef = useRef(0);
  const pendingCashRef = useRef(0);
  const dropsRef = useRef<Drop[]>([]);
  const paintRef = useRef<(() => void) | null>(null);
  const movePlayerRef = useRef<((x: number) => void) | null>(null);

  const nextId = useCallback(() => {
    const id = nextIdRef.current;
    nextIdRef.current += 1;
    return id;
  }, []);

  const flushCash = useCallback(async () => {
    const amount = pendingCashRef.current;
    if (amount <= 0) return;
    pendingCashRef.current = 0;
    const balance = await awardCoins(amount);
    if (balance != null) setCoinBalanceRef.current(balance);
  }, []);

  const setFieldSize = useCallback((w: number, h: number) => {
    setState((s) =>
      s.fieldW === w && s.fieldH === h ? s : { ...s, fieldW: w, fieldH: h },
    );
  }, []);

  const aimAt = useCallback((clientX: number, fieldLeft: number, fieldW: number) => {
    if (fieldW <= 0) return;
    const local = (clientX - fieldLeft) / fieldW;
    targetXRef.current = Math.min(1, Math.max(0, local));
  }, []);

  /** Relative aim for pointer-lock (movementX deltas). */
  const aimByDelta = useCallback((dxPx: number) => {
    const fieldW = stateRef.current.fieldW;
    if (fieldW <= 0 || !dxPx) return;
    targetXRef.current = Math.min(
      1,
      Math.max(0, targetXRef.current + dxPx / fieldW),
    );
  }, []);

  const start = useCallback(() => {
    awardedRef.current = false;
    pendingCashRef.current = 0;
    nextIdRef.current = 1;
    bananaTimerRef.current = 350;
    bloonTimerRef.current = 900;
    blimpTimerRef.current = MOAB_UNLOCK_S * 1000;
    lastBlimpAtRef.current = -999;
    elapsedRef.current = 0;
    lastTsRef.current = 0;
    targetXRef.current = 0.5;
    playerXRef.current = 0.5;
    dropsRef.current = [];
    setState((s) => ({
      ...INITIAL,
      phase: "playing",
      fieldW: s.fieldW,
      fieldH: s.fieldH,
      playerX: 0.5,
    }));
  }, []);

  const restart = useCallback(() => {
    awardedRef.current = false;
    pendingCashRef.current = 0;
    cancelAnimationFrame(frameRef.current);
    lastTsRef.current = 0;
    dropsRef.current = [];
    setState((s) => ({
      ...INITIAL,
      fieldW: s.fieldW,
      fieldH: s.fieldH,
      playerX: 0.5,
    }));
    targetXRef.current = 0.5;
    playerXRef.current = 0.5;
  }, []);

  const setPaintLoop = useCallback((paint: (() => void) | null) => {
    paintRef.current = paint;
  }, []);

  const setPlayerMover = useCallback((move: ((x: number) => void) | null) => {
    movePlayerRef.current = move;
  }, []);

  useEffect(() => {
    if (state.phase !== "playing") {
      cancelAnimationFrame(frameRef.current);
      lastTsRef.current = 0;
      return;
    }

    const tick = (ts: number) => {
      const prev = lastTsRef.current || ts;
      lastTsRef.current = ts;
      const dt = Math.min(0.05, (ts - prev) / 1000);
      elapsedRef.current += dt;

      const s = stateRef.current;
      const { fieldW, fieldH } = s;
      const t = elapsedRef.current;

      const ramp = Math.min(1.4, t / 40);
      const bananaInterval =
        SPAWN_BANANA_MS_START -
        (SPAWN_BANANA_MS_START - SPAWN_BANANA_MS_MIN) * Math.min(1, ramp);
      const bloonInterval =
        SPAWN_BLOON_MS_START -
        (SPAWN_BLOON_MS_START - SPAWN_BLOON_MS_MIN) * Math.min(1, ramp);
      const blimpInterval =
        SPAWN_BLIMP_MS_START -
        (SPAWN_BLIMP_MS_START - SPAWN_BLIMP_MS_MIN) * Math.min(1, ramp * 0.55);

      bananaTimerRef.current -= dt * 1000;
      bloonTimerRef.current -= dt * 1000;
      blimpTimerRef.current -= dt * 1000;

      const spawn: Drop[] = [];

      if (bananaTimerRef.current <= 0 && fieldW > 0) {
        spawn.push(
          makeDropAt("banana", fieldW, nextId, {
            x: rand(40, Math.max(40, fieldW - 40)),
            swayAmp: rand(10, 28),
            swayFreq: rand(1.2, 2),
            swayPhase: rand(0, Math.PI * 2),
          }),
        );
        bananaTimerRef.current = bananaInterval * rand(0.75, 1.15);
      }

      if (bloonTimerRef.current <= 0 && fieldW > 0) {
        spawn.push(...spawnFormation(fieldW, t, nextId));
        // Extra pause after a big formation so the screen can breathe
        const justBig = spawn.length >= 6;
        bloonTimerRef.current =
          bloonInterval * (justBig ? rand(1.35, 1.8) : rand(0.85, 1.2));
      }

      if (blimpTimerRef.current <= 0 && fieldW > 0) {
        const kind = pickBlimp(t);
        const gapOk = t - lastBlimpAtRef.current >= BLIMP_MIN_GAP_S;
        const blimpAlive = [...s.drops, ...spawn].some((d) => isBlimp(d.kind));
        if (kind && gapOk && !blimpAlive) {
          spawn.push(
            makeDropAt(kind, fieldW, nextId, {
              x: rand(fieldW * 0.2, fieldW * 0.8),
            }),
          );
          lastBlimpAtRef.current = t;
          blimpTimerRef.current = blimpInterval * rand(0.95, 1.25);
        } else {
          // Retry soon if locked out, or full wait if not unlocked yet
          blimpTimerRef.current = kind ? 900 : 2000;
        }
      }

      const lerp = 1 - Math.exp(-PLAYER_LERP * dt);
      playerXRef.current +=
        (targetXRef.current - playerXRef.current) * lerp;

      const playerCenterX = playerXRef.current * fieldW;
      const hitW = PLAYER_WIDTH * PLAYER_HIT.wFrac;
      const hitH = PLAYER_HEIGHT * PLAYER_HIT.hFrac;
      const playerLeft = playerCenterX - hitW / 2;
      const playerTop =
        fieldH - PLAYER_HEIGHT - 10 + PLAYER_HIT.yLift + (PLAYER_HEIGHT - hitH) * 0.35;

      let bananas = s.bananas;
      let lives = s.lives;
      let cashEarned = s.cashEarned;

      const nextDrops: Drop[] = [];
      for (const d of [...s.drops, ...spawn]) {
        const y = d.y + d.vy * dt;
        const rot = d.rot + d.spin * dt;
        const visualH = heightFor(d.kind, d.w, d.h);
        const spanW = spanFor(d.kind, d.w, d.h);
        const half = spanW * 0.5;
        const x =
          d.swayAmp > 0
            ? clamp(
                d.anchorX +
                  Math.sin(elapsedRef.current * d.swayFreq + d.swayPhase) *
                    d.swayAmp,
                half,
                Math.max(half, fieldW - half),
              )
            : d.anchorX;

        if (y - visualH / 2 > fieldH + 40) continue;

        const moved = { ...d, x, y, rot };
        if (hitsPlayer(playerLeft, playerTop, hitW, hitH, moved)) {
          if (d.kind === "banana") {
            bananas += 1;
            cashEarned += CASH_PER_BANANA;
            pendingCashRef.current += CASH_PER_BANANA;
          } else {
            lives -= d.damage;
          }
          continue;
        }
        nextDrops.push(moved);
      }

      const dead = lives <= 0;
      const phase: CatchPhase = dead ? "lost" : "playing";
      const cleared = dead && bananas >= CATCH_CLEAR_BANANAS;

      dropsRef.current = nextDrops;
      movePlayerRef.current?.(playerXRef.current);
      paintRef.current?.();

      const hudChanged =
        phase !== s.phase ||
        bananas !== s.bananas ||
        lives !== s.lives ||
        cashEarned !== s.cashEarned ||
        cleared !== s.cleared;

      if (hudChanged) {
        setState({
          phase,
          bananas,
          lives: Math.max(0, lives),
          cashEarned,
          drops: dead ? nextDrops : [],
          playerX: playerXRef.current,
          fieldW,
          fieldH,
          cleared,
        });
      }

      if (pendingCashRef.current >= CASH_PER_BANANA * 5) {
        void flushCash();
      }

      if (phase === "playing") {
        frameRef.current = requestAnimationFrame(tick);
      }
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [state.phase, flushCash, nextId]);

  useEffect(() => {
    if (state.phase !== "lost") return;
    if (awardedRef.current) return;
    awardedRef.current = true;
    void flushCash();
  }, [state.phase, flushCash]);

  return {
    state,
    clearAt: CATCH_CLEAR_BANANAS,
    start,
    restart,
    aimAt,
    aimByDelta,
    setFieldSize,
    setPaintLoop,
    setPlayerMover,
    getLiveDrops: () => dropsRef.current,
  };
}
