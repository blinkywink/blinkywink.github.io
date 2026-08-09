import { maps } from "../../data/maps";
import { towerEntities } from "../../data/towers";
import { createCamoRound, type CamoRound } from "../camodetection/generateRound";
import {
  createMapChallenge,
  type MapChallenge,
} from "../geoguessr/questionGenerator";
import {
  createOrderUpRound,
  type OrderUpRound,
} from "../orderup/generateRound";
import {
  createPriceRound,
  type PriceRound,
} from "../pricecheck/generateRound";
import { createChallenge, type Challenge } from "../zoomed/questionGenerator";
import {
  MIXUP_KINDS,
  MIXUP_MEDIUM_ROUND,
  type MixupKind,
} from "./config";

export type MixupQuestion =
  | { kind: "zoomed"; slot: number; payload: Challenge }
  | { kind: "geoguessr"; slot: number; payload: MapChallenge }
  | { kind: "pricecheck"; slot: number; payload: PriceRound }
  | { kind: "orderup"; slot: number; payload: OrderUpRound }
  | { kind: "camodetection"; slot: number; payload: CamoRound };

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Run `fn` with a deterministic Math.random for a shared daily puzzle. */
function withSeededRandom<T>(seed: number, fn: () => T): T {
  const original = Math.random;
  let s = seed >>> 0 || 1;
  Math.random = () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  try {
    return fn();
  } finally {
    Math.random = original;
  }
}

function shuffleKinds(seed: number): MixupKind[] {
  return withSeededRandom(seed ^ 0x9e3779b9, () => {
    const bag = [...MIXUP_KINDS];
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = bag[i]!;
      bag[i] = bag[j]!;
      bag[j] = tmp;
    }
    return bag;
  });
}

/**
 * Build today's Mix Up — same 5 medium questions for everyone on `dayKey`
 * (UTC date string from dayStamp).
 */
export function generateMixupRun(dayKey: string): MixupQuestion[] {
  const seed = hashString(`mixup:${dayKey}`);
  const kinds = shuffleKinds(seed);
  const medium = MIXUP_MEDIUM_ROUND;

  return withSeededRandom(seed, () =>
    kinds.map((kind, index) => {
      const slot = index + 1;
      // Stable startedAt so zoom crops match for the whole day.
      const startedAt = hashString(`${dayKey}:${kind}:${slot}`);

      switch (kind) {
        case "zoomed": {
          const payload = createChallenge(medium, towerEntities);
          return {
            kind,
            slot,
            payload: { ...payload, startedAt },
          };
        }
        case "geoguessr": {
          const payload = createMapChallenge(medium, maps);
          return {
            kind,
            slot,
            payload: { ...payload, startedAt },
          };
        }
        case "pricecheck":
          return {
            kind,
            slot,
            payload: createPriceRound(medium),
          };
        case "orderup":
          return {
            kind,
            slot,
            payload: createOrderUpRound(medium),
          };
        case "camodetection":
          return {
            kind,
            slot,
            payload: createCamoRound(medium),
          };
      }
    }),
  );
}
