import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { awardCoins } from "../../lib/awardCoins";
import {
  BANANA_SIZE,
  BFB_SIZE,
  BFB_UNLOCK_S,
  CATCH_CLEAR_BANANAS,
  CATCH_LIVES,
  CASH_PER_BANANA,
  FALL_SPEED_BANANA,
  FALL_SPEED_BFB,
  FALL_SPEED_MOAB,
  FALL_SPEED_RED,
  MOAB_SIZE,
  MOAB_UNLOCK_S,
  PLAYER_HEIGHT,
  PLAYER_LERP,
  PLAYER_WIDTH,
  RED_SIZE,
  SPAWN_BANANA_MS_MIN,
  SPAWN_BANANA_MS_START,
  SPAWN_HAZARD_MS_MIN,
  SPAWN_HAZARD_MS_START,
} from "./config";

export type DropKind = "banana" | "red" | "moab" | "bfb";

export type Drop = {
  id: number;
  kind: DropKind;
  x: number;
  y: number;
  vy: number;
  size: number;
  /** Degrees — bananas (and lightly, blimps) sit at a random tilt. */
  rot: number;
  /** Slow spin deg/s while falling. */
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
  /** True if this death run earned a clear (packs / hero XP). */
  cleared: boolean;
};

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function pickSize(range: { min: number; max: number }) {
  return rand(range.min, range.max);
}

function makeDrop(
  kind: DropKind,
  fieldW: number,
  nextId: () => number,
): Drop {
  let size: number;
  let speed: number;
  let damage: number;
  let rot: number;
  let spin: number;

  if (kind === "banana") {
    size = pickSize(BANANA_SIZE);
    speed = rand(FALL_SPEED_BANANA.min, FALL_SPEED_BANANA.max);
    damage = 0;
    rot = rand(-55, 55);
    spin = rand(-40, 40);
  } else if (kind === "red") {
    size = pickSize(RED_SIZE);
    speed = rand(FALL_SPEED_RED.min, FALL_SPEED_RED.max);
    damage = 1;
    rot = rand(-12, 12);
    spin = rand(-15, 15);
  } else if (kind === "moab") {
    size = pickSize(MOAB_SIZE);
    speed = rand(FALL_SPEED_MOAB.min, FALL_SPEED_MOAB.max);
    damage = 2;
    rot = rand(-18, 18);
    spin = rand(-20, 20);
  } else {
    size = pickSize(BFB_SIZE);
    speed = rand(FALL_SPEED_BFB.min, FALL_SPEED_BFB.max);
    damage = 3;
    rot = rand(-14, 14);
    spin = rand(-12, 12);
  }

  const half = size * 0.5;
  return {
    id: nextId(),
    kind,
    x: rand(half, Math.max(half, fieldW - half)),
    y: -size,
    vy: speed,
    size,
    rot,
    spin,
    damage,
  };
}

function pickHazard(elapsed: number): DropKind {
  const roll = Math.random();
  const bfbOpen = elapsed >= BFB_UNLOCK_S;
  const moabOpen = elapsed >= MOAB_UNLOCK_S;

  // Weight shifts hard toward big stuff as the run goes on
  if (bfbOpen) {
    const late = Math.min(1, (elapsed - BFB_UNLOCK_S) / 40);
    if (roll < 0.22 + late * 0.16) return "bfb";
    if (roll < 0.58 + late * 0.12) return "moab";
    return "red";
  }
  if (moabOpen) {
    const mid = Math.min(1, (elapsed - MOAB_UNLOCK_S) / 12);
    if (roll < 0.38 + mid * 0.18) return "moab";
    return "red";
  }
  return "red";
}

function overlaps(
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  bx: number,
  by: number,
  bs: number,
): boolean {
  const pad = bs * 0.2;
  const left = bx - bs / 2 + pad;
  const right = bx + bs / 2 - pad;
  const top = by - bs / 2 + pad;
  const bottom = by + bs / 2 - pad;
  return ax < right && ax + aw > left && ay < bottom && ay + ah > top;
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

      // Difficulty ramp — peaks around ~30s, then keeps squeezing
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
        // Extra hazards as pressure climbs (red piles + occasional dual blimp)
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
      const playerLeft = playerCenterX - PLAYER_WIDTH / 2;
      const playerTop = fieldH - PLAYER_HEIGHT - 10;

      let bananas = s.bananas;
      let lives = s.lives;
      let cashEarned = s.cashEarned;

      const nextDrops: Drop[] = [];
      for (const d of [...s.drops, ...spawn]) {
        const y = d.y + d.vy * dt * (1 + Math.min(1, ramp) * 0.4);
        const rot = d.rot + d.spin * dt;
        if (y - d.size / 2 > fieldH + 40) continue;

        if (
          overlaps(
            playerLeft,
            playerTop,
            PLAYER_WIDTH,
            PLAYER_HEIGHT * 0.7,
            d.x,
            y,
            d.size,
          )
        ) {
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

  // Flush leftover cash on death
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
