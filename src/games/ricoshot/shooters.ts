/** Helium Pop - ninja upgrades only; all throw the classic shuriken. */

export type ShooterId =
  | "base"
  | "discipline"
  | "sharp"
  | "double"
  | "jitsu"
  | "grandmaster"
  | "distraction"
  | "espionage"
  | "shinobi"
  | "sabotage"
  | "saboteur"
  | "seeking"
  | "caltrops"
  | "flash"
  | "sticky"
  | "bomber";

export type ShooterDef = {
  id: ShooterId;
  name: string;
  /** Short hover tip explaining the gimmick. */
  blurb: string;
  icon: string;
  /** Upgrade tier 0-5 (base = 0). */
  tier: number;
  /** Path 0 = base, 1 top / 2 mid / 3 bot. */
  path: 0 | 1 | 2 | 3;
  projectiles: number;
  spread: number;
  speedMul: number;
  maxTime: number;
  maxBounces: number;
  bloonDamage: number;
  wallDamage: number;
  /**
   * How many grey steel shelves this shot can delete on direct hits
   * (shared across multi-projectile bombs). Splash never breaks steel.
   */
  steelBreaks: number;
  phase: "none" | "wood" | "all";
  seek: number;
  aoeRadius: number;
  stopOnBloon: boolean;
  explodeOnWall: boolean;
  projectileColor: string;
};

/**
 * Power scales with stage HP budget (3 shots):
 * T0-1 clear light packs, T2 gains real damage, T3 multi/AoE,
 * T4 spray/burst, T5 deletes dense heavy fields.
 */
