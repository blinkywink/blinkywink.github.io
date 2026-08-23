import {
  bloonCountForRound,
  bloonPosAt,
  BLOON_HIT_PAD,
  BLOON_R,
  DART_DRAW_R,
  DART_SPEED,
  isBossBloon,
  kindFromHp,
  kindsForRound,
  makeBloon,
  MAX_BOUNCES,
  RICO_H,
  RICO_W,
  sniperHome,
  steelCountForRound,
  wallsFromRects,
  type BloonKind,
  type Rect,
  type RicoBloon,
  type RicoLevel,
  type RicoWall,
  type Vec,
} from "./config";
import { LOADOUT_SIZE, shooterDef, type ShooterId } from "./shooters";

export type TraceHit = { kind: "done" };

export type BloonHit = {
  index: number;
  at: number;
  pos: Vec;
  /** HP after this hit. */
  hpAfter: number;
};

export type WallHit = {
  index: number;
  at: number;
  pos: Vec;
  hpAfter: number;
  shattered: boolean;
};

export type ExplodeEvent = {
  at: number;
  pos: Vec;
  radius: number;
};

export type TraceResult = {
  points: Vec[];
  bounceAt: number[];
  bounces: number;
  bloonHits: BloonHit[];
  wallHits: WallHit[];
  explodeAt: ExplodeEvent[];
  /** Bloon states after this shot. */
  bloonsAfter: RicoBloon[];
  wallsAfter: RicoWall[];
  allPopped: boolean;
  hit: TraceHit;
};

/** Multi-projectile fire result for the active shooter. */
export type ShooterFireResult = {
  darts: TraceResult[];
  bloonsAfter: RicoBloon[];
  wallsAfter: RicoWall[];
  allPopped: boolean;
  explodeAt: ExplodeEvent[];
};

export type ShotMods = {
  speed?: number;
  maxTime?: number;
  maxBounces?: number;
  bloonDamage?: number;
  wallDamage?: number;
  /** Pass wood walls (still bounce steel). */
  phaseWood?: boolean;
  /** Pass wood and steel (borders still bounce). */
  phaseAll?: boolean;
  /**
   * Shared budget for deleting steel on direct hits this shot.
   * Mutated as projectiles consume breaks. Splash never breaks steel.
   */
  steelBreakBudget?: { left: number };
  /**
   * Damage multiplier vs MOAB. Bottom path bombs melt them;
   * other paths chip slowly.
   */
  bossDamageMul?: number;
  /** Homing turn rate toward nearest bloon (rad/s). */
  seek?: number;
  aoeRadius?: number;
  stopOnBloon?: boolean;
  explodeOnWall?: boolean;
  /** Cap how many bloons one dart can peel (bottom path). */
  maxBloonHits?: number;
  dartR?: number;
  ghost?: boolean;
  recordEvery?: number;
  swayT0?: number;
};

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function dist2(a: Vec, b: Vec) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function circlesOverlap(
  a: { x: number; y: number; r: number },
  b: { x: number; y: number; r: number },
  pad = 0,
) {
  const r = a.r + b.r + pad;
  return dist2(a, b) <= r * r;
}

/** Closest-point distance from circle to segment (tunnel-safe hits). */
function segmentHitsCircle(
  a: Vec,
  b: Vec,
  c: { x: number; y: number; r: number },
  pad = 0,
): boolean {
  const r = c.r + pad;
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const len2 = abx * abx + aby * aby;
  if (len2 < 1e-8) return dist2(a, c) <= r * r;
  let t = ((c.x - a.x) * abx + (c.y - a.y) * aby) / len2;
  t = clamp(t, 0, 1);
  const px = a.x + abx * t;
  const py = a.y + aby * t;
  const dx = c.x - px;
  const dy = c.y - py;
  return dx * dx + dy * dy <= r * r;
}

function circleHitsRect(
  c: { x: number; y: number; r: number },
  r: Rect,
) {
  const nx = clamp(c.x, r.x, r.x + r.w);
  const ny = clamp(c.y, r.y, r.y + r.h);
  const dx = c.x - nx;
  const dy = c.y - ny;
  return dx * dx + dy * dy <= c.r * c.r;
}

function segmentHitsRect(a: Vec, b: Vec, r: Rect, pad = 0): boolean {
  const x1 = r.x - pad;
  const y1 = r.y - pad;
  const x2 = r.x + r.w + pad;
  const y2 = r.y + r.h + pad;
  const steps = Math.max(10, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 6));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t;
    if (x >= x1 && x <= x2 && y >= y1 && y <= y2) return true;
  }
  return false;
}

