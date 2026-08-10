import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { awardCoins } from "../../lib/awardCoins";
import {
  BFB_UNLOCK_S,
  BLUE_UNLOCK_S,
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
  SPAWN_HAZARD_MS_MIN,
  SPAWN_HAZARD_MS_START,
  drawSizeFor,
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

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function makeDrop(
  kind: DropKind,
  fieldW: number,
  nextId: () => number,
): Drop {
  const { w, h } = drawSizeFor(kind);
  const damage = KIND_DAMAGE[kind];
  const vy = KIND_SPEED[kind];
  let rot = 0;
  let spin = 0;
  if (kind === "banana") {
    rot = rand(-55, 55);
    spin = rand(-40, 40);
  } else if (kind === "moab" || kind === "bfb") {
    rot = rand(-10, 10);
    spin = rand(-8, 8);
  }

  const halfW = w * 0.5;
  return {
    id: nextId(),
    kind,
    x: rand(halfW, Math.max(halfW, fieldW - halfW)),
    y: -h,
    vy,
    w,
    h,
    rot,
    spin,
    damage,
  };
}

function pickHazard(elapsed: number): DropKind {
  const unlocked: DropKind[] = ["red"];
  if (elapsed >= BLUE_UNLOCK_S) unlocked.push("blue");
  if (elapsed >= GREEN_UNLOCK_S) unlocked.push("green");
  if (elapsed >= PINK_UNLOCK_S) unlocked.push("pink");
  if (elapsed >= MOAB_UNLOCK_S) unlocked.push("moab");
  if (elapsed >= BFB_UNLOCK_S) unlocked.push("bfb");

  // Weight toward scarier stuff as more tiers unlock
  const weights = unlocked.map((k) => {
    if (k === "bfb") return 1.4;
    if (k === "moab") return 1.8;
    if (k === "pink") return 1.6;
    if (k === "green") return 1.35;
    if (k === "blue") return 1.2;
    return 1;
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = Math.random() * total;
  for (let i = 0; i < unlocked.length; i++) {
    roll -= weights[i]!;
    if (roll <= 0) return unlocked[i]!;
  }
  return unlocked[unlocked.length - 1]!;
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
  let rx: number;
  let ry: number;
  if (hit.shape === "circle") {
    const r = (Math.min(d.w, d.h) / 2) * hit.rx;
    rx = r;
    ry = r;
  } else {
    rx = (d.w / 2) * hit.rx;
    ry = (d.h / 2) * hit.ry;
  }
  // Closest point on player AABB to drop center
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
  const hazardTimerRef = useRef(0);
  const elapsedRef = useRef(0);
  const awardedRef = useRef(false);
  const frameRef = useRef(0);
  const lastTsRef = useRef(0);
  const pendingCashRef = useRef(0);

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

  const start = useCallback(() => {
    awardedRef.current = false;
    pendingCashRef.current = 0;
    nextIdRef.current = 1;
    bananaTimerRef.current = 350;
    hazardTimerRef.current = 700;
    elapsedRef.current = 0;
    lastTsRef.current = 0;
    targetXRef.current = 0.5;
    playerXRef.current = 0.5;
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
    setState((s) => ({
      ...INITIAL,
      fieldW: s.fieldW,
      fieldH: s.fieldH,
      playerX: 0.5,
    }));
    targetXRef.current = 0.5;
    playerXRef.current = 0.5;
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

      // Spawn pressure only, speeds stay fixed per kind
      const ramp = Math.min(1.6, t / 30);
      const bananaInterval =
        SPAWN_BANANA_MS_START -
        (SPAWN_BANANA_MS_START - SPAWN_BANANA_MS_MIN) * Math.min(1, ramp);
      const hazardInterval =
        SPAWN_HAZARD_MS_START -
        (SPAWN_HAZARD_MS_START - SPAWN_HAZARD_MS_MIN) * Math.min(1, ramp);

      bananaTimerRef.current -= dt * 1000;
      hazardTimerRef.current -= dt * 1000;

      const spawn: Drop[] = [];
      if (bananaTimerRef.current <= 0 && fieldW > 0) {
        spawn.push(makeDrop("banana", fieldW, nextId));
        bananaTimerRef.current = bananaInterval * rand(0.75, 1.15);
      }
      if (hazardTimerRef.current <= 0 && fieldW > 0) {
        spawn.push(makeDrop(pickHazard(t), fieldW, nextId));
        const burstChance = 0.12 + Math.min(0.45, ramp * 0.28);
        if (Math.random() < burstChance) {
          spawn.push(makeDrop(pickHazard(t), fieldW, nextId));
        }
        if (ramp > 0.85 && Math.random() < 0.22) {
          spawn.push(makeDrop("red", fieldW, nextId));
        }
        hazardTimerRef.current = hazardInterval * rand(0.7, 1.05);
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
        if (y - d.h / 2 > fieldH + 40) continue;

        if (hitsPlayer(playerLeft, playerTop, hitW, hitH, { ...d, y })) {
          if (d.kind === "banana") {
            bananas += 1;
            cashEarned += CASH_PER_BANANA;
            pendingCashRef.current += CASH_PER_BANANA;
          } else {
            lives -= d.damage;
          }
          continue;
        }
        nextDrops.push({ ...d, y, rot });
      }

      const dead = lives <= 0;
      const phase: CatchPhase = dead ? "lost" : "playing";
      const cleared = dead && bananas >= CATCH_CLEAR_BANANAS;

      setState({
        phase,
        bananas,
        lives: Math.max(0, lives),
        cashEarned,
        drops: nextDrops,
        playerX: playerXRef.current,
        fieldW,
        fieldH,
        cleared,
      });

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
    setFieldSize,
  };
}
