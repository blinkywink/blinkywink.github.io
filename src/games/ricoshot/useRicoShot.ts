import { useCallback, useRef, useState } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { awardCoins } from "../../lib/awardCoins";
import { useQuizHeroFx } from "../../lib/quizHeroFx";
import {
  RICO_LIVES,
  RICO_ROUNDS,
  RICO_RUN_REWARD_CAP,
  ricoPuzzleReward,
  ricoRunClearBonus,
  type RicoBloon,
  type RicoWall,
} from "./config";
import {
  angleToward,
  fireShooter,
  generateRicoLevel,
  type BloonHit,
  type ExplodeEvent,
  type TraceResult,
  type WallHit,
} from "./physics";
import {
  LOADOUT_SIZE,
  rollLoadout,
  shooterDef,
  type ShooterId,
} from "./shooters";

export type RicoStatus =
  | "aiming"
  | "flying"
  | "won_puzzle"
  | "lost_puzzle"
  | "won_run"
  | "lost_run";

export type LoadoutSlot = {
  id: ShooterId;
  used: boolean;
};

export type Flight = {
  darts: TraceResult[];
  bloonHits: BloonHit[];
  wallHits: WallHit[];
  explodeAt: ExplodeEvent[];
  bloonsAfter: RicoBloon[];
  wallsAfter: RicoWall[];
  allPopped: boolean;
  index: number;
  swayT0: number;
  shooterId: ShooterId;
};

export type RicoState = {
  level: ReturnType<typeof generateRicoLevel>;
  bloons: RicoBloon[];
  walls: RicoWall[];
  loadout: LoadoutSlot[];
  selectedId: ShooterId;
  round: number;
  lives: number;
  solves: number;
  reward: number;
  status: RicoStatus;
  aimAngle: number;
  perfect: boolean;
  flight: Flight | null;
};

const AIM_UP = -Math.PI / 2;

function freshLoadout(round = 1): { loadout: LoadoutSlot[]; selectedId: ShooterId } {
  const ids = rollLoadout(round);
  return {
    loadout: ids.map((id) => ({ id, used: false })),
    selectedId: ids[0]!,
  };
}

function shotsLeftOf(loadout: LoadoutSlot[]): number {
  return loadout.filter((s) => !s.used).length;
}

function freshRun(): RicoState {
  const level = generateRicoLevel(1);
  const { loadout, selectedId } = freshLoadout(1);
  return {
    level,
    bloons: level.bloons.map((b) => ({ ...b })),
    walls: level.walls.map((w) => ({ ...w })),
    loadout,
    selectedId,
    round: 1,
    lives: RICO_LIVES,
    solves: 0,
    reward: 0,
    status: "aiming",
    aimAngle: AIM_UP,
    perfect: true,
    flight: null,
  };
}

function nextStage(s: RicoState, round: number): RicoState {
  const level = generateRicoLevel(round);
  const { loadout, selectedId } = freshLoadout(round);
  return {
    ...s,
    level,
    bloons: level.bloons.map((b) => ({ ...b })),
    walls: level.walls.map((w) => ({ ...w })),
    loadout,
    selectedId,
    round,
    status: "aiming",
    aimAngle: AIM_UP,
    flight: null,
  };
}