function clearLineOfSight(from: Vec, to: Vec, walls: Rect[]): boolean {
  for (const w of walls) {
    if (w.w <= 0 || w.h <= 0) continue;
    if ("hp" in w && (w as RicoWall).hp <= 0) continue;
    if (segmentHitsRect(from, to, w, 4)) return false;
  }
  return true;
}

function bounceOffRect(pos: Vec, vel: Vec, r: Rect, rad: number): Vec {
  const nearestX = clamp(pos.x, r.x, r.x + r.w);
  const nearestY = clamp(pos.y, r.y, r.y + r.h);
  const dx = pos.x - nearestX;
  const dy = pos.y - nearestY;
  if (Math.abs(dx) > Math.abs(dy)) {
    pos.x = dx >= 0 ? r.x + r.w + rad + 0.5 : r.x - rad - 0.5;
    return { x: -vel.x, y: vel.y };
  }
  pos.y = dy >= 0 ? r.y + r.h + rad + 0.5 : r.y - rad - 0.5;
  return { x: vel.x, y: -vel.y };
}

function bounceBorder(pos: Vec, vel: Vec, rad: number, inset: number): Vec {
  let vx = vel.x;
  let vy = vel.y;
  if (pos.x < inset + rad) {
    pos.x = inset + rad;
    vx = Math.abs(vx);
  } else if (pos.x > RICO_W - inset - rad) {
    pos.x = RICO_W - inset - rad;
    vx = -Math.abs(vx);
  }
  if (pos.y < inset + rad) {
    pos.y = inset + rad;
    vy = Math.abs(vy);
  } else if (pos.y > RICO_H - inset - rad) {
    pos.y = RICO_H - inset - rad;
    vy = -Math.abs(vy);
  }
  return { x: vx, y: vy };
}

function cloneBloons(bloons: RicoBloon[]): RicoBloon[] {
  return bloons.map((b) => ({ ...b }));
}

function cloneWalls(walls: RicoWall[]): RicoWall[] {
  return walls.map((w) => ({ ...w }));
}

/**
 * Simulate one projectile with optional shooter mods.
 * Walls crack on hit and shatter — dart can pass through when broken.
 */