export const SHOOTERS: Record<ShooterId, ShooterDef> = {
  base: {
    id: "base",
    name: "Ninja Monkey",
    blurb: "Single shuriken that banks off walls and peels every bloon it threads.",
    icon: "/images/towers/ninja-monkey/ninja-monkey.webp",
    tier: 0,
    path: 0,
    projectiles: 1,
    spread: 0,
    speedMul: 1,
    maxTime: 6.2,
    maxBounces: 20,
    bloonDamage: 1,
    wallDamage: 1,
    steelBreaks: 0,
    phase: "none",
    seek: 0,
    aoeRadius: 0,
    stopOnBloon: false,
    explodeOnWall: false,
    projectileColor: "#d8dce8",
  },
  discipline: {
    id: "discipline",
    name: "Ninja Discipline",
    blurb: "Faster star with a bit more bounce life - same pierce, snappier line.",
    icon: "/images/towers/ninja-monkey/ninja-discipline.webp",
    tier: 1,
    path: 1,
    projectiles: 1,
    spread: 0,
    speedMul: 1.12,
    maxTime: 6.4,
    maxBounces: 22,
    bloonDamage: 1,
    wallDamage: 1,
    steelBreaks: 0,
    phase: "none",
    seek: 0,
    aoeRadius: 0,
    stopOnBloon: false,
    explodeOnWall: false,
    projectileColor: "#d8dce8",
  },
  sharp: {
    id: "sharp",
    name: "Sharp Shurikens",
    blurb: "Deals 2 damage per hit and keeps piercing - great for greens and yellows.",
    icon: "/images/towers/ninja-monkey/sharp-shurikens.webp",
    tier: 2,
    path: 1,
    projectiles: 1,
    spread: 0,
    speedMul: 1.05,
    maxTime: 6.8,
    maxBounces: 26,
    bloonDamage: 2,
    wallDamage: 1,
    steelBreaks: 0,
    phase: "none",
    seek: 0,
    aoeRadius: 0,
    stopOnBloon: false,
    explodeOnWall: false,
    projectileColor: "#e8ecf4",
  },
  double: {
    id: "double",
    name: "Double Shot",
    blurb: "Fires two 2-damage stars in a tight fan - cover two bank lines at once.",
    icon: "/images/towers/ninja-monkey/double-shot.webp",
    tier: 3,
    path: 1,
    projectiles: 2,
    spread: 0.09,
    speedMul: 1,
    maxTime: 6.5,
    maxBounces: 16,
    bloonDamage: 2,
    wallDamage: 1,
    steelBreaks: 0,
    phase: "none",
    seek: 0,
    aoeRadius: 0,
    stopOnBloon: false,
    explodeOnWall: false,
    projectileColor: "#c8d0e0",
  },
  jitsu: {
    id: "jitsu",
    name: "Bloonjitsu",
    blurb: "Five sharp stars in a wide spray - each hits for 2 and peels a lane.",
    icon: "/images/towers/ninja-monkey/bloonjitsu.webp",
    tier: 4,
    path: 1,
    projectiles: 5,
    spread: 0.065,
    speedMul: 0.95,
    maxTime: 6.2,
    maxBounces: 12,
    bloonDamage: 2,
    wallDamage: 1,
    steelBreaks: 0,
    phase: "none",
    seek: 0,
    aoeRadius: 0,
    stopOnBloon: false,
    explodeOnWall: false,
    projectileColor: "#b8c4dc",
  },
  grandmaster: {
    id: "grandmaster",
    name: "Grandmaster Ninja",
    blurb: "Ten heavy stars (3 dmg each) - melts dense packs if you fan the aim.",
    icon: "/images/towers/ninja-monkey/grandmaster-ninja.webp",
    tier: 5,
    path: 1,
    projectiles: 10,
    spread: 0.048,
    speedMul: 1,
    maxTime: 6.5,
    maxBounces: 14,
    bloonDamage: 3,
    wallDamage: 2,
    steelBreaks: 0,
    phase: "none",
    seek: 0,
    aoeRadius: 0,
    stopOnBloon: false,
    explodeOnWall: false,
    projectileColor: "#a8b8d8",
  },
  distraction: {
    id: "distraction",
    name: "Distraction",
    blurb: "Extra bounces and flight time - stay alive for long ricochet lines.",
    icon: "/images/towers/ninja-monkey/distraction.webp",
    tier: 1,
    path: 2,
    projectiles: 1,
    spread: 0,
    speedMul: 0.98,
    maxTime: 7.2,
    maxBounces: 30,
    bloonDamage: 1,
    wallDamage: 1,
    steelBreaks: 0,
    phase: "none",
    seek: 0,
    aoeRadius: 0,
    stopOnBloon: false,
    explodeOnWall: false,
    projectileColor: "#d0d4e0",
  },
  espionage: {
    id: "espionage",
    name: "Counter-Espionage",
    blurb: "Phases through wood walls and deals 2 damage - ignore soft barriers.",
    icon: "/images/towers/ninja-monkey/counter-espionage.webp",
    tier: 2,
    path: 2,
    projectiles: 1,
    spread: 0,
    speedMul: 1.02,
    maxTime: 6.8,
    maxBounces: 18,
    bloonDamage: 2,
    wallDamage: 0,
    steelBreaks: 0,
    phase: "wood",
    seek: 0,
    aoeRadius: 0,
    stopOnBloon: false,
    explodeOnWall: false,
    projectileColor: "#9aa8c0",
  },
  shinobi: {
    id: "shinobi",
    name: "Shinobi Tactics",
    blurb: "Two stars that phase wood and hit for 2 - sneak past shelves.",
    icon: "/images/towers/ninja-monkey/shinobi-tactics.webp",
    tier: 3,
    path: 2,
    projectiles: 2,
    spread: 0.1,
    speedMul: 1,
    maxTime: 6.8,
    maxBounces: 20,
    bloonDamage: 2,
    wallDamage: 0,
    steelBreaks: 0,
    phase: "wood",
    seek: 0,
    aoeRadius: 0,
    stopOnBloon: false,
    explodeOnWall: false,
    projectileColor: "#8898b8",
  },
  sabotage: {
    id: "sabotage",
    name: "Bloon Sabotage",
    blurb: "3 damage star that also shreds wood walls in a couple hits.",
    icon: "/images/towers/ninja-monkey/bloon-sabotage.webp",
    tier: 4,
    path: 2,
    projectiles: 1,
    spread: 0,
    speedMul: 1.08,
    maxTime: 6.5,
    maxBounces: 14,
    bloonDamage: 3,
    wallDamage: 3,
    steelBreaks: 0,
    phase: "none",
    seek: 0,
    aoeRadius: 0,
    stopOnBloon: false,
    explodeOnWall: false,
    projectileColor: "#7080a0",
  },
  saboteur: {
    id: "saboteur",
    name: "Grand Saboteur",
    blurb: "Three stars that phase all walls (even steel) and hit for 3 each.",
    icon: "/images/towers/ninja-monkey/grand-saboteur.webp",
    tier: 5,
    path: 2,
    projectiles: 3,
    spread: 0.08,
    speedMul: 1.05,
    maxTime: 7.2,
    maxBounces: 20,
    bloonDamage: 3,
    wallDamage: 0,
    steelBreaks: 0,
    phase: "all",
    seek: 0.35,
    aoeRadius: 0,
    stopOnBloon: false,
    explodeOnWall: false,
    projectileColor: "#607090",
  },
  seeking: {
    id: "seeking",
    name: "Seeking Shuriken",
    blurb: "Short seeker that peels a layer and deletes wood - strong vs MOABs.",
    icon: "/images/towers/ninja-monkey/seeking-shuriken.webp",
    tier: 1,
    path: 3,
    projectiles: 1,
    spread: 0,
    speedMul: 1,
    maxTime: 4.8,
    maxBounces: 10,
    bloonDamage: 1,
    wallDamage: 3,
    steelBreaks: 0,
    phase: "none",
    seek: 1.8,
    aoeRadius: 0,
    stopOnBloon: false,
    explodeOnWall: false,
    projectileColor: "#c8b8e8",
  },
  caltrops: {
    id: "caltrops",
    name: "Caltrops",
    blurb: "Two short seekers - each peels a layer, shreds wood, chips MOABs.",
    icon: "/images/towers/ninja-monkey/caltrops.webp",
    tier: 2,
    path: 3,
    projectiles: 2,
    spread: 0.12,
    speedMul: 1,
    maxTime: 4.8,
    maxBounces: 10,
    bloonDamage: 1,
    wallDamage: 3,
    steelBreaks: 0,
    phase: "none",
    seek: 1.7,
    aoeRadius: 0,
    stopOnBloon: false,
    explodeOnWall: false,
    projectileColor: "#b8a0e0",
  },
  flash: {
    id: "flash",
    name: "Flash Bomb",
    blurb: "Brief bomb - peels layers on contact, blasts wood/steel, melts MOABs.",
    icon: "/images/towers/ninja-monkey/flash-bomb.webp",
    tier: 3,
    path: 3,
    projectiles: 1,
    spread: 0,
    speedMul: 1,
    maxTime: 4.5,
    maxBounces: 8,
    bloonDamage: 1,
    wallDamage: 4,
    steelBreaks: 1,
    phase: "none",
    seek: 1.5,
    aoeRadius: 56,
    stopOnBloon: false,
    explodeOnWall: true,
    projectileColor: "#ffd35a",
  },
  sticky: {
    id: "sticky",
    name: "Sticky Bomb",
    blurb: "One heavy bomb - peels on hit, erases barriers, melts MOABs.",
    icon: "/images/towers/ninja-monkey/sticky-bomb.webp",
    tier: 4,
    path: 3,
    projectiles: 1,
    spread: 0,
    speedMul: 1,
    maxTime: 5,
    maxBounces: 8,
    bloonDamage: 1,
    wallDamage: 5,
    steelBreaks: 1,
    phase: "none",
    seek: 1.6,
    aoeRadius: 68,
    stopOnBloon: false,
    explodeOnWall: true,
    projectileColor: "#ff9a4a",
  },
  bomber: {
    id: "bomber",
    name: "Master Bomber",
    blurb: "Two barrier bombs - each peels a few layers, deletes steel, pops MOABs.",
    icon: "/images/towers/ninja-monkey/master-bomber.webp",
    tier: 5,
    path: 3,
    projectiles: 2,
    spread: 0.1,
    speedMul: 1,
    maxTime: 5.2,
    maxBounces: 9,
    bloonDamage: 1,
    wallDamage: 6,
    steelBreaks: 2,
    phase: "none",
    seek: 1.65,
    aoeRadius: 78,
    stopOnBloon: false,
    explodeOnWall: true,
    projectileColor: "#ff6a3a",
  },
};

