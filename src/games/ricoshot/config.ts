/** Helium Pop — bank shots to peel bloons (red/blue/green HP). */

/** Portrait arena — fits phone viewport when CSS-scaled. */
export const RICO_W = 390;
export const RICO_H = 560;

export const RICO_ROUNDS = 5;
export const RICO_LIVES = 3;

export const SNIPER_R = 32;
/** Visual bloon radius (sprite draw + hit). */
export const BLOON_R = 16;
/** Extra forgiveness so near-misses that look like hits still count. */
export const BLOON_HIT_PAD = 5;
/** Physics / trail core size. */
export const DART_R = 11;
/** Drawn shuriken size — collision uses this so look matches feel. */
export const DART_DRAW_R = 20;
/** ~80% of the original snappy speed. */
export const DART_SPEED = 448;
export const DART_TTL = 6.2;
export const MAX_BOUNCES = 22;
/** Playback multiplier vs recorded points (~60 pts/s of sim). 3 ≈ prior fast feel. */
export const FLIGHT_PLAYBACK_RATE = 3;
/** Hits to shatter a wall (shows cracks as HP drops). */
export const WALL_MAX_HP = 3;
/** Steel shelves — only deleted by bottom-path direct hits (budgeted). */
export const STEEL_MAX_HP = 1;

/**
 * Peel ladder (weak → strong). HP maps 1:1 to ladder index + 1.
 * Later stages mix in tougher kinds.
 */
export type BloonKind =
  | "red"
  | "blue"
  | "green"
  | "yellow"
  | "pink"
  | "black"
  | "white"
  | "purple"
  | "zebra"
  | "lead"
  | "rainbow"
  | "ceramic"
  | "moab";

export const BLOON_LADDER: BloonKind[] = [
  "red",
  "blue",
  "green",
  "yellow",
  "pink",
  "black",
  "white",
  "purple",
  "zebra",
  "lead",
  "rainbow",
  "ceramic",
  "moab",
];

export const BLOON_HP: Record<BloonKind, number> = {
  red: 1,
  blue: 2,
  green: 3,
  yellow: 4,
  pink: 5,
  black: 6,
  white: 7,
  purple: 8,
  zebra: 10,
  lead: 12,
  rainbow: 15,
  ceramic: 20,
  /** Easy enough for a solid bottom-path volley; still wants aim. */
  moab: 22,
};

/** Drawn / hit radius — MOABs are chunky bosses. */
export const BLOON_RADIUS: Record<BloonKind, number> = {
  red: BLOON_R,
  blue: BLOON_R,
  green: BLOON_R,
  yellow: BLOON_R,
  pink: BLOON_R,
  black: BLOON_R,
  white: BLOON_R,
  purple: BLOON_R,
  zebra: BLOON_R,
  lead: BLOON_R,
  rainbow: BLOON_R,
  ceramic: BLOON_R + 2,
  moab: 52,
};

export const BLOON_IMGS: Record<BloonKind, string> = {
  red: "/images/bloons/btd6/red.webp",
  blue: "/images/bloons/btd6/blue.webp",
  green: "/images/bloons/btd6/green.webp",
  yellow: "/images/bloons/btd6/yellow.webp",
  pink: "/images/bloons/btd6/pink.webp",
  black: "/images/bloons/btd6/black.webp",
  white: "/images/bloons/btd6/white.webp",
  purple: "/images/bloons/btd6/purple.webp",
  zebra: "/images/bloons/btd6/zebra.webp",
  lead: "/images/bloons/btd6/lead.webp",
  rainbow: "/images/bloons/btd6/rainbow.webp",
  ceramic: "/images/bloons/btd6/ceramic.webp",
  // Same landscape asset as Banana Catch — draw rotated 90° CW.
  moab: "/images/bloons/moab.webp",
};

export function isBossBloon(kind: BloonKind): boolean {
  return kind === "moab";
}

