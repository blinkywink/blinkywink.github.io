import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { awardCoins } from "../../lib/awardCoins";
import {
  BANANA_SIZE,
  BLOON_SIZE,
  CATCH_GOAL,
  CATCH_LIVES,
  CATCH_WIN_REWARD,
  CASH_PER_BANANA,
  FALL_SPEED_BANANA,
  FALL_SPEED_BLOON,
  PLAYER_HEIGHT,
  PLAYER_LERP,
  PLAYER_WIDTH,
  SPAWN_BANANA_MS_MIN,
  SPAWN_BANANA_MS_START,
  SPAWN_BLOON_MS_MIN,
  SPAWN_BLOON_MS_START,
} from "./config";

export type DropKind = "banana" | "bloon";

export type Drop = {
  id: number;
  kind: DropKind;
  x: number;
  y: number;
  vy: number;
  size: number;
};

export type CatchPhase = "ready" | "playing" | "won" | "lost";

export type CatchState = {
  phase: CatchPhase;
  bananas: number;
  lives: number;
  cashEarned: number;
  drops: Drop[];
  playerX: number;
  fieldW: number;
  fieldH: number;
};

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function makeDrop(
  kind: DropKind,
  fieldW: number,
  nextId: () => number,
): Drop {
  const size = kind === "banana" ? BANANA_SIZE : BLOON_SIZE;
  const speed =
    kind === "banana"
      ? rand(FALL_SPEED_BANANA.min, FALL_SPEED_BANANA.max)
      : rand(FALL_SPEED_BLOON.min, FALL_SPEED_BLOON.max);
  return {
    id: nextId(),
    kind,
    x: rand(size * 0.5, Math.max(size * 0.5, fieldW - size * 0.5)),
    y: -size,
    vy: speed,
    size,
  };
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
  const pad = bs * 0.18;
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
    bananaTimerRef.current = 400;
    bloonTimerRef.current = 1100;
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

  // Game loop
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

      // Difficulty ramp over ~45s
      const ramp = Math.min(1, t / 45);
      const bananaInterval =
        SPAWN_BANANA_MS_START -
        (SPAWN_BANANA_MS_START - SPAWN_BANANA_MS_MIN) * ramp;
      const bloonInterval =
        SPAWN_BLOON_MS_START -
        (SPAWN_BLOON_MS_START - SPAWN_BLOON_MS_MIN) * ramp;

      bananaTimerRef.current -= dt * 1000;
      bloonTimerRef.current -= dt * 1000;

      const spawn: Drop[] = [];
      if (bananaTimerRef.current <= 0 && fieldW > 0) {
        spawn.push(makeDrop("banana", fieldW, nextId));
        bananaTimerRef.current = bananaInterval * rand(0.75, 1.15);
      }
      if (bloonTimerRef.current <= 0 && fieldW > 0) {
        spawn.push(makeDrop("bloon", fieldW, nextId));
        bloonTimerRef.current = bloonInterval * rand(0.8, 1.25);
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
      let hitShake = false;

      const nextDrops: Drop[] = [];
      for (const d of [...s.drops, ...spawn]) {
        const y = d.y + d.vy * dt * (1 + ramp * 0.35);
        if (y - d.size / 2 > fieldH + 20) continue;

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
            lives -= 1;
            hitShake = true;
          }
          continue;
        }
        nextDrops.push({ ...d, y });
      }

      let phase: CatchPhase = "playing";
      if (bananas >= CATCH_GOAL) phase = "won";
      else if (lives <= 0) phase = "lost";

      setState({
        phase,
        bananas,
        lives: Math.max(0, lives),
        cashEarned,
        drops: nextDrops,
        playerX: playerXRef.current,
        fieldW,
        fieldH,
      });

      if (hitShake) {
        // flush leftover cash occasionally so rewards feel live
        if (pendingCashRef.current >= CASH_PER_BANANA * 3) {
          void flushCash();
        }
      } else if (pendingCashRef.current >= CASH_PER_BANANA * 4) {
        void flushCash();
      }

      if (phase === "playing") {
        frameRef.current = requestAnimationFrame(tick);
      }
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [state.phase, flushCash, nextId]);

  // Award remaining cash + clear bonus
  useEffect(() => {
    if (state.phase !== "won" && state.phase !== "lost") return;
    if (awardedRef.current) return;
    awardedRef.current = true;

    void (async () => {
      let grant = pendingCashRef.current;
      pendingCashRef.current = 0;
      if (state.phase === "won") grant += CATCH_WIN_REWARD;
      if (grant > 0) {
        const balance = await awardCoins(grant);
        if (balance != null) setCoinBalanceRef.current(balance);
      }
      if (state.phase === "won") {
        setState((s) =>
          s.phase === "won"
            ? { ...s, cashEarned: s.cashEarned + CATCH_WIN_REWARD }
            : s,
        );
      }
    })();
  }, [state.phase]);

  return {
    state,
    goal: CATCH_GOAL,
    start,
    restart,
    aimAt,
    setFieldSize,
  };
}