export const ALL_SHOOTER_IDS = Object.keys(SHOOTERS) as ShooterId[];

export const LOADOUT_SIZE = 3;

/** Highest ninja tier for this stage. */
export function maxNinjaTierForRound(round: number): number {
  if (round <= 1) return 1;
  return Math.min(5, round);
}

/** Lowest ninja tier for this stage. */
export function minNinjaTierForRound(round: number): number {
  if (round <= 1) return 0;
  return Math.min(5, round);
}

/** Round 1 → T0-T1, round 2 → T2 only, … round 5 → T5 only. */
export function rollLoadout(round = 1): ShooterId[] {
  const lo = minNinjaTierForRound(round);
  const hi = maxNinjaTierForRound(round);
  let pool = ALL_SHOOTER_IDS.filter((id) => {
    const t = SHOOTERS[id].tier;
    return t >= lo && t <= hi;
  });
  if (pool.length === 0) pool = ["base"];
  const copy = [...pool];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const a = copy[i]!;
    copy[i] = copy[j]!;
    copy[j] = a;
  }
  const picked: ShooterId[] = [];
  for (const id of copy) {
    if (picked.length >= LOADOUT_SIZE) break;
    if (!picked.includes(id)) picked.push(id);
  }
  let guard = 0;
  while (picked.length < LOADOUT_SIZE && guard++ < 12) {
    picked.push(copy[picked.length % copy.length]!);
  }
  return picked;
}

export function shooterDef(id: ShooterId): ShooterDef {
  return SHOOTERS[id];
}