/** Landscape blimp art → nose down (matches Banana Catch). */
export const MOAB_DRAW_ROT = Math.PI / 2;

export const SNIPER_IMG = "/images/towers/ninja-monkey/ninja-monkey.webp";
export const DART_IMG = "/images/bloons/shuriken.webp";

export type Vec = { x: number; y: number };
export type Rect = { x: number; y: number; w: number; h: number };
export type Circle = { x: number; y: number; r: number };

export type RicoWall = Rect & {
  hp: number;
  maxHp: number;
  /** Grey walls never crack or break. */
  indestructible?: boolean;
};

export type RicoBloon = Circle & {
  kind: BloonKind;
  hp: number;
  /** Radians offset for idle sway. */
  swayPhase: number;
  /** Oscillation rate (higher on later rounds). */
  swaySpeed: number;
  /** Max horizontal drift in px (kept small). */
  swayAmp: number;
};

export type RicoLevel = {
  walls: RicoWall[];
  sniper: Vec;
  bloons: RicoBloon[];
  solutionAngle: number;
  minBounces: number;
};

export function sniperHome(): Vec {
  return { x: RICO_W * 0.5, y: RICO_H - 44 };
}

export function kindFromHp(hp: number, prev?: BloonKind): BloonKind {
  // Bosses keep their look until popped.
  if (prev && isBossBloon(prev) && hp > 0) return prev;
  const h = Math.max(1, Math.round(hp));
  for (let i = BLOON_LADDER.length - 1; i >= 0; i--) {
    const k = BLOON_LADDER[i]!;
    if (isBossBloon(k)) continue;
    if (h >= BLOON_HP[k]) return k;
  }
  return "red";
}

export function makeWall(
  x: number,
  y: number,
  w: number,
  h: number,
  opts?: { indestructible?: boolean },
): RicoWall {
  if (opts?.indestructible) {
    return {
      x,
      y,
      w,
      h,
      hp: STEEL_MAX_HP,
      maxHp: STEEL_MAX_HP,
      // Flag = steel (grey). Only a budgeted direct bomb hit deletes it.
      indestructible: true,
    };
  }
  return { x, y, w, h, hp: WALL_MAX_HP, maxHp: WALL_MAX_HP };
}

/** 1 grey wall early; up to 2 on later rounds. */
export function steelCountForRound(round: number): number {
  if (round <= 2) return 1;
  if (round >= 5) return 2;
  return 2;
}

/**
 * Build walls from layout rects and mark the largest ones as grey steel.
 */
export function wallsFromRects(
  rects: Rect[],
  steelCount = 1,
): RicoWall[] {
  const walls = rects.map((r) => makeWall(r.x, r.y, r.w, r.h));
  if (walls.length === 0 || steelCount <= 0) return walls;

  const ranked = walls
    .map((w, i) => ({ i, area: w.w * w.h }))
    .sort((a, b) => b.area - a.area);

  const n = Math.min(steelCount, walls.length, 2);
  for (let k = 0; k < n; k++) {
    const idx = ranked[k]!.i;
    const w = walls[idx]!;
    walls[idx] = makeWall(w.x, w.y, w.w, w.h, { indestructible: true });
  }
  return walls;
}

/** Subtle sway — amp grows a little by round, never far from home. */
export function swayForRound(round: number): Pick<
  RicoBloon,
  "swayPhase" | "swaySpeed" | "swayAmp"
> {
  const r = Math.max(1, round);
  return {
    swayPhase: Math.random() * Math.PI * 2,
    swaySpeed: 1.35 + (r - 1) * 0.35,
    swayAmp: 7.5 + (r - 1) * 1.35,
  };
}

export function bloonPosAt(b: RicoBloon, t: number): Vec {
  const amp = b.swayAmp;
  const spd = b.swaySpeed;
  const ph = b.swayPhase;
  return {
    x: b.x + Math.sin(t * spd + ph) * amp,
    y: b.y + Math.sin(t * spd * 0.82 + ph + 1.15) * amp * 0.4,
  };
}