export function traceShot(
  level: Pick<RicoLevel, "walls" | "sniper" | "bloons">,
  angle: number,
  opts: ShotMods = {},
): TraceResult {
  const maxTime = opts.maxTime ?? 5.5;
  const recordEvery = opts.recordEvery ?? 2;
  const swayT0 = opts.swayT0 ?? 0;
  const speed = opts.speed ?? DART_SPEED;
  const maxBounces = opts.maxBounces ?? MAX_BOUNCES;
  const bloonDamage = opts.bloonDamage ?? 1;
  const wallDamage = opts.wallDamage ?? 1;
  const phaseWood = opts.phaseWood ?? false;
  const phaseAll = opts.phaseAll ?? false;
  const steelBudget = opts.steelBreakBudget;
  const bossDamageMul = opts.bossDamageMul ?? 1;
  const seek = opts.seek ?? 0;
  const aoeRadius = opts.aoeRadius ?? 0;
  const stopOnBloon = opts.stopOnBloon ?? false;
  const explodeOnWall = opts.explodeOnWall ?? false;
  const maxBloonHits = opts.maxBloonHits ?? Infinity;
  let bloonHitCount = 0;
  let bossRehitAt = -1;
  // Match the drawn shuriken, not the skinny trail core.
  const dartR = opts.dartR ?? DART_DRAW_R;
  const inset = 8;
  const pos = { x: level.sniper.x, y: level.sniper.y };
  let vel = {
    x: Math.cos(angle) * speed,
    y: Math.sin(angle) * speed,
  };
  const points: Vec[] = [{ ...pos }];
  const bounceAt: number[] = [];
  const bloonHits: BloonHit[] = [];
  const wallHits: WallHit[] = [];
  const explodeAt: ExplodeEvent[] = [];
  const live = cloneBloons(level.bloons);
  const liveWalls = cloneWalls(level.walls);
  const hitSet = new Set<number>();
  const wallContact = new Set<number>();
  let bounces = 0;
  let t = 0;
  const dt = 1 / 120;
  let step = 0;
  let done = false;

  pos.x += Math.cos(angle) * (32 + dartR + 2);
  pos.y += Math.sin(angle) * (32 + dartR + 2);

  const applyBloonDamage = (
    i: number,
    at: number,
    impact: Vec,
    fromAoe = false,
  ) => {
    const b = live[i]!;
    if (b.hp <= 0) return;
    let dmg = Math.max(1, bloonDamage);
    if (isBossBloon(b.kind)) {
      dmg = Math.max(1, Math.round(Math.max(1, bloonDamage) * bossDamageMul));
      if (fromAoe) {
        dmg =
          bossDamageMul >= 2
            ? Math.max(1, Math.floor(dmg * 0.6))
            : 1;
      }
    } else if (fromAoe && bossDamageMul >= 2) {
      // Bomb splash never touches normal bloons (walls + MOAB only).
      return;
    }
    // Every real hit peels at least one layer.
    dmg = Math.max(1, dmg);
    const hpAfter = b.hp - dmg;
    b.hp = Math.max(0, hpAfter);
    b.kind = kindFromHp(Math.max(1, b.hp), b.kind);
    bloonHits.push({
      index: i,
      at,
      pos: { ...impact },
      hpAfter: b.hp,
    });
  };

  const applyAoe = (center: Vec, at: number, skipIndex?: number) => {
    if (aoeRadius <= 0) return;
    explodeAt.push({ at, pos: { ...center }, radius: aoeRadius });
    for (let i = 0; i < live.length; i++) {
      if (i === skipIndex) continue;
      const b = live[i]!;
      if (b.hp <= 0) continue;
      // Bottom-path splash: MOABs only (plus wood below).
      if (bossDamageMul >= 2 && !isBossBloon(b.kind)) continue;
      const bp = bloonPosAt(b, swayT0 + t);
      if (dist2(bp, center) <= aoeRadius * aoeRadius) {
        applyBloonDamage(i, at, bp, true);
      }
    }
    // Bombs crack nearby wood only — steel needs a direct hit + budget.
    if (wallDamage > 0) {
      for (let wi = 0; wi < liveWalls.length; wi++) {
        const wall = liveWalls[wi]!;
        if (wall.hp <= 0 || wall.indestructible) continue;
        const cx = wall.x + wall.w * 0.5;
        const cy = wall.y + wall.h * 0.5;
        const near =
          dist2(center, { x: cx, y: cy }) <=
          (aoeRadius + Math.max(wall.w, wall.h) * 0.35) ** 2;
        if (!near) continue;
        wall.hp -= wallDamage;
        wallHits.push({
          index: wi,
          at,
          pos: { x: cx, y: cy },
          hpAfter: Math.max(0, wall.hp),
          shattered: wall.hp <= 0,
        });
      }
    }
  };

  while (t < maxTime && bounces <= maxBounces && !done) {
    // Mild seek toward nearest live bloon
    if (seek > 0 && !opts.ghost) {
      let best: Vec | null = null;
      let bestD = Infinity;
      for (let i = 0; i < live.length; i++) {
        const b = live[i]!;
        if (b.hp <= 0) continue;
        const bp = bloonPosAt(b, swayT0 + t);
        const d = dist2(pos, bp);
        if (d < bestD) {
          bestD = d;
          best = bp;
        }
      }
      if (best) {
        const desired = Math.atan2(best.y - pos.y, best.x - pos.x);
        const cur = Math.atan2(vel.y, vel.x);
        let diff = desired - cur;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const maxTurn = seek * dt;
        const turn = clamp(diff, -maxTurn, maxTurn);
        const spd = Math.hypot(vel.x, vel.y) || speed;
        const na = cur + turn;
        vel = { x: Math.cos(na) * spd, y: Math.sin(na) * spd };
      }
    }

    const prevPos = { x: pos.x, y: pos.y };
    pos.x += vel.x * dt;
    pos.y += vel.y * dt;
    t += dt;
    step++;

    const dart = { x: pos.x, y: pos.y, r: dartR };
    const before = { ...vel };
    vel = bounceBorder(pos, vel, dartR, inset);
    if (vel.x !== before.x || vel.y !== before.y) {
      bounces++;
      bounceAt.push(points.length);
    }

    for (let wi = 0; wi < liveWalls.length; wi++) {
      const wall = liveWalls[wi]!;
      if (wall.hp <= 0) {
        wallContact.delete(wi);
        continue;
      }
      if (!circleHitsRect(dart, wall)) {
        wallContact.delete(wi);
        continue;
      }

      // Phase through walls (wizard: all; legacy wood-only)
      if (phaseAll || (phaseWood && !wall.indestructible)) {
        continue;
      }

      if (opts.ghost) {
        vel = bounceOffRect(pos, vel, wall, dartR);
        bounces++;
        bounceAt.push(points.length);
        break;
      }

      // Steel: one direct delete if budget remains, else bounce forever.
      if (wall.indestructible) {
        const canBreak = !!steelBudget && steelBudget.left > 0;
        if (!wallContact.has(wi)) {
          wallContact.add(wi);
          if (canBreak) {
            steelBudget!.left -= 1;
            wall.hp = 0;
            wallHits.push({
              index: wi,
              at: points.length,
              pos: { x: pos.x, y: pos.y },
              hpAfter: 0,
              shattered: true,
            });
            if (aoeRadius > 0 && explodeOnWall) {
              applyAoe({ x: pos.x, y: pos.y }, points.length);
            }
            // Shelf gone — keep flying through.
          } else {
            vel = bounceOffRect(pos, vel, wall, dartR);
            bounces++;
            bounceAt.push(points.length);
          }
        } else if (wall.hp > 0) {
          vel = bounceOffRect(pos, vel, wall, dartR);
        }
        break;
      }

      if (!wallContact.has(wi)) {
        wallContact.add(wi);
        if (wallDamage > 0) {
          wall.hp -= wallDamage;
          const shattered = wall.hp <= 0;
          wallHits.push({
            index: wi,
            at: points.length,
            pos: { x: pos.x, y: pos.y },
            hpAfter: Math.max(0, wall.hp),
            shattered,
          });
          if (aoeRadius > 0 && (explodeOnWall || shattered)) {
            applyAoe({ x: pos.x, y: pos.y }, points.length);
          }
          if (shattered) {
            // Wood is gone — keep flying through the gap.
          } else if (explodeOnWall) {
            // Soft wood ate the bomb.
            done = true;
            break;
          } else {
            vel = bounceOffRect(pos, vel, wall, dartR);
            bounces++;
            bounceAt.push(points.length);
          }
        } else {
          vel = bounceOffRect(pos, vel, wall, dartR);
          bounces++;
          bounceAt.push(points.length);
        }
      } else if (wall.hp > 0) {
        vel = bounceOffRect(pos, vel, wall, dartR);
      }
      break;
    }

    if (done) break;

    if (!opts.ghost) {
      for (let i = 0; i < live.length; i++) {
        const b = live[i]!;
        if (b.hp <= 0) continue;
        const boss = isBossBloon(b.kind);
        if (!boss && hitSet.has(i)) continue;
        if (boss && t < bossRehitAt) continue;
        const bp = bloonPosAt(b, swayT0 + t);
        const hitR = (b.r || BLOON_R) + BLOON_HIT_PAD;
        const target = { x: bp.x, y: bp.y, r: hitR };
        // Center sample + full-segment sweep (catches fast pass-throughs).
        if (
          circlesOverlap(dart, target, 0) ||
          segmentHitsCircle(prevPos, pos, target, dartR)
        ) {
          if (!boss) hitSet.add(i);
          else bossRehitAt = t + 0.18;
          // Record impact on the trail so pop VFX lines up with the star.
          points.push({ x: pos.x, y: pos.y });
          applyBloonDamage(i, points.length - 1, bp);
          if (aoeRadius > 0) {
            applyAoe(bp, points.length - 1, i);
          }
          // Pierce budget is for pack peels — MOABs don't burn it out.
          if (!boss) bloonHitCount += 1;
          if (stopOnBloon || bloonHitCount >= maxBloonHits) {
            done = true;
            break;
          }
        }
      }
    }

    if (step % recordEvery === 0) points.push({ ...pos });
  }

  points.push({ ...pos });
  const bloonsFull = live.map((b) => ({
    ...b,
    kind: kindFromHp(Math.max(1, b.hp), b.kind),
    hp: Math.max(0, b.hp),
  }));
  const wallsFull = liveWalls.map((w) => ({
    ...w,
    hp: Math.max(0, w.hp),
  }));

  return {
    points,
    bounceAt,
    bounces,
    bloonHits,
    wallHits,
    explodeAt,
    bloonsAfter: bloonsFull,
    wallsAfter: wallsFull,
    allPopped: bloonsFull.every((b) => b.hp <= 0),
    hit: { kind: "done" },
  };
}

