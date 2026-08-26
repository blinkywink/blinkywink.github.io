import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { GameHeader } from "../../components/GameHeader";
import { CashAmount } from "../../components/CurrencyChip";
import { LivesMeter } from "../../components/LivesMeter";
import {
  BLOON_IMGS,
  BLOON_LADDER,
  BLOON_R,
  bloonPosAt,
  DART_IMG,
  DART_DRAW_R,
  FLIGHT_PLAYBACK_RATE,
  isBossBloon,
  kindFromHp,
  MOAB_DRAW_ROT,
  RICO_H,
  RICO_W,
  SNIPER_R,
  type BloonKind,
  type RicoWall,
} from "./config";
import { shooterDef } from "./shooters";
import { useRicoShot } from "./useRicoShot";
import {
  playRicoFire,
  playRicoPop,
  playRicoShatter,
  warmRicoSfx,
} from "./sfx";

type Props = {
  onBack: () => void;
  onRunEnd?: (info: {
    cleared: boolean;
    coinsEarned: number;
    solves: number;
    perfect: boolean;
  }) => void;
};

type ShooterTip = {
  shooterId: string;
  name: string;
  tier: number;
  blurb: string;
  /** Anchor center-x / top of the shooter button (viewport px). */
  x: number;
  y: number;
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  r: number;
  color: string;
};

const PEEL_COLOR: Record<BloonKind, string> = {
  red: "#ff5a5a",
  blue: "#5a9fff",
  green: "#6fd99a",
  yellow: "#ffe566",
  pink: "#ff7ab8",
  black: "#3a3a44",
  white: "#f0f0f4",
  purple: "#b07cff",
  zebra: "#d8d0c0",
  lead: "#8a96a8",
  rainbow: "#ff9a4a",
  ceramic: "#c4a06a",
  moab: "#4a7cff",
};