export function useRicoShot() {
  const { setCoinBalance } = useAuth();
  const { onCorrectCash } = useQuizHeroFx();
  const setCoinBalanceRef = useRef(setCoinBalance);
  setCoinBalanceRef.current = setCoinBalance;
  const onCorrectCashRef = useRef(onCorrectCash);
  onCorrectCashRef.current = onCorrectCash;

  const [state, setState] = useState<RicoState>(() => freshRun());

  const award = useCallback((amount: number) => {
    if (amount <= 0) return;
    void (async () => {
      const balance = await awardCoins(amount);
      if (balance != null) setCoinBalanceRef.current(balance);
      void onCorrectCashRef.current(setCoinBalanceRef.current);
    })();
  }, []);

  const setAimFromPoint = useCallback((x: number, y: number) => {
    setState((s) => {
      if (s.status !== "aiming") return s;
      return { ...s, aimAngle: angleToward(s.level.sniper, { x, y }) };
    });
  }, []);

  const selectShooter = useCallback((id: ShooterId) => {
    setState((s) => {
      if (s.status !== "aiming") return s;
      const slot = s.loadout.find((x) => x.id === id);
      if (!slot || slot.used) return s;
      return { ...s, selectedId: id };
    });
  }, []);

  const fire = useCallback(() => {
    setState((s) => {
      if (s.status !== "aiming") return s;
      const slot = s.loadout.find((x) => x.id === s.selectedId && !x.used);
      if (!slot) return s;
      const swayT0 = performance.now() / 1000;
      const result = fireShooter(
        { walls: s.walls, sniper: s.level.sniper, bloons: s.bloons },
        s.aimAngle,
        slot.id,
        swayT0,
      );

      const bloonHits: BloonHit[] = [];
      const wallHits: WallHit[] = [];
      for (const d of result.darts) {
        bloonHits.push(...d.bloonHits);
        wallHits.push(...d.wallHits);
      }

      const loadout = s.loadout.map((x) =>
        x.id === slot.id ? { ...x, used: true } : x,
      );

      return {
        ...s,
        loadout,
        // Keep this ninja selected until every projectile finishes.
        selectedId: slot.id,
        status: "flying",
        flight: {
          darts: result.darts,
          bloonHits,
          wallHits,
          explodeAt: result.explodeAt,
          bloonsAfter: result.bloonsAfter,
          wallsAfter: result.wallsAfter,
          allPopped: result.allPopped,
          index: 0,
          swayT0,
          shooterId: slot.id,
        },
      };
    });
  }, []);

  const advanceFlight = useCallback(() => {
    setState((s) => {
      if (s.status !== "flying" || !s.flight) return s;

      const bloons = s.flight.bloonsAfter.map((b) => ({ ...b }));
      const walls = s.flight.wallsAfter.map((w) => ({ ...w }));
      const alive = bloons.filter((b) => b.hp > 0);
      const shotsLeft = shotsLeftOf(s.loadout);
      const nextSel =
        s.loadout.find((x) => !x.used)?.id ?? s.selectedId;

      if (alive.length === 0) {
        const piece = ricoPuzzleReward({
          round: s.round,
          shotsLeft,
          bloons: s.level.bloons.length,
          cleared: true,
        });
        const solves = s.solves + 1;
        const clearedRun = solves >= RICO_ROUNDS;
        const bonus = clearedRun ? ricoRunClearBonus(s.perfect) : 0;
        const nextReward = Math.min(
          RICO_RUN_REWARD_CAP,
          s.reward + piece + bonus,
        );
        const gained = nextReward - s.reward;
        if (gained > 0) award(gained);
        return {
          ...s,
          bloons,
          walls,
          solves,
          reward: nextReward,
          selectedId: nextSel,
          status: clearedRun ? "won_run" : "won_puzzle",
          flight: null,
        };
      }

      if (shotsLeft <= 0) {
        const lives = s.lives - 1;
        return {
          ...s,
          bloons,
          walls,
          lives,
          perfect: false,
          selectedId: nextSel,
          status: lives <= 0 ? "lost_run" : "lost_puzzle",
          flight: null,
        };
      }

      return {
        ...s,
        bloons,
        walls,
        selectedId: nextSel,
        status: "aiming",
        flight: null,
      };
    });
  }, [award]);

  const continueRun = useCallback(() => {
    setState((s) => {
      if (s.status !== "won_puzzle" && s.status !== "lost_puzzle") return s;
      const nextRound = s.status === "won_puzzle" ? s.round + 1 : s.round;
      const snap = s;
      queueMicrotask(() => {
        setState(() => nextStage(snap, nextRound));
      });
      return s;
    });
  }, []);

  const playAgain = useCallback(() => {
    queueMicrotask(() => setState(freshRun()));
  }, []);

  return {
    state,
    maxRounds: RICO_ROUNDS,
    maxLives: RICO_LIVES,
    maxShots: LOADOUT_SIZE,
    selectShooter,
    setAimFromPoint,
    fire,
    advanceFlight,
    continueRun,
    playAgain,
    shooterDef,
  };
}