/** Fire a full shooter kit (may be multi-projectile). */
export function fireShooter(
  level: Pick<RicoLevel, "walls" | "sniper" | "bloons">,
  aimAngle: number,
  shooterId: ShooterId,
  swayT0 = 0,
): ShooterFireResult {
  const def = shooterDef(shooterId);
  const steelBreakBudget = { left: Math.max(0, def.steelBreaks) };
  const mods: ShotMods = {
    speed: DART_SPEED * def.speedMul,
    maxTime: def.maxTime,
    maxBounces: def.maxBounces,
    bloonDamage: def.bloonDamage,
    wallDamage: def.wallDamage,
    steelBreakBudget,
    // Bottom path: wall/MOAB specialists — weak vs normal bloons.
    bossDamageMul: def.path === 3 ? (def.tier >= 5 ? 12 : def.tier >= 4 ? 9 : def.tier >= 3 ? 7 : 3) : 0.45,
    phaseWood: def.phase === "wood",
    phaseAll: def.phase === "all",
    seek: def.seek,
    aoeRadius: def.aoeRadius,
    stopOnBloon: def.stopOnBloon,
    explodeOnWall: def.explodeOnWall,
    // Bottom path peels a few layers then dies — no endless empty passes.
    maxBloonHits:
      def.path === 3
        ? def.tier >= 5
          ? 3
          : def.tier >= 3
            ? 2
            : 3
        : undefined,
    swayT0,
  };

  const offsets: number[] = [];
  if (def.projectiles <= 1) {
    offsets.push(0);
  } else {
    const mid = (def.projectiles - 1) / 2;
    for (let i = 0; i < def.projectiles; i++) {
      offsets.push((i - mid) * def.spread);
    }
  }

  let bloons = cloneBloons(level.bloons);
  let walls = cloneWalls(level.walls);
  const darts: TraceResult[] = [];
  const explodeAt: ExplodeEvent[] = [];

  for (const off of offsets) {
    const shot = traceShot(
      { walls, sniper: level.sniper, bloons },
      aimAngle + off,
      mods,
    );
    darts.push(shot);
    bloons = shot.bloonsAfter;
    walls = shot.wallsAfter;
    for (const e of shot.explodeAt) explodeAt.push(e);
  }

  return {
    darts,
    bloonsAfter: bloons,
    wallsAfter: walls,
    allPopped: bloons.every((b) => b.hp <= 0),
    explodeAt,
  };
}

