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

function shuffleKinds(): MixupKind[] {
  const bag = [...MIXUP_KINDS];
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = bag[i]!;
    bag[i] = bag[j]!;
    bag[j] = tmp;
  }
  return bag;
}

/** Build one medium question of each kind in a random order. */
export function generateMixupRun(): MixupQuestion[] {
  const kinds = shuffleKinds();
  const medium = MIXUP_MEDIUM_ROUND;

  return kinds.map((kind, index) => {
    const slot = index + 1;
    switch (kind) {
      case "zoomed":
        return {
          kind,
          slot,
          payload: createChallenge(medium, towerEntities),
        };
      case "geoguessr":
        return {
          kind,
          slot,
          payload: createMapChallenge(medium, maps),
        };
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
  });
}