export function makeBloon(
  x: number,
  y: number,
  kind: BloonKind,
  round = 1,
): RicoBloon {
  return {
    x,
    y,
    r: BLOON_RADIUS[kind],
    kind,
    hp: BLOON_HP[kind],
    ...swayForRound(round),
  };
}

export function bloonCountForRound(round: number): number {
  // Keep pack size in step with ninja power (3 shots).
  if (round <= 1) return 7 + Math.floor(Math.random() * 2); // 7–8
  if (round === 2) return 9 + Math.floor(Math.random() * 2); // 9–10
  if (round === 3) return 11 + Math.floor(Math.random() * 2); // 11–12
  if (round === 4) return 13 + Math.floor(Math.random() * 3); // 13–15
  // R5: ~2 solid T5 shots to clear; one lucky wipe is rare.
  return 15 + Math.floor(Math.random() * 3); // 15–17
}

/**
 * Strength climbs with tier power — early stages stay red/blue/green,
 * T5 packs heavies plus guaranteed MOAB-class bosses.
 */
export function kindsForRound(round: number, count: number): BloonKind[] {
  type Band = { kind: BloonKind; w: number };
  const bands: Band[] =
    round <= 1
      ? [
          { kind: "red", w: 78 },
          { kind: "blue", w: 22 },
        ]
      : round === 2
        ? [
            { kind: "red", w: 48 },
            { kind: "blue", w: 34 },
            { kind: "green", w: 18 },
          ]
        : round === 3
          ? [
              { kind: "red", w: 22 },
              { kind: "blue", w: 28 },
              { kind: "green", w: 26 },
              { kind: "yellow", w: 16 },
              { kind: "pink", w: 8 },
            ]
          : round === 4
            ? [
                { kind: "blue", w: 12 },
                { kind: "green", w: 16 },
                { kind: "yellow", w: 20 },
                { kind: "pink", w: 18 },
                { kind: "black", w: 14 },
                { kind: "purple", w: 12 },
                { kind: "zebra", w: 8 },
              ]
            : [
                // Dense heavies — bomber splash can't cover the whole field.
                { kind: "lead", w: 18 },
                { kind: "rainbow", w: 22 },
                { kind: "ceramic", w: 42 },
                { kind: "zebra", w: 10 },
                { kind: "purple", w: 8 },
              ];

  const total = bands.reduce((s, b) => s + b.w, 0);
  const bag: BloonKind[] = [];
  for (let i = 0; i < count; i++) {
    let roll = Math.random() * total;
    let pick = bands[0]!.kind;
    for (const b of bands) {
      roll -= b.w;
      if (roll <= 0) {
        pick = b.kind;
        break;
      }
    }
    bag.push(pick);
  }
  if (round <= 3 && !bag.includes("red") && bag.length) bag[0] = "red";
  // Final stage: one basic MOAB in the pack.
  if (round >= 5 && bag.length >= 1) {
    bag[0] = "moab";
  }
  return bag;
}

export function ricoPuzzleReward(input: {
  round: number;
  shotsLeft: number;
  bloons: number;
  cleared: boolean;
}): number {
  if (!input.cleared) return 0;
  const base = 120;
  const roundBonus = Math.round(30 * (input.round - 1));
  const shotBonus = input.shotsLeft * 35;
  const multiBonus = Math.max(0, input.bloons - 4) * 15;
  return base + roundBonus + shotBonus + multiBonus;
}

/** Full-run clear bonus — total run payout still capped at RICO_RUN_REWARD_CAP. */
export function ricoRunClearBonus(perfect: boolean): number {
  return perfect ? 150 : 80;
}

/** Max coins from clearing an entire Helium Pop run. */
export const RICO_RUN_REWARD_CAP = 2500;