function rand(lo: number, hi: number) {
  return lo + Math.random() * (hi - lo);
}

function randInt(lo: number, hi: number) {
  return Math.floor(rand(lo, hi + 1));
}

function clearOf(
  c: { x: number; y: number; r: number },
  others: { x: number; y: number; r: number }[],
  walls: Rect[],
  pad: number,
): boolean {
  for (const o of others) {
    if (circlesOverlap(c, o, pad)) return false;
  }
  for (const w of walls) {
    if ("hp" in w && (w as RicoWall).hp <= 0) continue;
    if (circleHitsRect(c, w)) return false;
  }
  if (
    c.x < 22 + c.r ||
    c.x > RICO_W - 22 - c.r ||
    c.y < 22 + c.r ||
    c.y > RICO_H - 70 - c.r
  ) {
    return false;
  }
  return true;
}

type LayoutSeed = {
  id: string;
  walls: Rect[];
  aimLo: number;
  aimHi: number;
  bloonOk: (p: Vec) => boolean;
  minBounces: number;
};

function makeLayouts(difficulty: number): LayoutSeed[] {
  const d = difficulty;
  const thick = 26 + Math.min(6, d * 2);
  const mid = RICO_W * 0.5;
  const layouts: LayoutSeed[] = [];

  {
    const roofY = rand(260, 320);
    const gap = rand(70, 95);
    layouts.push({
      id: "shelf-L",
      aimLo: -Math.PI + 0.3,
      aimHi: -Math.PI / 2 - 0.2,
      minBounces: 1,
      walls: [
        { x: gap, y: roofY, w: RICO_W - gap - 18, h: thick },
        { x: RICO_W - 40, y: roofY - 150, w: thick, h: 180 },
        { x: mid - 70, y: RICO_H - 140, w: 140, h: 20 },
      ],
      bloonOk: (p) => p.y < roofY - 28 && p.x > mid,
    });
  }
  {
    const roofY = rand(260, 320);
    const gap = rand(70, 95);
    layouts.push({
      id: "shelf-R",
      aimLo: -Math.PI / 2 + 0.2,
      aimHi: -0.25,
      minBounces: 1,
      walls: [
        { x: 18, y: roofY, w: RICO_W - gap - 18, h: thick },
        { x: 14, y: roofY - 150, w: thick, h: 180 },
        { x: mid - 70, y: RICO_H - 140, w: 140, h: 20 },
      ],
      bloonOk: (p) => p.y < roofY - 28 && p.x < mid,
    });
  }
  {
    const left = Math.random() < 0.5;
    const px = mid - thick / 2 + rand(-20, 20);
    layouts.push({
      id: left ? "pillar-L" : "pillar-R",
      aimLo: left ? -Math.PI + 0.2 : -Math.PI / 2 + 0.15,
      aimHi: left ? -Math.PI / 2 - 0.15 : -0.2,
      minBounces: 1,
      walls: [
        { x: px, y: 60, w: thick + 2, h: rand(280, 360) },
        { x: mid - 75, y: RICO_H - 140, w: 150, h: 20 },
      ],
      bloonOk: (p) =>
        p.y < 240 && (left ? p.x < px - 16 : p.x > px + thick + 16),
    });
  }
  {
    const left = Math.random() < 0.5;
    const vx = left ? rand(110, 150) : rand(RICO_W - 176, RICO_W - 136);
    const hy = rand(270, 330);
    layouts.push({
      id: left ? "pocket-L" : "pocket-R",
      aimLo: left ? -Math.PI + 0.25 : -0.95,
      aimHi: left ? -0.95 : -0.25,
      minBounces: 1,
      walls: [
        { x: vx, y: 45, w: thick, h: hy - 45 },
        {
          x: left ? vx : vx - rand(120, 150),
          y: hy,
          w: rand(130, 160),
          h: thick,
        },
        { x: mid - 65, y: RICO_H - 140, w: 130, h: 20 },
      ],
      bloonOk: (p) =>
        left
          ? p.x < vx - 8 && p.y < hy - 8
          : p.x > vx + thick + 8 && p.y < hy - 8,
    });
  }
  {
    layouts.push({
      id: "zigzag",
      aimLo: -Math.PI + 0.35,
      aimHi: -0.35,
      minBounces: Math.min(2, 1 + Math.floor(d / 2)),
      walls: [
        { x: 55, y: 90, w: thick, h: 200 },
        { x: RICO_W - 55 - thick, y: 180, w: thick, h: 200 },
        { x: mid - 80, y: 350, w: 160, h: 20 },
        ...(d >= 2 ? [{ x: mid - 60, y: 60, w: 120, h: 20 } as Rect] : []),
      ],
      bloonOk: (p) => p.y < 160 && (p.x < 90 || p.x > RICO_W - 90),
    });
  }
  {
    const gap = rand(90, 115);
    layouts.push({
      id: "alley",
      aimLo: -Math.PI + 0.4,
      aimHi: -0.4,
      minBounces: 1,
      walls: [
        { x: mid - gap / 2 - thick, y: 50, w: thick, h: 340 },
        { x: mid + gap / 2, y: 50, w: thick, h: 340 },
        { x: mid - 60, y: RICO_H - 140, w: 120, h: 20 },
      ],
      bloonOk: (p) =>
        p.y < 150 && p.x > mid - gap / 2 + 8 && p.x < mid + gap / 2 - 8,
    });
  }
  {
    const left = Math.random() < 0.5;
    const bx = left ? 40 : RICO_W - 200;
    layouts.push({
      id: left ? "bunker-L" : "bunker-R",
      aimLo: -Math.PI + 0.2,
      aimHi: -0.2,
      minBounces: 1,
      walls: [
        { x: bx, y: 180, w: 160, h: thick },
        { x: bx, y: 180, w: thick, h: 170 },
        { x: bx + 160 - thick, y: 180, w: thick, h: 170 },
        { x: mid - 65, y: RICO_H - 140, w: 130, h: 20 },
      ],
      bloonOk: (p) =>
        p.x > bx + thick + 6 &&
        p.x < bx + 160 - thick - 6 &&
        p.y > 180 + thick + 6 &&
        p.y < 330,
    });
  }
  {
    const openLeft = Math.random() < 0.5;
    layouts.push({
      id: openLeft ? "loft-L" : "loft-R",
      aimLo: openLeft ? -Math.PI + 0.25 : -Math.PI / 2,
      aimHi: openLeft ? -Math.PI / 2 : -0.25,
      minBounces: 1,
      walls: [
        openLeft
          ? { x: 18, y: 330, w: 280, h: thick }
          : { x: RICO_W - 298, y: 330, w: 280, h: thick },
        {
          x: openLeft ? 18 : RICO_W - 18 - thick,
          y: 60,
          w: thick,
          h: 280,
        },
        { x: mid - 65, y: RICO_H - 140, w: 130, h: 20 },
      ],
      bloonOk: (p) => p.y < 310 && (openLeft ? p.x < mid - 20 : p.x > mid + 20),
    });
  }
  {
    layouts.push({
      id: "rungs",
      aimLo: -Math.PI + 0.3,
      aimHi: -0.3,
      minBounces: 1,
      walls: [
        { x: 18, y: 160, w: 220, h: thick },
        { x: RICO_W - 238, y: 270, w: 220, h: thick },
        { x: 18, y: 380, w: 200, h: thick },
        { x: mid - 60, y: RICO_H - 140, w: 120, h: 20 },
      ],
      bloonOk: (p) => p.y < 140 || (p.y > 180 && p.y < 250 && p.x > mid),
    });
  }

  return layouts;
}