function drawImg(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | null,
  x: number,
  y: number,
  r: number,
  opts?: { alpha?: number; scale?: number; angle?: number },
) {
  const alpha = opts?.alpha ?? 1;
  const scale = opts?.scale ?? 1;
  const angle = opts?.angle;
  const fit = r * 2 * scale;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  if (angle != null) ctx.rotate(angle);
  if (img && img.complete && img.naturalWidth > 0) {
    const aspect = img.naturalWidth / img.naturalHeight;
    let dw: number;
    let dh: number;
    // Contain in a fit×fit box so tall bloons stay tall (not squashed square)
    if (aspect >= 1) {
      dw = fit;
      dh = fit / aspect;
    } else {
      dh = fit;
      dw = fit * aspect;
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
  } else {
    ctx.beginPath();
    ctx.arc(0, 0, fit / 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function burst(
  into: Particle[],
  x: number,
  y: number,
  color: string,
  count: number,
  speed: number,
  opts?: { rScale?: number },
) {
  const n = Math.max(0, Math.floor(count));
  if (n <= 0) return;
  const rScale = opts?.rScale ?? 1;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = speed * (0.45 + Math.random());
    into.push({
      x,
      y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      life: 1,
      max: 0.35 + Math.random() * 0.3,
      r: (3 + Math.random() * 5) * rScale,
      color,
    });
  }
  // Hard cap - big T5 volleys used to spawn hundreds and hitch.
  if (into.length > 90) into.splice(0, into.length - 90);
}

/** Particle / trail / shake scale by ninja tier (0-5). */
function fxScale(tier: number) {
  const t = Math.max(0, Math.min(5, tier));
  return {
    mul: 0.28 + t * 0.12, // 0.28 … 0.88
    trail: 4 + t * 2, // 4 … 14
    glow: t >= 4,
    rScale: 0.65 + t * 0.07,
  };
}

function drawCracks(ctx: CanvasRenderingContext2D, w: RicoWall) {
  const dmg = w.maxHp - w.hp;
  if (dmg <= 0) return;
  const { x, y, w: ww, h: hh } = w;
  ctx.strokeStyle = "rgba(30, 16, 4, 0.7)";
  ctx.lineWidth = 1.6;
  ctx.lineCap = "round";
  const lines = dmg >= 2 ? 4 : 2;
  for (let i = 0; i < lines; i++) {
    const t = (i + 1) / (lines + 1);
    ctx.beginPath();
    if (ww >= hh) {
      const px = x + ww * t;
      ctx.moveTo(px + (i % 2 ? -4 : 4), y + 3);
      ctx.lineTo(px + (i % 2 ? 6 : -5), y + hh - 3);
      if (dmg >= 2) {
        ctx.moveTo(px - 8, y + hh * 0.45);
        ctx.lineTo(px + 10, y + hh * 0.55);
      }
    } else {
      const py = y + hh * t;
      ctx.moveTo(x + 3, py + (i % 2 ? -3 : 3));
      ctx.lineTo(x + ww - 3, py + (i % 2 ? 5 : -4));
      if (dmg >= 2) {
        ctx.moveTo(x + ww * 0.4, py - 7);
        ctx.lineTo(x + ww * 0.6, py + 8);
      }
    }
    ctx.stroke();
  }
  if (dmg >= 2) {
    ctx.fillStyle = "rgba(20, 10, 0, 0.18)";
    ctx.fillRect(x, y, ww, hh);
  }
}

function drawWallBody(ctx: CanvasRenderingContext2D, w: RicoWall) {
  if (w.hp <= 0) return;
  const steel = !!w.indestructible;
  const wg = ctx.createLinearGradient(w.x, w.y, w.x, w.y + w.h);
  if (steel) {
    wg.addColorStop(0, "#c8ced8");
    wg.addColorStop(0.4, "#7a8494");
    wg.addColorStop(1, "#3a4250");
  } else {
    wg.addColorStop(0, "#d4b484");
    wg.addColorStop(0.4, "#9a7120");
    wg.addColorStop(1, "#5a3c0e");
  }
  ctx.fillStyle = wg;
  ctx.beginPath();
  const rr = 7;
  const { x, y } = w;
  const ww = w.w;
  const hh = w.h;
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + ww, y, x + ww, y + hh, rr);
  ctx.arcTo(x + ww, y + hh, x, y + hh, rr);
  ctx.arcTo(x, y + hh, x, y, rr);
  ctx.arcTo(x, y, x + ww, y, rr);
  ctx.closePath();
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + ww, y, x + ww, y + hh, rr);
  ctx.arcTo(x + ww, y + hh, x, y + hh, rr);
  ctx.arcTo(x, y + hh, x, y, rr);
  ctx.arcTo(x, y, x + ww, y, rr);
  ctx.closePath();
  ctx.clip();
  ctx.strokeStyle = steel
    ? "rgba(20, 28, 40, 0.28)"
    : "rgba(40, 24, 8, 0.22)";
  ctx.lineWidth = 1;
  if (ww >= hh) {
    for (let yy = y + 10; yy < y + hh - 4; yy += 11) {
      ctx.beginPath();
      ctx.moveTo(x + 2, yy);
      ctx.lineTo(x + ww - 2, yy);
      ctx.stroke();
    }
  } else {
    for (let xx = x + 10; xx < x + ww - 4; xx += 12) {
      ctx.beginPath();
      ctx.moveTo(xx, y + 2);
      ctx.lineTo(xx, y + hh - 2);
      ctx.stroke();
    }
  }
  // Steel rivets
  if (steel) {
    ctx.fillStyle = "rgba(220, 230, 240, 0.55)";
    const step = 16;
    for (let yy = y + 8; yy < y + hh - 4; yy += step) {
      for (let xx = x + 8; xx < x + ww - 4; xx += step) {
        ctx.beginPath();
        ctx.arc(xx, yy, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.restore();
  ctx.fillStyle = steel
    ? "rgba(230, 238, 248, 0.45)"
    : "rgba(255, 236, 180, 0.4)";
  ctx.fillRect(x + 3, y + 2, Math.max(0, ww - 6), 4);
  if (!steel || w.hp < w.maxHp) drawCracks(ctx, w);
  ctx.strokeStyle = steel
    ? "rgba(20, 28, 40, 0.65)"
    : "rgba(40, 24, 8, 0.5)";
  ctx.lineWidth = steel ? 2 : 1.5;
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + ww, y, x + ww, y + hh, rr);
  ctx.arcTo(x + ww, y + hh, x, y + hh, rr);
  ctx.arcTo(x, y + hh, x, y, rr);
  ctx.arcTo(x, y, x + ww, y, rr);
  ctx.closePath();
  ctx.stroke();
}

export function RicoShotGame({ onBack: _onBack, onRunEnd }: Props) {
  const {
    state,
    maxRounds,
    maxLives,
    selectShooter,
    setAimFromPoint,
    fire,
    advanceFlight,
    continueRun,
    playAgain,
  } = useRicoShot();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [assetsTick, setAssetsTick] = useState(0);
  const [tip, setTip] = useState<ShooterTip | null>(null);

  const showShooterTip = (
    shooterId: string,
    el: HTMLElement,
    def: { name: string; tier: number; blurb: string },
  ) => {
    const r = el.getBoundingClientRect();
    setTip({
      shooterId,
      name: def.name,
      tier: def.tier,
      blurb: def.blurb,
      x: r.left + r.width * 0.5,
      y: r.top,
    });
  };

  const hideShooterTip = () => setTip(null);

  const toggleShooterTip = (
    shooterId: string,
    el: HTMLElement,
    def: { name: string; tier: number; blurb: string },
  ) => {
    if (tip?.shooterId === shooterId) {
      hideShooterTip();
      return;
    }
    showShooterTip(shooterId, el, def);
  };
  const imgs = useRef<{
    bloon: Record<BloonKind, HTMLImageElement>;
    dart: HTMLImageElement;
  } | null>(null);
  const towerImg = useRef<HTMLImageElement | null>(null);
  const particles = useRef<Particle[]>([]);
  const flash = useRef(0);
  const shake = useRef(0);
  const flightIdx = useRef(0);
  const flightDone = useRef(false);
  const firedBounces = useRef(new Set<string>());
  const firedBloonHits = useRef(new Set<number>());
  const firedWallHits = useRef(new Set<number>());
  const firedExplodes = useRef(new Set<number>());
  /** Live HP during flight for drawing peels mid-shot. */
  const drawBloons = useRef(state.bloons.map((b) => ({ ...b })));
  const drawWalls = useRef(state.walls.map((w) => ({ ...w })));
  const swayClock = useRef(performance.now() / 1000);
  const stateRef = useRef(state);
  stateRef.current = state;
  const advanceRef = useRef(advanceFlight);
  advanceRef.current = advanceFlight;
  const prevStatus = useRef(state.status);

  const aiming = state.status === "aiming";
  const puzzleDone =
    state.status === "won_puzzle" || state.status === "lost_puzzle";
  const runOver = state.status === "won_run" || state.status === "lost_run";

  useEffect(() => {
    if (!aiming) hideShooterTip();
  }, [aiming]);

  useEffect(() => {
    warmRicoSfx();
  }, []);

  useEffect(() => {
    const bloon = {} as Record<BloonKind, HTMLImageElement>;
    const dart = new Image();
    const bump = () => setAssetsTick((n) => n + 1);
    for (const k of BLOON_LADDER) {
      bloon[k] = new Image();
      bloon[k].onload = bump;
      bloon[k].src = BLOON_IMGS[k];
    }
    dart.onload = bump;
    dart.src = DART_IMG;
    imgs.current = { bloon, dart };
  }, []);

  useEffect(() => {
    const img = new Image();
    img.onload = () => setAssetsTick((n) => n + 1);
    img.src = shooterDef(state.selectedId).icon;
    towerImg.current = img;
  }, [state.selectedId]);

  useEffect(() => {
    const was = prevStatus.current;
    prevStatus.current = state.status;
    if (was === "won_run" || was === "lost_run") return;
    if (state.status === "won_run" || state.status === "lost_run") {
      onRunEnd?.({
        cleared: state.status === "won_run",
        coinsEarned: state.reward,
        solves: state.solves,
        perfect: state.status === "won_run" && state.perfect,
      });
    }
  }, [state.status, state.reward, state.solves, state.perfect, onRunEnd]);

  const flightKeyRef = useRef("");
  const flightAccRef = useRef(0);
  useEffect(() => {
    drawBloons.current = state.bloons.map((b) => ({ ...b }));
    drawWalls.current = state.walls.map((w) => ({ ...w }));

    if (state.status === "aiming") {
      flightIdx.current = 0;
      flightDone.current = false;
      flightKeyRef.current = "";
      flightAccRef.current = 0;
      return;
    }

    if (state.status === "flying" && state.flight) {
      const key = `${state.flight.shooterId}:${state.flight.swayT0}:${state.flight.darts[0]?.points.length ?? 0}`;
      if (key !== flightKeyRef.current) {
        flightKeyRef.current = key;
        flightIdx.current = 0;
        flightDone.current = false;
        flightAccRef.current = 0;
        firedBounces.current.clear();
        firedBloonHits.current.clear();
        firedWallHits.current.clear();
        firedExplodes.current.clear();
      }
    }
  }, [state.status, state.bloons, state.walls, state.level, state.flight]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();

    const paint = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const s = stateRef.current;
      const rect = canvas.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) return;
      // Backing store matches on-screen pixels so tower/bloon sprites stay sharp
      // Cap DPR on phones to cut GPU fill-rate / heat (looks the same on 3x panels).
      const dprCap = window.matchMedia("(max-width: 820px)").matches ? 2 : 3;
      const dpr = Math.min(dprCap, window.devicePixelRatio || 1);
      const pw = Math.max(1, Math.round(rect.width * dpr));
      const ph = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== pw || canvas.height !== ph) {
        canvas.width = pw;
        canvas.height = ph;
      }
      ctx.setTransform(pw / RICO_W, 0, 0, ph / RICO_H, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";

      const shx = (Math.random() - 0.5) * shake.current;
      const shy = (Math.random() - 0.5) * shake.current;
      ctx.save();
      ctx.translate(shx, shy);

      // Meadow CSS layer shows through
      ctx.clearRect(-4, -4, RICO_W + 8, RICO_H + 8);

      for (const w of drawWalls.current) {
        drawWallBody(ctx, w);
      }

      if (s.status === "aiming") {
        const def = shooterDef(s.selectedId);
        const angles: number[] = [];
        if (def.projectiles <= 1) angles.push(s.aimAngle);
        else {
          const mid = (def.projectiles - 1) / 2;
          for (let i = 0; i < def.projectiles; i++) {
            angles.push(s.aimAngle + (i - mid) * def.spread);
          }
        }
        for (const ang of angles) {
          const toX = s.level.sniper.x + Math.cos(ang) * 110;
          const toY = s.level.sniper.y + Math.sin(ang) * 110;
          ctx.save();
          ctx.strokeStyle = "rgba(255, 220, 80, 0.9)";
          ctx.lineWidth = 3;
          ctx.setLineDash([7, 9]);
          ctx.lineCap = "round";
          ctx.shadowColor = "rgba(255, 200, 40, 0.45)";
          ctx.shadowBlur = 6;
          ctx.beginPath();
          ctx.moveTo(
            s.level.sniper.x + Math.cos(ang) * 28,
            s.level.sniper.y + Math.sin(ang) * 28,
          );
          ctx.lineTo(toX, toY);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.shadowBlur = 0;
          ctx.fillStyle = "#ffe566";
          ctx.beginPath();
          ctx.arc(toX, toY, 5.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }

      const pack = imgs.current;
      // During flight, sway follows the shot timeline (not wall-clock) so
      // bloons keep moving but stay lined up with the baked path / hits.
      const recordEvery = 2;
      const swayT =
        s.status === "flying" && s.flight
          ? s.flight.swayT0 + (flightIdx.current * recordEvery) / 120
          : swayClock.current;
      for (const b of drawBloons.current) {
        if (b.hp <= 0) continue;
        const kind = b.kind;
        const br = b.r || BLOON_R;
        const p = bloonPosAt(b, swayT);
        const boss = isBossBloon(kind);
        if (!boss) {
          ctx.fillStyle = "rgba(0,0,0,0.22)";
          ctx.beginPath();
          ctx.ellipse(
            p.x,
            p.y + br * 0.72,
            br * 0.55,
            Math.max(6, br * 0.22),
            0,
            0,
            Math.PI * 2,
          );
          ctx.fill();
        }
        ctx.fillStyle = PEEL_COLOR[kind];
        drawImg(ctx, pack?.bloon[kind] ?? null, p.x, p.y, br, {
          angle: boss ? MOAB_DRAW_ROT : undefined,
        });
      }

      const sn = s.level.sniper;
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.beginPath();
      ctx.ellipse(sn.x, sn.y + SNIPER_R - 2, SNIPER_R * 0.95, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      drawImg(ctx, towerImg.current, sn.x, sn.y, SNIPER_R);

      if (s.status === "flying" && s.flight) {
        const def = shooterDef(s.flight.shooterId);
        const fx = fxScale(def.tier);
        const idx = flightIdx.current;
        for (const dart of s.flight.darts) {
          const pts = dart.points;
          if (!pts.length) continue;
          const di = Math.min(idx, pts.length - 1);
          ctx.save();
          ctx.strokeStyle = `${def.projectileColor}${fx.glow ? "99" : "66"}`;
          ctx.lineWidth = 2.5 + def.tier * 0.25;
          ctx.lineCap = "round";
          if (fx.glow) {
            ctx.shadowColor = def.projectileColor;
            ctx.shadowBlur = 4;
          }
          ctx.beginPath();
          const trailStart = Math.max(0, di - fx.trail);
          for (let i = trailStart; i <= di; i++) {
            const p = pts[i]!;
            if (i === trailStart) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
          }
          ctx.stroke();
          ctx.restore();
          const p = pts[di];
          if (p) {
            drawImg(ctx, pack?.dart ?? null, p.x, p.y, DART_DRAW_R, {
              angle: di * 0.35,
            });
          }
        }
      }

      for (const p of particles.current) {
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      if (flash.current > 0) {
        ctx.fillStyle = `rgba(255,236,150,${flash.current * 0.4})`;
        ctx.fillRect(0, 0, RICO_W, RICO_H);
      }
      ctx.restore();
    };

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      swayClock.current = now / 1000;
      const s = stateRef.current;

      if (s.status === "flying" && s.flight) {
        const maxLen = Math.max(
          1,
          ...s.flight.darts.map((d) => d.points.length),
        );
        // Ignore huge frame gaps so a hitch doesn't dump a backlog of steps.
        flightAccRef.current += Math.min(dt, 1 / 45);
        let steps = 0;
        while (flightAccRef.current >= 1 / 60 && steps < 2) {
          flightAccRef.current -= 1 / 60;
          steps += 1;
          if (flightIdx.current >= maxLen - 1) break;

          const from = flightIdx.current;
          flightIdx.current = Math.min(
            maxLen - 1,
            flightIdx.current + FLIGHT_PLAYBACK_RATE,
          );

          s.flight.darts.forEach((dart, di) => {
            for (const bi of dart.bounceAt) {
              const key = `${di}:${bi}`;
              if (
                bi > from &&
                bi <= flightIdx.current &&
                !firedBounces.current.has(key)
              ) {
                firedBounces.current.add(key);
                const p =
                  dart.points[Math.min(bi, dart.points.length - 1)];
                if (p) {
                  const fx = fxScale(shooterDef(s.flight!.shooterId).tier);
                  burst(
                    particles.current,
                    p.x,
                    p.y,
                    "#f0c84a",
                    Math.round(3 * fx.mul),
                    100,
                    { rScale: fx.rScale },
                  );
                  shake.current = Math.max(shake.current, 0.4 * fx.mul);
                }
              }
            }
          });

          const shotFx = fxScale(shooterDef(s.flight.shooterId).tier);

          for (let hi = 0; hi < s.flight.wallHits.length; hi++) {
            const hit = s.flight.wallHits[hi]!;
            if (
              hit.at <= from ||
              hit.at > flightIdx.current ||
              firedWallHits.current.has(hi)
            ) {
              continue;
            }
            firedWallHits.current.add(hi);
            if (drawWalls.current[hit.index]) {
              drawWalls.current[hit.index] = {
                ...drawWalls.current[hit.index]!,
                hp: hit.hpAfter,
              };
            }
            burst(
              particles.current,
              hit.pos.x,
              hit.pos.y,
              hit.shattered ? "#c4a574" : "#8b6914",
              Math.round((hit.shattered ? 12 : 5) * shotFx.mul),
              hit.shattered ? 180 : 90,
              { rScale: shotFx.rScale },
            );
            if (hit.shattered) {
              burst(
                particles.current,
                hit.pos.x,
                hit.pos.y,
                "#5a3c0e",
                Math.round(6 * shotFx.mul),
                140,
                { rScale: shotFx.rScale },
              );
              shake.current = Math.max(shake.current, 1.6 * shotFx.mul);
              flash.current = Math.max(flash.current, 0.1 * shotFx.mul);
              playRicoShatter();
            } else {
              shake.current = Math.max(shake.current, 0.7 * shotFx.mul);
            }
          }

          for (let hi = 0; hi < s.flight.bloonHits.length; hi++) {
            const hit = s.flight.bloonHits[hi]!;
            if (
              hit.at <= from ||
              hit.at > flightIdx.current ||
              firedBloonHits.current.has(hi)
            ) {
              continue;
            }
            firedBloonHits.current.add(hi);
            const before = drawBloons.current[hit.index];
            const color = before ? PEEL_COLOR[before.kind] : PEEL_COLOR.red;
            const popped = hit.hpAfter <= 0;
            if (drawBloons.current[hit.index]) {
              drawBloons.current[hit.index] = {
                ...drawBloons.current[hit.index]!,
                hp: hit.hpAfter,
                kind: kindFromHp(Math.max(1, hit.hpAfter), before?.kind),
              };
            }
            burst(
              particles.current,
              hit.pos.x,
              hit.pos.y,
              color,
              Math.round((popped ? 12 : 5) * shotFx.mul),
              popped ? 200 : 130,
              { rScale: shotFx.rScale },
            );
            if (popped || shotFx.mul > 0.5) {
              burst(
                particles.current,
                hit.pos.x,
                hit.pos.y,
                "#ffd35a",
                Math.round((popped ? 5 : 2) * shotFx.mul),
                popped ? 160 : 100,
                { rScale: shotFx.rScale },
              );
            }
            flash.current = Math.max(
              flash.current,
              (popped ? 0.16 : 0.06) * shotFx.mul,
            );
            shake.current = Math.max(
              shake.current,
              (popped ? 1.8 : 0.7) * shotFx.mul,
            );
            playRicoPop(popped ? 1 : 0.65);
          }

          for (let ei = 0; ei < s.flight.explodeAt.length; ei++) {
            const ex = s.flight.explodeAt[ei]!;
            if (
              ex.at <= from ||
              ex.at > flightIdx.current ||
              firedExplodes.current.has(ei)
            ) {
              continue;
            }
            firedExplodes.current.add(ei);
            burst(
              particles.current,
              ex.pos.x,
              ex.pos.y,
              "#ff7a3a",
              Math.round(14 * shotFx.mul),
              220,
              { rScale: shotFx.rScale },
            );
            burst(
              particles.current,
              ex.pos.x,
              ex.pos.y,
              "#ffe566",
              Math.round(7 * shotFx.mul),
              160,
              { rScale: shotFx.rScale },
            );
            flash.current = Math.max(flash.current, 0.22 * shotFx.mul);
            shake.current = Math.max(shake.current, 2 * shotFx.mul);
            if (shotFx.mul > 0.55) playRicoShatter();
          }
        }

        if (flightIdx.current >= maxLen - 1 && !flightDone.current) {
          flightDone.current = true;
          // Paint the final frame first so the end doesn't hitch/skip.
          requestAnimationFrame(() => {
            advanceRef.current();
          });
        }
      } else {
        flightAccRef.current = 0;
      }

      for (const p of particles.current) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 480 * dt;
        p.life -= dt / p.max;
      }
      particles.current = particles.current.filter((p) => p.life > 0);
      flash.current = Math.max(0, flash.current - dt * 1.8);
      shake.current = Math.max(0, shake.current - dt * 48);

      paint();
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [assetsTick]);

  function toLocal(clientX: number, clientY: number) {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * RICO_W,
      y: ((clientY - rect.top) / rect.height) * RICO_H,
    };
  }

  return (
    <div className={`rico-page${runOver ? " is-done" : ""}`}>
      <GameHeader
        title="HELIUM POP"
        icon=""
        round={Math.min(state.round, maxRounds)}
        roundsPerRun={maxRounds}
      />

      <main className="rico-main">
        <div className="rico-board-slot">
          <div
            className="rico-stage"
            onPointerDown={(e) => {
              if ((e.target as HTMLElement).closest(".rico-shooter")) return;
              hideShooterTip();
              if (!aiming) return;
              (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
              const p = toLocal(e.clientX, e.clientY);
              if (p) setAimFromPoint(p.x, p.y);
            }}
            onPointerMove={(e) => {
              if (!aiming || e.buttons === 0) return;
              const p = toLocal(e.clientX, e.clientY);
              if (p) setAimFromPoint(p.x, p.y);
            }}
          >
            <div className="catch-field__sky" aria-hidden="true" />
            <canvas ref={canvasRef} className="rico-canvas" />
            <div className="rico-hud">
              <LivesMeter
                maxAttempts={maxLives}
                attemptsUsed={maxLives - state.lives}
              />
              <p className="rico-hud__solves">
                Clears{" "}
                <strong>
                  {state.solves}/{maxRounds}
                </strong>
              </p>
              {state.reward > 0 ? (
                <p className="rico-hud__cash">
                  <CashAmount amount={state.reward} size={18} />
                </p>
              ) : null}
            </div>

            {puzzleDone ? (
              <div className="rico-result rico-result--overlay">
                <p
                  className={`rico-result__status${state.status === "won_puzzle" ? " is-win" : " is-miss"}`}
                >
                  {state.status === "won_puzzle" ? "Stage clear!" : "Out of shots"}
                </p>
              </div>
            ) : null}

            {runOver ? (
              <div className="rico-result rico-result--overlay">
                <p
                  className={`rico-result__status${state.status === "won_run" ? " is-win" : " is-miss"}`}
                >
                  {state.status === "won_run"
                    ? state.perfect
                      ? "Perfect clear!"
                      : "Cleared"
                    : "Out of lives"}
                </p>
                {state.reward > 0 ? (
                  <p className="rico-result__cash">
                    <CashAmount amount={state.reward} size={28} />
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <div className="rico-loadout">
          {state.loadout.map((slot, i) => {
            const def = shooterDef(slot.id);
            const firing =
              state.status === "flying" &&
              state.flight?.shooterId === slot.id;
            const selected =
              firing ||
              (aiming && state.selectedId === slot.id && !slot.used);
            // Stay lit while this ninja's projectiles are still in the air.
            const spent = slot.used && !firing;
            return (
              <button
                key={`${slot.id}-${i}`}
                type="button"
                className={`rico-shooter${selected ? " is-selected" : ""}${spent ? " is-used" : ""}${firing ? " is-firing" : ""}`}
                disabled={!aiming || slot.used}
                onClick={(e) => {
                  selectShooter(slot.id);
                  toggleShooterTip(slot.id, e.currentTarget, def);
                }}
                onPointerEnter={(e) => {
                  if (e.pointerType === "touch") return;
                  showShooterTip(slot.id, e.currentTarget, def);
                }}
                onPointerLeave={(e) => {
                  if (e.pointerType === "touch") return;
                  hideShooterTip();
                }}
                onFocus={(e) => {
                  if (window.matchMedia("(hover: none)").matches) return;
                  showShooterTip(slot.id, e.currentTarget, def);
                }}
                onBlur={hideShooterTip}
                aria-label={`${def.name}. ${def.blurb}`}
              >
                <img src={def.icon} alt="" width={44} height={44} />
                <span className="rico-shooter__name">{def.name}</span>
                <span className="rico-shooter__tier">T{def.tier}</span>
              </button>
            );
          })}
          {puzzleDone ? (
            <button
              type="button"
              className="rico-fire"
              onClick={() => continueRun()}
            >
              Next
            </button>
          ) : runOver ? (
            <button
              type="button"
              className="rico-fire"
              onClick={() => playAgain()}
            >
              Again
            </button>
          ) : (
            <button
              type="button"
              className="rico-fire"
              disabled={!aiming || !state.loadout.some((s) => !s.used)}
              onClick={() => {
                hideShooterTip();
                playRicoFire();
                fire();
              }}
            >
              Fire
            </button>
          )}
        </div>
      </main>

      {tip
        ? createPortal(
            <div
              className="rico-float-tip"
              role="tooltip"
              style={
                {
                  ["--tip-x"]: `${tip.x}px`,
                  ["--tip-y"]: `${tip.y}px`,
                } as CSSProperties
              }
            >
              <strong>{tip.name}</strong>
              <em>T{tip.tier}</em>
              <span>{tip.blurb}</span>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
