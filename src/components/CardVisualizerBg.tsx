import { useEffect, useRef } from "react";
import { hashSeed, mulberry32 } from "../lib/cardSeed";

type Props = {
  seed: string;
  colors: string[];
  /** Soft motion - focus cards only. */
  animated?: boolean;
  /** Paragon backgrounds go denser / more chromatic than T5. */
  intensity?: "standard" | "paragon" | "paragon-apex";
  className?: string;
};

type PrimaryMode =
  | "nebula"
  | "radialBurst"
  | "waveRibbon"
  | "shardField"
  | "orbitRings"
  | "lattice"
  | "plasmaCells"
  | "cometTrails"
  | "vortex"
  | "drizzle"
  | "chevrons"
  | "starfield"
  | "moire";

type AccentLayer =
  | "orbs"
  | "sparks"
  | "softRings"
  | "softRays"
  | "softShards"
  | "ripples"
  | "scanlines"
  | "noise";

function pickColor(palette: string[], rand: () => number) {
  if (!palette.length) return "#2f9fe0";
  return palette[Math.floor(rand() * palette.length)]!;
}

function parseHex(hex: string): [number, number, number] {
  if (!hex || typeof hex !== "string") return [47, 159, 224];
  const h = hex.replace("#", "");
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  const n = Number.parseInt(full, 16);
  if (!Number.isFinite(n)) return [47, 159, 224];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgba(hex: string, a: number) {
  const [r, g, b] = parseHex(hex);
  return `rgba(${r},${g},${b},${a})`;
}

function darken(hex: string, amount: number): string {
  const [r, g, b] = parseHex(hex);
  const f = 1 - amount;
  return `rgb(${Math.round(r * f)},${Math.round(g * f)},${Math.round(b * f)})`;
}

function clampByte(n: number) {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b].map((v) => clampByte(v).toString(16).padStart(2, "0")).join("")}`;
}

function shiftHue(hex: string, deg: number): string {
  const [r0, g0, b0] = parseHex(hex);
  const r = r0 / 255;
  const g = g0 / 255;
  const b = b0 / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  const l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  h = (h + deg + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * Math.min(1, s * 1.15);
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let rr = 0;
  let gg = 0;
  let bb = 0;
  if (h < 60) [rr, gg, bb] = [c, x, 0];
  else if (h < 120) [rr, gg, bb] = [x, c, 0];
  else if (h < 180) [rr, gg, bb] = [0, c, x];
  else if (h < 240) [rr, gg, bb] = [0, x, c];
  else if (h < 300) [rr, gg, bb] = [x, 0, c];
  else [rr, gg, bb] = [c, 0, x];
  return rgbToHex((rr + m) * 255, (gg + m) * 255, (bb + m) * 255);
}

/** Widen palette - paragons stay on the wiki icon blues / neon violets. */
function buildPalette(
  colors: string[],
  rand: () => number,
  crazy: boolean,
): string[] {
  if (crazy) {
    const emblem = [
      "#0f7dfe",
      "#b401fe",
      "#7d01fe",
      "#3400fe",
      "#10388f",
      "#0f205c",
      "#5ef0ff",
      "#e9d5ff",
      "#140247",
    ];
    const base = colors.length >= 2 ? colors : emblem;
    const shifted = base.slice(0, 4).flatMap((c) => [
      shiftHue(c, 10 + rand() * 14),
      shiftHue(c, -12 - rand() * 12),
    ]);
    const picks = emblem.filter(() => rand() > 0.2);
    return [...new Set([...emblem, ...base, ...shifted, ...picks])];
  }

  const base =
    colors.length >= 2
      ? [...colors]
      : ["#2f9fe0", "#c8c8d4", "#7cf0c0", "#ff6b9d"];
  const extras = base.slice(0, 2).flatMap((c) => [
    shiftHue(c, 28 + rand() * 18),
    shiftHue(c, -24 - rand() * 16),
  ]);
  return [...base, ...extras].slice(0, 6);
}

const PRIMARIES: PrimaryMode[] = [
  "nebula",
  "radialBurst",
  "waveRibbon",
  "shardField",
  "orbitRings",
  "lattice",
  "plasmaCells",
  "cometTrails",
  "vortex",
  "drizzle",
  "chevrons",
  "starfield",
  "moire",
];

const ACCENTS: AccentLayer[] = [
  "orbs",
  "sparks",
  "softRings",
  "softRays",
  "softShards",
  "ripples",
  "scanlines",
  "noise",
];

/** Seeded abstract multi-color backdrop - composition unique per card id. */
export function CardVisualizerBg({
  seed,
  colors,
  animated = false,
  intensity = "standard",
  className = "monkey-card__visualizer",
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const crazy = intensity === "paragon" || intensity === "paragon-apex";
    const rng = mulberry32(hashSeed(`${seed}::bg::${intensity}`));
    const rand = () => rng();
    // Paragons only expand the color range - same layout density as T5
    const palette = buildPalette(colors, rand, crazy);

    // Crossbow Master avoids the busiest particle motifs
    let modePool = [...PRIMARIES];
    if (seed === "dart-monkey-35") {
      modePool = modePool.filter(
        (m) =>
          m !== "shardField" &&
          m !== "starfield" &&
          m !== "lattice" &&
          m !== "plasmaCells",
      );
    }
    const mode = modePool[Math.floor(rand() * modePool.length)]!;
    const isMode = (m: PrimaryMode) => m === mode;

    const accentCount =
      seed === "dart-monkey-35"
        ? 1 + Math.floor(rand() * 2)
        : intensity === "paragon-apex"
          ? 3 + Math.floor(rand() * 2)
          : 1 + Math.floor(rand() * 3);
    const accentPool = [...ACCENTS];
    const accents: AccentLayer[] = [];
    for (let i = 0; i < accentCount && accentPool.length; i++) {
      const idx = Math.floor(rand() * accentPool.length);
      accents.push(accentPool.splice(idx, 1)[0]!);
    }
    const has = (layer: AccentLayer) => accents.includes(layer);

    const fieldCx = 0.2 + rand() * 0.6;
    const fieldCy = 0.15 + rand() * 0.55;
    const baseDark = 0.72 + rand() * 0.2;
    const vignetteSoft = 0.52 + rand() * 0.3;
    const tilt = (rand() - 0.5) * 0.45;
    // Soft cap so unlucky seeds (e.g. Crossbow Master) can't pack solid FX
    let density = 0.4 + rand() * 0.85;
    if (seed === "dart-monkey-35") {
      density *= 0.68; // ~30%+ more open than a typical dense roll
    }
    const secondField = crazy || rand() > 0.4;
    const bloomStrong = crazy || rand() > 0.55;
    const thirdField = crazy && rand() > 0.45;

    const orbs = Array.from(
      { length: Math.floor((3 + rand() * 7) * density) },
      () => ({
        x: rand(),
        y: rand(),
        r: 0.07 + rand() * 0.36,
        color: pickColor(palette, rand),
        alpha: 0.14 + rand() * 0.42,
        drift: 0.08 + rand() * 0.35,
        phase: rand() * Math.PI * 2,
      }),
    );

    const sparks = Array.from(
      {
        length: Math.floor(
          (14 + rand() * 42) * (seed === "dart-monkey-35" ? 0.55 : 1),
        ),
      },
      () => ({
        x: rand(),
        y: rand(),
        s: 0.35 + rand() * 2.8,
        color: pickColor(palette, rand),
        alpha: 0.1 + rand() * 0.6,
        twinkle: rand() * Math.PI * 2,
        speed: 0.25 + rand() * 0.7,
      }),
    );

    const rays = Array.from(
      { length: Math.floor(8 + rand() * 22) },
      () => ({
        angle: rand() * Math.PI * 2,
        len: 0.3 + rand() * 0.8,
        width: 0.8 + rand() * 5.5,
        color: pickColor(palette, rand),
        alpha: 0.14 + rand() * 0.48,
        phase: rand() * Math.PI * 2,
        speed: 0.05 + rand() * 0.28,
      }),
    );

    const waves = Array.from({ length: Math.floor(2 + rand() * 5) }, () => ({
      y: 0.12 + rand() * 0.75,
      amp: 0.025 + rand() * 0.12,
      freq: 1 + rand() * 4,
      thick: 1.2 + rand() * 7,
      color: pickColor(palette, rand),
      alpha: 0.22 + rand() * 0.5,
      phase: rand() * Math.PI * 2,
      speed: 0.1 + rand() * 0.35,
      drift: (rand() - 0.5) * 0.06,
    }));

    const shards = Array.from(
      { length: Math.floor((6 + rand() * 18) * density) },
      () => ({
        x: rand(),
        y: rand(),
        rot: rand() * Math.PI * 2,
        w: 0.03 + rand() * 0.15,
        h: 0.06 + rand() * 0.3,
        color: pickColor(palette, rand),
        alpha: 0.16 + rand() * 0.48,
        spin: (rand() - 0.5) * 0.22,
        phase: rand() * Math.PI * 2,
      }),
    );

    const rings = Array.from({ length: Math.floor(2 + rand() * 6) }, () => ({
      cx: 0.15 + rand() * 0.7,
      cy: 0.15 + rand() * 0.6,
      r: 0.1 + rand() * 0.55,
      color: pickColor(palette, rand),
      alpha: 0.18 + rand() * 0.42,
      width: 1 + rand() * 5,
      dash: rand() > 0.42,
      spin: (rand() - 0.5) * 0.35,
      phase: rand() * Math.PI * 2,
      sweep: Math.PI * (0.4 + rand() * 1.6),
    }));

    const latticeN = Math.floor(3 + rand() * 5);
    const latticeM = Math.floor(4 + rand() * 6);
    const latticeDots = Array.from({ length: latticeN * latticeM }, (_, i) => {
      const xi = i % latticeN;
      const yi = Math.floor(i / latticeN);
      return {
        xi,
        yi,
        jitterX: (rand() - 0.5) * 0.1,
        jitterY: (rand() - 0.5) * 0.1,
        color: pickColor(palette, rand),
        r: 1.2 + rand() * 4.5,
        alpha: 0.22 + rand() * 0.55,
        phase: rand() * Math.PI * 2,
      };
    });
    const latticeLinks = rand() > 0.3;

    const cells = Array.from(
      { length: Math.floor((5 + rand() * 12) * density) },
      () => ({
        x: rand(),
        y: rand(),
        r: 0.05 + rand() * 0.22,
        color: pickColor(palette, rand),
        alpha: 0.18 + rand() * 0.42,
        pulse: 0.15 + rand() * 0.45,
        phase: rand() * Math.PI * 2,
      }),
    );

    const comets = Array.from({ length: Math.floor(3 + rand() * 9) }, () => ({
      x: rand(),
      y: rand() * 0.9,
      angle: rand() * Math.PI * 2,
      len: 0.12 + rand() * 0.5,
      thick: 0.8 + rand() * 4,
      color: pickColor(palette, rand),
      alpha: 0.28 + rand() * 0.5,
      speed: 0.04 + rand() * 0.14,
      phase: rand() * Math.PI * 2,
    }));

    const vortexArms = 3 + Math.floor(rand() * 5);
    const vortexSpin = (rand() - 0.5) * 0.35;
    const vortexTight = 0.6 + rand() * 1.4;

    const drops = Array.from({ length: Math.floor(30 + rand() * 50) }, () => ({
      x: rand(),
      y: rand(),
      len: 0.02 + rand() * 0.1,
      speed: 0.04 + rand() * 0.12,
      thick: 0.6 + rand() * 2,
      color: pickColor(palette, rand),
      alpha: 0.15 + rand() * 0.45,
      phase: rand(),
    }));

    const chevs = Array.from({ length: Math.floor(5 + rand() * 8) }, () => ({
      y: rand(),
      dir: rand() > 0.5 ? 1 : -1,
      thick: 1.5 + rand() * 5,
      color: pickColor(palette, rand),
      alpha: 0.2 + rand() * 0.45,
      speed: 0.06 + rand() * 0.2,
      phase: rand() * Math.PI * 2,
      gap: 0.04 + rand() * 0.08,
    }));

    const stars = Array.from({ length: Math.floor(40 + rand() * 80) }, () => ({
      x: rand(),
      y: rand(),
      r: 0.4 + rand() * 2.2,
      color: pickColor(palette, rand),
      alpha: 0.15 + rand() * 0.7,
      twinkle: rand() * Math.PI * 2,
      speed: 0.2 + rand() * 0.55,
    }));

    const moireLines = Math.floor(8 + rand() * 14);
    const moireAngle = rand() * Math.PI;
    const moireGap = 8 + rand() * 16;

    const ripples = Array.from({ length: Math.floor(2 + rand() * 4) }, () => ({
      x: 0.2 + rand() * 0.6,
      y: 0.2 + rand() * 0.55,
      color: pickColor(palette, rand),
      phase: rand() * Math.PI * 2,
      speed: 0.12 + rand() * 0.3,
      maxR: 0.15 + rand() * 0.4,
    }));

    const base = darken(palette[0]!, baseDark);

    const maxDpr = Math.min(window.devicePixelRatio || 1, 2);
    const drawAnimated = animated;

    const pulse = (t: number, phase: number, speed: number) =>
      drawAnimated
        ? 0.55 + 0.45 * Math.sin(t * speed + phase)
        : 0.72 + 0.28 * Math.sin(phase * 2.7);

    const draw = (tRaw: number) => {
      // Keep motion calm - seeded speeds used to run too hot
      const t = tRaw * 0.4;
      const parent = canvas.parentElement;
      if (!parent) return;
      const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
      const rect = parent.getBoundingClientRect();
      const w =
        parent.clientWidth ||
        parent.offsetWidth ||
        Math.round(rect.width) ||
        400;
      const h =
        parent.clientHeight ||
        parent.offsetHeight ||
        Math.round(rect.height) ||
        560;
      if (w < 2 || h < 2) return;

      const cw = Math.round(w * dpr);
      const ch = Math.round(h * dpr);
      if (canvas.width !== cw || canvas.height !== ch) {
        canvas.width = cw;
        canvas.height = ch;
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const minDim = Math.min(w, h);

      ctx.fillStyle = base;
      ctx.fillRect(0, 0, w, h);

      const field = ctx.createRadialGradient(
        w * fieldCx,
        h * fieldCy,
        0,
        w * fieldCx,
        h * fieldCy,
        Math.max(w, h) * (0.5 + density * 0.3),
      );
      field.addColorStop(0, rgba(palette[1] ?? palette[0]!, bloomStrong ? 0.5 : 0.35));
      field.addColorStop(0.42, rgba(palette[2] ?? palette[0]!, 0.18));
      field.addColorStop(1, "transparent");
      ctx.fillStyle = field;
      ctx.fillRect(0, 0, w, h);

      if (secondField) {
        const f2 = ctx.createRadialGradient(
          w * (1 - fieldCx),
          h * (0.85 - fieldCy * 0.4),
          0,
          w * (1 - fieldCx),
          h * (0.85 - fieldCy * 0.4),
          Math.max(w, h) * 0.45,
        );
        f2.addColorStop(0, rgba(palette[3] ?? palette[0]!, 0.28));
        f2.addColorStop(1, "transparent");
        ctx.fillStyle = f2;
        ctx.fillRect(0, 0, w, h);
      }

      if (thirdField) {
        const f3 = ctx.createRadialGradient(
          w * (0.15 + fieldCx * 0.5),
          h * 0.75,
          0,
          w * (0.15 + fieldCx * 0.5),
          h * 0.75,
          Math.max(w, h) * 0.4,
        );
        f3.addColorStop(0, rgba(palette[4] ?? palette[1] ?? palette[0]!, 0.35));
        f3.addColorStop(0.55, rgba(palette[5] ?? palette[2] ?? palette[0]!, 0.16));
        f3.addColorStop(1, "transparent");
        ctx.fillStyle = f3;
        ctx.fillRect(0, 0, w, h);
      }

      if (Math.abs(tilt) > 0.04) {
        ctx.save();
        ctx.translate(w / 2, h / 2);
        ctx.rotate(tilt);
        const stripe = ctx.createLinearGradient(-w, 0, w, 0);
        stripe.addColorStop(0, "transparent");
        stripe.addColorStop(0.45, rgba(palette[3] ?? palette[0]!, 0.14));
        stripe.addColorStop(1, "transparent");
        ctx.fillStyle = stripe;
        ctx.fillRect(-w, -h, w * 2, h * 2);
        ctx.restore();
      }

      // --- Primary modes ---
      if (isMode("nebula") || has("orbs")) {
        const list = isMode("nebula") ? orbs : orbs.slice(0, Math.ceil(orbs.length * 0.55));
        for (const orb of list) {
          const ox = orb.x * w + Math.sin(t * orb.drift + orb.phase) * w * 0.035;
          const oy =
            orb.y * h + Math.cos(t * orb.drift * 0.8 + orb.phase) * h * 0.03;
          const radius = orb.r * minDim;
          const g = ctx.createRadialGradient(ox, oy, 0, ox, oy, radius);
          g.addColorStop(0, rgba(orb.color, orb.alpha));
          g.addColorStop(0.55, rgba(orb.color, orb.alpha * 0.3));
          g.addColorStop(1, "transparent");
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(ox, oy, radius, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      if (isMode("radialBurst") || has("softRays")) {
        const cx = w * (0.3 + fieldCx * 0.4);
        const cy = h * (0.25 + fieldCy * 0.35);
        const list =
          isMode("radialBurst") ? rays : rays.slice(0, Math.ceil(rays.length * 0.4));
        for (const ray of list) {
          const a =
            ray.angle +
            Math.sin(t * ray.speed + ray.phase) * (drawAnimated ? 0.08 : 0);
          const len =
            ray.len *
            Math.max(w, h) *
            pulse(t, ray.phase, ray.speed) *
            (isMode("radialBurst") ? 1 : 0.65);
          ctx.beginPath();
          ctx.strokeStyle = rgba(
            ray.color,
            ray.alpha * (isMode("radialBurst") ? 1 : 0.55),
          );
          ctx.lineWidth = ray.width;
          ctx.lineCap = "round";
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len);
          ctx.stroke();
        }
        if (isMode("radialBurst")) {
          const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, minDim * 0.2);
          core.addColorStop(0, rgba(palette[0]!, 0.55));
          core.addColorStop(1, "transparent");
          ctx.fillStyle = core;
          ctx.beginPath();
          ctx.arc(cx, cy, minDim * 0.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      if (isMode("waveRibbon")) {
        for (const wave of waves) {
          ctx.beginPath();
          ctx.strokeStyle = rgba(wave.color, wave.alpha);
          ctx.lineWidth = wave.thick;
          ctx.lineCap = "round";
          const y0 = wave.y * h;
          const steps = 40;
          for (let i = 0; i <= steps; i++) {
            const u = i / steps;
            const x = u * w;
            const y =
              y0 +
              Math.sin(
                u * Math.PI * 2 * wave.freq + t * wave.speed + wave.phase,
              ) *
                wave.amp *
                h +
              Math.sin(t * 0.4 + wave.phase) * wave.drift * h;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
      }

      if (isMode("shardField") || has("softShards")) {
        const list =
          isMode("shardField")
            ? shards
            : shards.slice(0, Math.ceil(shards.length * 0.4));
        for (const shard of list) {
          const rot = shard.rot + t * shard.spin;
          const sw = shard.w * minDim;
          const sh = shard.h * minDim * pulse(t, shard.phase, 1 + Math.abs(shard.spin));
          ctx.save();
          ctx.translate(shard.x * w, shard.y * h);
          ctx.rotate(rot);
          ctx.fillStyle = rgba(
            shard.color,
            shard.alpha * (isMode("shardField") ? 1 : 0.55),
          );
          ctx.beginPath();
          ctx.moveTo(0, -sh / 2);
          ctx.lineTo(sw / 2, sh / 2);
          ctx.lineTo(-sw / 2, sh / 2);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
      }

      if (isMode("orbitRings") || isMode("nebula") || has("softRings")) {
        const list =
          isMode("orbitRings")
            ? rings
            : rings.slice(0, isMode("nebula") ? 3 : Math.min(2, rings.length));
        for (const ring of list) {
          const rot = ring.phase + t * ring.spin * (isMode("orbitRings") ? 1 : 0.4);
          ctx.beginPath();
          ctx.strokeStyle = rgba(
            ring.color,
            ring.alpha * (isMode("orbitRings") ? 1 : 0.7),
          );
          ctx.lineWidth = ring.width;
          ctx.lineCap = "round";
          if (ring.dash) ctx.setLineDash([8, 10]);
          ctx.arc(ring.cx * w, ring.cy * h, ring.r * minDim, rot, rot + ring.sweep);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      if (isMode("lattice")) {
        const padX = w * 0.1;
        const padY = h * 0.12;
        const spanX = w - padX * 2;
        const spanY = h - padY * 2;
        const pts = latticeDots.map((d) => {
          const x =
            padX +
            (d.xi / Math.max(1, latticeN - 1)) * spanX +
            d.jitterX * w +
            Math.sin(t * 0.7 + d.phase) * (drawAnimated ? 3 : 0);
          const y =
            padY +
            (d.yi / Math.max(1, latticeM - 1)) * spanY +
            d.jitterY * h +
            Math.cos(t * 0.6 + d.phase) * (drawAnimated ? 2 : 0);
          return { ...d, x, y };
        });
        if (latticeLinks) {
          ctx.lineWidth = 1;
          for (let i = 0; i < pts.length; i++) {
            const a = pts[i]!;
            for (let j = i + 1; j < pts.length; j++) {
              const b = pts[j]!;
              const dist = Math.hypot(a.x - b.x, a.y - b.y);
              if (dist < minDim * 0.22) {
                ctx.strokeStyle = rgba(
                  a.color,
                  0.12 + (1 - dist / (minDim * 0.22)) * 0.25,
                );
                ctx.beginPath();
                ctx.moveTo(a.x, a.y);
                ctx.lineTo(b.x, b.y);
                ctx.stroke();
              }
            }
          }
        }
        for (const p of pts) {
          ctx.fillStyle = rgba(p.color, p.alpha * pulse(t, p.phase, 1.4));
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      if (isMode("plasmaCells")) {
        for (const cell of cells) {
          const scale = pulse(t, cell.phase, cell.pulse);
          const radius = cell.r * minDim * scale;
          const cx = cell.x * w;
          const cy = cell.y * h;
          const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
          g.addColorStop(0, rgba(cell.color, cell.alpha));
          g.addColorStop(0.5, rgba(cell.color, cell.alpha * 0.35));
          g.addColorStop(0.85, rgba(cell.color, 0.05));
          g.addColorStop(1, "transparent");
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(cx, cy, radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = rgba(cell.color, cell.alpha * 0.55);
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(cx, cy, radius * 0.72, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      if (isMode("cometTrails")) {
        for (const c of comets) {
          const travel = drawAnimated ? ((t * c.speed + c.phase) % 1.4) - 0.2 : 0.35;
          const ox = (c.x + Math.cos(c.angle) * travel * 0.35) * w;
          const oy = (c.y + Math.sin(c.angle) * travel * 0.25) * h;
          const ex = ox - Math.cos(c.angle) * c.len * w;
          const ey = oy - Math.sin(c.angle) * c.len * h;
          const g = ctx.createLinearGradient(ox, oy, ex, ey);
          g.addColorStop(0, rgba(c.color, c.alpha));
          g.addColorStop(1, "transparent");
          ctx.strokeStyle = g;
          ctx.lineWidth = c.thick;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(ox, oy);
          ctx.lineTo(ex, ey);
          ctx.stroke();
          ctx.fillStyle = rgba(c.color, Math.min(1, c.alpha + 0.2));
          ctx.beginPath();
          ctx.arc(ox, oy, c.thick * 1.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      if (isMode("vortex")) {
        const cx = w * fieldCx;
        const cy = h * fieldCy;
        for (let arm = 0; arm < vortexArms; arm++) {
          const color = palette[arm % palette.length]!;
          ctx.beginPath();
          ctx.strokeStyle = rgba(color, 0.45);
          ctx.lineWidth = 2;
          ctx.lineCap = "round";
          const steps = 48;
          for (let i = 0; i <= steps; i++) {
            const u = i / steps;
            const ang =
              (arm / vortexArms) * Math.PI * 2 +
              u * Math.PI * 2 * vortexTight +
              t * vortexSpin;
            const rad = u * minDim * 0.55;
            const x = cx + Math.cos(ang) * rad;
            const y = cy + Math.sin(ang) * rad;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
      }

      if (isMode("drizzle")) {
        for (const d of drops) {
          const y = ((d.y + t * d.speed + d.phase) % 1.2) - 0.1;
          const x = d.x * w + Math.sin(t * 0.8 + d.phase * 6) * 6;
          const len = d.len * h;
          const g = ctx.createLinearGradient(x, y * h, x, y * h + len);
          g.addColorStop(0, "transparent");
          g.addColorStop(0.4, rgba(d.color, d.alpha));
          g.addColorStop(1, "transparent");
          ctx.strokeStyle = g;
          ctx.lineWidth = d.thick;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(x, y * h);
          ctx.lineTo(x, y * h + len);
          ctx.stroke();
        }
      }

      if (isMode("chevrons")) {
        for (const c of chevs) {
          const y =
            ((c.y + Math.sin(t * c.speed + c.phase) * 0.04) % 1) * h;
          ctx.strokeStyle = rgba(c.color, c.alpha);
          ctx.lineWidth = c.thick;
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          const mid = w * 0.5;
          const span = w * 0.38;
          ctx.beginPath();
          ctx.moveTo(mid - span * c.dir, y - c.gap * h);
          ctx.lineTo(mid, y);
          ctx.lineTo(mid + span * c.dir, y - c.gap * h);
          ctx.stroke();
        }
      }

      if (isMode("starfield")) {
        for (const s of stars) {
          const a = drawAnimated
            ? s.alpha * (0.45 + 0.55 * Math.sin(t * s.speed + s.twinkle))
            : s.alpha;
          ctx.fillStyle = rgba(s.color, a);
          ctx.beginPath();
          ctx.arc(s.x * w, s.y * h, s.r, 0, Math.PI * 2);
          ctx.fill();
          if (s.r > 1.4) {
            ctx.strokeStyle = rgba(s.color, a * 0.55);
            ctx.lineWidth = 0.8;
            ctx.beginPath();
            ctx.moveTo(s.x * w - s.r * 2, s.y * h);
            ctx.lineTo(s.x * w + s.r * 2, s.y * h);
            ctx.moveTo(s.x * w, s.y * h - s.r * 2);
            ctx.lineTo(s.x * w, s.y * h + s.r * 2);
            ctx.stroke();
          }
        }
      }

      if (isMode("moire")) {
        ctx.save();
        ctx.translate(w / 2, h / 2);
        ctx.rotate(moireAngle + t * 0.05);
        for (let i = -moireLines; i <= moireLines; i++) {
          ctx.strokeStyle = rgba(
            palette[Math.abs(i) % palette.length]!,
            0.12 + (Math.abs(i) % 3) * 0.06,
          );
          ctx.lineWidth = 1.2;
          const y = i * moireGap;
          ctx.beginPath();
          ctx.moveTo(-w, y);
          ctx.lineTo(w, y);
          ctx.stroke();
        }
        ctx.rotate(0.35 + Math.sin(t * 0.3) * 0.08);
        for (let i = -moireLines; i <= moireLines; i++) {
          ctx.strokeStyle = rgba(
            palette[(Math.abs(i) + 1) % palette.length]!,
            0.1 + (Math.abs(i) % 2) * 0.08,
          );
          ctx.lineWidth = 1;
          const y = i * moireGap * 0.9;
          ctx.beginPath();
          ctx.moveTo(-w, y);
          ctx.lineTo(w, y);
          ctx.stroke();
        }
        ctx.restore();
      }

      // --- Accent layers ---
      if (has("ripples")) {
        for (const r of ripples) {
          for (let k = 0; k < 3; k++) {
            const u = (t * r.speed * 0.25 + r.phase + k / 3) % 1;
            const rad = u * r.maxR * minDim;
            ctx.beginPath();
            ctx.strokeStyle = rgba(r.color, (1 - u) * 0.4);
            ctx.lineWidth = 1.5;
            ctx.arc(r.x * w, r.y * h, Math.max(1, rad), 0, Math.PI * 2);
            ctx.stroke();
          }
        }
      }

      if (has("scanlines")) {
        ctx.fillStyle = "rgba(0,0,0,0.08)";
        for (let y = 0; y < h; y += 3) {
          ctx.fillRect(0, y, w, 1);
        }
        const sweepY = ((t * 0.12) % 1.4) * h - h * 0.2;
        const sg = ctx.createLinearGradient(0, sweepY, 0, sweepY + h * 0.15);
        sg.addColorStop(0, "transparent");
        sg.addColorStop(0.5, rgba(palette[0]!, 0.12));
        sg.addColorStop(1, "transparent");
        ctx.fillStyle = sg;
        ctx.fillRect(0, sweepY, w, h * 0.15);
      }

      if (has("noise")) {
        const step = 7;
        for (let y = 0; y < h; y += step) {
          for (let x = 0; x < w; x += step) {
            const n = Math.sin(x * 12.9898 + y * 78.233 + seed.length * 4.1) * 43758.5453;
            const f = n - Math.floor(n);
            if (f > 0.72) {
              ctx.fillStyle = rgba(
                palette[Math.floor(f * palette.length) % palette.length]!,
                0.04 + f * 0.08,
              );
              ctx.fillRect(x, y, 2, 2);
            }
          }
        }
      }

      if (has("sparks")) {
        for (const spark of sparks) {
          const a = drawAnimated
            ? spark.alpha * (0.5 + 0.5 * Math.sin(t * spark.speed + spark.twinkle))
            : spark.alpha;
          ctx.fillStyle = rgba(spark.color, a);
          ctx.beginPath();
          ctx.arc(spark.x * w, spark.y * h, spark.s, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Vignette
      const vig = ctx.createRadialGradient(
        w * 0.5,
        h * 0.45,
        minDim * 0.16,
        w * 0.5,
        h * 0.5,
        Math.max(w, h) * vignetteSoft,
      );
      vig.addColorStop(0, "transparent");
      vig.addColorStop(1, "rgba(4, 10, 22, 0.74)");
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, w, h);
    };

    let start = performance.now();
    let inView = true;
    let pageVisible =
      typeof document === "undefined" ||
      document.visibilityState !== "hidden";
    /* Match mobile site frame rate in the app WebView. */
    const minFrameMs = 0;
    let lastFrameAt = 0;

    const isLive = () => inView && pageVisible;

    const tick = (now: number) => {
      if (!isLive()) {
        rafRef.current = null;
        return;
      }
      if (minFrameMs > 0 && now - lastFrameAt < minFrameMs) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      lastFrameAt = now;
      const t = (now - start) / 1000;
      draw(drawAnimated ? t : 0);
      if (drawAnimated) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    const kick = () => {
      if (!isLive()) return;
      start = performance.now();
      lastFrameAt = 0;
      /* Android often blanks GPU canvas buffers after backgrounding. */
      try {
        canvas.width = Math.max(1, canvas.width);
      } catch {
        /* ignore */
      }
      draw(0);
      if (drawAnimated && rafRef.current == null) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    draw(0);
    requestAnimationFrame(() => draw(0));

    const ro = new ResizeObserver(() => {
      if (!isLive()) return;
      draw(drawAnimated ? (performance.now() - start) / 1000 : 0);
    });
    if (canvas.parentElement) ro.observe(canvas.parentElement);

    let io: IntersectionObserver | null = null;
    if (drawAnimated && typeof IntersectionObserver !== "undefined") {
      io = new IntersectionObserver(
        ([entry]) => {
          const next = Boolean(entry?.isIntersecting);
          if (next === inView) return;
          inView = next;
          if (isLive()) {
            kick();
          } else if (rafRef.current != null) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
          }
        },
        { rootMargin: "48px", threshold: 0.01 },
      );
      io.observe(canvas);
    }

    const onVisibility = () => {
      pageVisible = document.visibilityState !== "hidden";
      if (isLive()) {
        kick();
      } else if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    if (drawAnimated) {
      rafRef.current = requestAnimationFrame(tick);
    }

    return () => {
      ro.disconnect();
      io?.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [seed, colors, animated, intensity]);

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}