function emptyGhost(walls: RicoWall[], sniper: Vec): RicoLevel {
  return {
    walls: cloneWalls(walls),
    sniper,
    bloons: [makeBloon(-200, -200, "red", 1)],
    solutionAngle: 0,
    minBounces: 0,
  };
}

function cheatsBlocked(level: RicoLevel): boolean {
  const solid = level.walls.filter((w) => w.hp > 0);
  // Most bloons must be behind cover (cheap LOS only).
  let open = 0;
  for (const b of level.bloons) {
    if (clearLineOfSight(level.sniper, b, solid)) open++;
  }
  if (open > Math.max(1, Math.floor(level.bloons.length * 0.15))) return false;

  // Spot-check a few bloons for bounce-free cheese (avoid O(n×25) traces).
  const step = Math.max(1, Math.ceil(level.bloons.length / 4));
  for (let bi = 0; bi < level.bloons.length; bi += step) {
    const b = level.bloons[bi]!;
    const base = angleToward(level.sniper, b);
    for (let i = -4; i <= 4; i += 2) {
      const shot = traceShot(level, base + i * 0.04, {
        maxTime: 2.2,
        recordEvery: 3,
      });
      if (shot.bloonHits.length > 0 && shot.bounces === 0) return false;
    }
  }
  return true;
}

/**
 * Soft solvability — full clear of ceramic packs is impossible with 3×1-dmg
 * traces, so only require meaningful progress per shot.
 */
function clearableInShots(
  level: RicoLevel,
  angle: number,
  shots = LOADOUT_SIZE,
): boolean {
  let bloons = cloneBloons(level.bloons);
  let walls = cloneWalls(level.walls);
  const startHp = bloons.reduce((s, b) => s + Math.max(0, b.hp), 0);
  let hits = 0;
  for (let s = 0; s < shots; s++) {
    const slack = s === 0 ? [-0.05, 0, 0.05] : [0];
    let best: TraceResult | null = null;
    for (const off of slack) {
      const shot = traceShot(
        { walls, sniper: level.sniper, bloons },
        angle + off,
        { maxTime: 5.5, recordEvery: 2 },
      );
      if (!best || shot.bloonHits.length > best.bloonHits.length) best = shot;
    }
    if (!best || best.bloonHits.length === 0) break;
    hits += best.bloonHits.length;
    bloons = best.bloonsAfter.filter((b) => b.hp > 0);
    walls = best.wallsAfter;
    if (bloons.length === 0) return true;
  }
  const endHp = bloons.reduce((s, b) => s + Math.max(0, b.hp), 0);
  const needHits = Math.max(3, Math.ceil(level.bloons.length * 0.25));
  return hits >= needHits || endHp <= startHp * 0.72;
}

function placeBloonsOnPath(
  path: Vec[],
  firstBounce: number,
  walls: RicoWall[],
  sniper: Vec,
  kinds: BloonKind[],
  bloonOk: (p: Vec) => boolean,
  round: number,
): RicoBloon[] | null {
  const bloons: RicoBloon[] = [];
  const lo = Math.max(4, Math.floor(path.length * 0.22));
  const hi = Math.floor(path.length * 0.9);
  if (hi <= lo) return null;

  let guard = 0;
  while (bloons.length < kinds.length && guard++ < 320) {
    const useLate = bloons.length === 0 || Math.random() < 0.65;
    const a = useLate ? Math.max(lo, firstBounce) : lo;
    const p = path[randInt(a, hi)];
    if (!p) continue;
    if (bloons.length === 0 && !bloonOk(p)) continue;
    const kind = kinds[bloons.length]!;
    const b = makeBloon(
      p.x + rand(-10, 10),
      p.y + rand(-10, 10),
      kind,
      round,
    );
    if (
      !clearOf(
        b,
        [{ x: sniper.x, y: sniper.y, r: 34 }, ...bloons],
        walls,
        14,
      )
    ) {
      continue;
    }
    const crowded = bloons.some((o) => {
      // Later rounds spread out so one bomb splash can't erase the pack.
      const need = o.r + b.r + (round >= 5 ? 16 : round >= 4 ? 12 : 10);
      return dist2(o, b) < need * need;
    });
    if (crowded) continue;
    bloons.push(b);
  }
  const minNeed = Math.max(5, Math.ceil(kinds.length * 0.65));
  return bloons.length >= minNeed ? bloons : null;
}

export function generateRicoLevel(round: number): RicoLevel {
  const difficulty = Math.min(4, Math.max(0, round - 1));
  const count = bloonCountForRound(round);
  const kinds = kindsForRound(round, count);
  const layouts = makeLayouts(difficulty);
  const start = (round * 5 + randInt(0, layouts.length - 1)) % layouts.length;
  const sniper = sniperHome();

  // Keep this bounded — Next runs on the main thread.
  const maxAttempts = round >= 4 ? 40 : 64;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const layout = layouts[(start + attempt) % layouts.length]!;
    const walls = wallsFromRects(layout.walls, steelCountForRound(round));
    const minBounces = Math.max(1, layout.minBounces);

    for (let aimTry = 0; aimTry < 4; aimTry++) {
      const angle = rand(layout.aimLo, layout.aimHi);
      const ghost = traceShot(emptyGhost(walls, sniper), angle, {
        maxTime: 4.8,
        ghost: true,
        recordEvery: 2,
      });
      if (ghost.bounces < minBounces || ghost.points.length < 36) continue;

      const firstBounce =
        ghost.bounceAt[Math.max(0, minBounces - 1)] ??
        Math.floor(ghost.points.length * 0.35);

      const bloons = placeBloonsOnPath(
        ghost.points,
        firstBounce,
        walls,
        sniper,
        kinds,
        layout.bloonOk,
        round,
      );
      if (!bloons) continue;

      const level: RicoLevel = {
        walls: cloneWalls(walls),
        sniper,
        bloons,
        solutionAngle: angle,
        minBounces,
      };

      const probe = traceShot(level, angle, { maxTime: 5.2, recordEvery: 2 });
      const needHits = Math.max(
        2,
        Math.ceil(bloons.length * (bloons.length >= 12 ? 0.28 : 0.4)),
      );
      if (probe.bloonHits.length < needHits) continue;
      if (probe.bounces < minBounces) continue;
      if (!cheatsBlocked(level)) continue;
      // Late stages: skip expensive full-clear proof once we have a solid probe.
      if (round <= 3 && !clearableInShots(level, angle)) continue;

      return level;
    }
  }

  return fallbackLevel(round, kinds);
}

function fallbackLevel(round: number, kinds: BloonKind[]): RicoLevel {
  const sniper = sniperHome();
  const mid = RICO_W * 0.5;
  const openLeft = round % 2 === 0;
  const roofY = 300;
  const walls = wallsFromRects(
    openLeft
      ? [
          { x: 90, y: roofY, w: RICO_W - 108, h: 30 },
          { x: RICO_W - 42, y: 80, w: 28, h: 240 },
          { x: mid - 70, y: RICO_H - 140, w: 140, h: 20 },
        ]
      : [
          { x: 18, y: roofY, w: RICO_W - 108, h: 30 },
          { x: 14, y: 80, w: 28, h: 240 },
          { x: mid - 70, y: RICO_H - 140, w: 140, h: 20 },
        ],
    steelCountForRound(round),
  );

  for (let n = 0; n < 18; n++) {
    const angle = openLeft
      ? rand(-Math.PI + 0.3, -Math.PI / 2 - 0.25)
      : rand(-Math.PI / 2 + 0.25, -0.3);
    const ghost = traceShot(emptyGhost(walls, sniper), angle, {
      maxTime: 4.5,
      ghost: true,
      recordEvery: 2,
    });
    if (ghost.bounces < 1) continue;
    const bloons = placeBloonsOnPath(
      ghost.points,
      ghost.bounceAt[0] ?? 40,
      walls,
      sniper,
      kinds,
      (p) => p.y < roofY - 24,
      round,
    );
    if (!bloons) continue;
    const level: RicoLevel = {
      walls: cloneWalls(walls),
      sniper,
      bloons,
      solutionAngle: angle,
      minBounces: 1,
    };
    if (cheatsBlocked(level)) return level;
  }

  // Absolute last resort — still a juicy pack of bloons
  return {
    walls,
    sniper,
    bloons: kinds.map((k, i) => {
      const col = i % 4;
      const row = Math.floor(i / 4);
      return makeBloon(
        mid + (openLeft ? 28 : -28) + (col - 1.5) * 36,
        95 + row * 40,
        k,
        round,
      );
    }),
    solutionAngle: openLeft ? -Math.PI + 0.7 : -0.55,
    minBounces: 1,
  };
}

export function angleToward(from: Vec, to: Vec): number {
  return Math.atan2(to.y - from.y, to.x - from.x);
}

export { cloneBloons };
