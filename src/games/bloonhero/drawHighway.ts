import {
  APPROACH_S,
  BLOON_IMAGES,
  HIT_LINE_Y,
  LANES,
  SPAWN_Y,
  WINDOW_GOOD,
  type Judge,
} from "./config";

export type HighwayNote = {
  id: number;
  t: number;
  lane: number;
  dur: number;
  sustain: boolean;
  resolved: boolean;
  result?: Judge;
  holding: boolean;
  releasedEarly: boolean;
};

export type DartFx = {
  id: number;
  lane: number;
  born: number;
  /** seconds to reach the hit line */
  dur: number;
  judge: Judge;
};

export type HitFlash = {
  id: number;
  lane: number;
  born: number;
  judge: Judge;
  /** Randomized white pop slash lines (successful hits only). */
  rays?: readonly PopRay[];
};

export type PopRay = {
  angle: number;
  /** Relative length vs bloon size. */
  len: number;
  thick: number;
  /** Start as a short gap from center. */
  inset: number;
};

export type HighwayDrawState = {
  now: number;
  notes: HighwayNote[];
  scanFrom: number;
  pressed: ReadonlySet<number>;
  holding: ReadonlySet<number>;
  /** Travel time spawn→hit. Lower = faster track. */
  approachSec?: number;
  /** Note / receptor size multiplier (1 = default). */
  bloonScale?: number;
  /** Lane key labels (defaults to D F J K L). */
  laneLabels?: readonly string[];
  darts?: readonly DartFx[];
  hitFlashes?: readonly HitFlash[];
  /** performance.now() for dart timing */
  wallMs?: number;
};

const JUDGE_COLOR: Record<Judge, string> = {
  perfect: "#ffe566",
  great: "#5eead4",
  good: "#fb923c",
  miss: "#f87171",
};

const JUDGE_GLOW: Record<Judge, string> = {
  perfect: "rgba(255, 229, 102, 0.55)",
  great: "rgba(94, 234, 212, 0.5)",
  good: "rgba(251, 146, 60, 0.45)",
  miss: "rgba(248, 113, 113, 0.4)",
};

const JUDGE_LABEL: Record<Judge, string> = {
  perfect: "PERFECT",
  great: "GREAT",
  good: "GOOD",
  miss: "MISS",
};

const LANE_FILL = LANES.map((l) => l.color);
const LANE_TRAIL = LANES.map((l) => hexAlpha(l.color, 0.7));
const LANE_TRAIL_HOT = LANES.map((l) => hexAlpha(l.color, 0.95));
const LANE_TRAIL_DROP = LANES.map((l) => hexAlpha(l.color, 0.28));

type BloonSprite = {
  img: HTMLImageElement;
  outline: HTMLCanvasElement | null;
};

const sprites: (BloonSprite | null)[] = BLOON_IMAGES.map(() => null);
let loadKey = "";
let shurikenImg: HTMLImageElement | null = null;
let shurikenSrcLoaded = "";

const SHURIKEN_SRC = "/images/bloons/shuriken.webp?v=2";

function ensureShuriken(): HTMLImageElement | null {
  if (typeof Image === "undefined") return null;
  if (shurikenSrcLoaded !== SHURIKEN_SRC) {
    shurikenSrcLoaded = SHURIKEN_SRC;
    shurikenImg = null;
    const img = new Image();
    img.decoding = "async";
    img.src = SHURIKEN_SRC;
    const finish = () => {
      shurikenImg = img;
    };
    if (img.complete && img.naturalWidth) finish();
    else img.addEventListener("load", finish, { once: true });
  }
  return shurikenImg?.complete && shurikenImg.naturalWidth ? shurikenImg : null;
}

function makeOutline(img: HTMLImageElement, color: string): HTMLCanvasElement {
  const pad = 6;
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const c = document.createElement("canvas");
  c.width = w + pad * 2;
  c.height = h + pad * 2;
  const ctx = c.getContext("2d");
  if (!ctx) return c;
  const offsets = [
    [2.4, 0],
    [-2.4, 0],
    [0, 2.4],
    [0, -2.4],
    [1.8, 1.8],
    [-1.8, 1.8],
    [1.8, -1.8],
    [-1.8, -1.8],
  ];
  for (const [dx, dy] of offsets) {
    ctx.drawImage(img, pad + dx, pad + dy, w, h);
  }
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.globalCompositeOperation = "destination-out";
  ctx.drawImage(img, pad, pad, w, h);
  return c;
}

/** Prefetch bloon art used by the highway canvas. */
export function ensureBloonImages(): void {
  if (typeof Image === "undefined") return;
  const key = BLOON_IMAGES.join("|");
  if (loadKey === key) return;
  loadKey = key;
  BLOON_IMAGES.forEach((src, i) => {
    sprites[i] = null;
    const img = new Image();
    img.decoding = "async";
    img.src = src;
    const finish = () => {
      sprites[i] = {
        img,
        outline: makeOutline(img, LANES[i]!.color),
      };
    };
    if (img.complete && img.naturalWidth) finish();
    else img.addEventListener("load", finish, { once: true });
  });
}

function yFor(now: number, t: number, height: number, approach: number): number {
  const u = (t - now) / approach;
  const clamped = u < 0 ? 0 : u > 1 ? 1 : u;
  const pct = SPAWN_Y + (1 - clamped) * (HIT_LINE_Y - SPAWN_Y);
  return (pct / 100) * height;
}

function drawShuriken(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  /** radians, clockwise positive in canvas after flip */
  angle: number,
) {
  const img = ensureShuriken();
  ctx.save();
  ctx.translate(x, y);
  // Canvas rotates clockwise when angle is positive in screen coords? 
  // Positive rotate() is clockwise in canvas y-down space.
  ctx.rotate(angle);
  if (img) {
    ctx.drawImage(img, -size / 2, -size / 2, size, size);
  } else {
    // Fallback star if image still loading
    ctx.fillStyle = "#d4d4d8";
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const ax = Math.cos(a) * size * 0.45;
      const ay = Math.sin(a) * size * 0.45;
      if (i === 0) ctx.moveTo(ax, ay);
      else ctx.lineTo(ax, ay);
      const b = a + Math.PI / 4;
      ctx.lineTo(Math.cos(b) * size * 0.16, Math.sin(b) * size * 0.16);
    }
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawImageContain(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  cx: number,
  cy: number,
  box: number,
  alpha = 1,
) {
  const iw =
    "naturalWidth" in img && (img as HTMLImageElement).naturalWidth
      ? (img as HTMLImageElement).naturalWidth
      : (img as HTMLCanvasElement).width;
  const ih =
    "naturalHeight" in img && (img as HTMLImageElement).naturalHeight
      ? (img as HTMLImageElement).naturalHeight
      : (img as HTMLCanvasElement).height;
  if (!iw || !ih) return;
  const scale = Math.min(box / iw, box / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  ctx.globalAlpha = alpha;
  ctx.drawImage(img, cx - dw / 2, cy - dh / 2, dw, dh);
  ctx.globalAlpha = 1;
}

function drawBloonAt(
  ctx: CanvasRenderingContext2D,
  lane: number,
  cx: number,
  cy: number,
  size: number,
  alpha: number,
) {
  const spr = sprites[lane];
  if (!spr?.img.complete || !spr.img.naturalWidth) {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = LANE_FILL[lane] ?? "#fff";
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    return;
  }
  drawImageContain(ctx, spr.img, cx, cy, size, alpha);
}

function drawReceptor(
  ctx: CanvasRenderingContext2D,
  lane: number,
  cx: number,
  cy: number,
  size: number,
  pressed: boolean,
) {
  const spr = sprites[lane];
  const push = pressed ? 3 : 0;
  const scale = pressed ? 0.9 : 1;
  const s = size * scale;
  const y = cy + push;

  ctx.save();
  if (spr?.img.complete && spr.img.naturalWidth) {
    drawImageContain(ctx, spr.img, cx, y, s, pressed ? 0.42 : 0.26);
    if (spr.outline) {
      drawImageContain(ctx, spr.outline, cx, y, s * 1.12, pressed ? 1 : 0.88);
    }
  } else {
    ctx.globalAlpha = pressed ? 0.35 : 0.18;
    ctx.fillStyle = LANE_FILL[lane]!;
    ctx.beginPath();
    ctx.arc(cx, y, s * 0.38, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = LANE_FILL[lane]!;
    ctx.lineWidth = pressed ? 3 : 2.5;
    ctx.beginPath();
    ctx.arc(cx, y, s * 0.4, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

/** Lean canvas highway — bloon notes + outline receptors. */
export function drawHeroHighway(
  ctx: CanvasRenderingContext2D,
  cssW: number,
  cssH: number,
  state: HighwayDrawState,
): number {
  ensureBloonImages();
  ensureShuriken();
  const { now, notes, pressed, holding } = state;
  const approach = state.approachSec ?? APPROACH_S;
  const scaleMul = state.bloonScale ?? 1;
  const darts = state.darts ?? [];
  const hitFlashes = state.hitFlashes ?? [];
  const wallMs = state.wallMs ?? performance.now();

  ctx.clearRect(0, 0, cssW, cssH);
  ctx.fillStyle = "#0a0a0c";
  ctx.fillRect(0, 0, cssW, cssH);

  const laneCount = 5;
  const gap = 4;
  const laneW = (cssW - gap * (laneCount - 1)) / laneCount;
  const hitY = (HIT_LINE_Y / 100) * cssH;
  const bloonSize = Math.min(laneW * 0.56, 40) * scaleMul;

  // Lane columns
  for (let i = 0; i < laneCount; i++) {
    const x = i * (laneW + gap);
    ctx.fillStyle = i % 2 === 0 ? "rgba(255,255,255,0.035)" : "rgba(255,255,255,0.018)";
    ctx.fillRect(x, 0, laneW, cssH);
  }

  // Subtle depth grid so you can read which note is ahead.
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.07)";
  ctx.lineWidth = 1;
  const gridRows = 10;
  for (let r = 1; r < gridRows; r++) {
    const y = (r / gridRows) * cssH;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(cssW, y);
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  for (let i = 0; i <= laneCount; i++) {
    const x = i * (laneW + gap) - gap / 2;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, cssH);
    ctx.stroke();
  }
  ctx.restore();

  for (let i = 0; i < laneCount; i++) {
    const x = i * (laneW + gap);
    const active = pressed.has(i) || holding.has(i);

    drawReceptor(
      ctx,
      i,
      x + laneW / 2,
      hitY,
      bloonSize,
      active,
    );
  }

  ctx.strokeStyle = "rgba(255,236,160,0.55)";
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 6]);
  ctx.beginPath();
  ctx.moveTo(0, hitY);
  ctx.lineTo(cssW, hitY);
  ctx.stroke();
  ctx.setLineDash([]);

  let nextHint = state.scanFrom;
  const approachEnd = now + approach + 0.05;
  const earliest = now - WINDOW_GOOD - 0.05;

  for (let i = Math.max(0, state.scanFrom - 8); i < notes.length; i++) {
    const n = notes[i]!;
    const end = n.t + (n.sustain ? n.dur : 0);

    if (n.t > approachEnd) break;
    if (
      end < earliest &&
      !(n.resolved && n.result === "miss" && now - n.t < 0.18)
    ) {
      if (!n.resolved || n.result === "miss") nextHint = Math.max(nextHint, i + 1);
      continue;
    }

    if (n.resolved && !n.sustain && n.result !== "miss") continue;
    if (
      n.resolved &&
      n.sustain &&
      !n.holding &&
      (n.releasedEarly || now > end)
    ) {
      if (n.result !== "miss") continue;
    }
    if (n.resolved && n.result === "miss" && now - n.t >= 0.18) continue;

    const lane = n.lane;
    if (lane < 0 || lane >= laneCount) continue;
    const x = lane * (laneW + gap);
    const cx = x + laneW / 2;
    const yHead = yFor(now, n.t, cssH, approach);

    // Sustain line sits behind the bloon.
    if (n.sustain && n.dur > 0) {
      const yEnd = yFor(now, n.t + n.dur, cssH, approach);
      const top = Math.min(yHead, yEnd);
      const bot = Math.max(yHead, yEnd);
      const tw = Math.max(4, Math.min(laneW * 0.12, 8));
      ctx.strokeStyle = n.releasedEarly
        ? LANE_TRAIL_DROP[lane]!
        : n.holding
          ? LANE_TRAIL_HOT[lane]!
          : LANE_TRAIL[lane]!;
      ctx.lineWidth = tw;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(cx, top);
      ctx.lineTo(cx, bot);
      ctx.stroke();
      ctx.lineCap = "butt";
    }

    const miss = n.result === "miss";
    // Hide head once hit unless still holding a sustain.
    if (!(n.resolved && n.result !== "miss" && !n.holding)) {
      drawBloonAt(ctx, lane, cx, yHead, bloonSize, miss ? 0.35 : 1);
    }
  }

  for (const d of darts) {
    const age = (wallMs - d.born) / 1000;
    if (age < 0 || age > d.dur + 0.14) continue;
    const x = d.lane * (laneW + gap);
    const cx = x + laneW / 2;
    const color = JUDGE_COLOR[d.judge] ?? LANE_FILL[d.lane] ?? "#fff";
    const fly = Math.min(1, age / d.dur);
    const startY = cssH + 6;
    const y = startY + (hitY - startY) * fly;
    // ~2.5 full clockwise spins while flying
    const spin = fly * Math.PI * 2 * 2.5;
    const size = Math.min(laneW * 0.55, 34);
    if (fly < 1) {
      drawShuriken(ctx, cx, y, size, spin);
    } else {
      const pop = Math.min(1, (age - d.dur) / 0.14);
      ctx.globalAlpha = 1 - pop;
      drawShuriken(ctx, cx, hitY, size * (1 - pop * 0.35), spin);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(cx, hitY, 6 + pop * 18, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  // Judge-colored accent on the hit line (read quality without looking up).
  for (const flash of hitFlashes) {
    const age = (wallMs - flash.born) / 1000;
    if (age < 0 || age > 0.42) continue;
    const t = age / 0.42;
    const fade = 1 - t;
    const x = flash.lane * (laneW + gap);
    const cx = x + laneW / 2;
    const color = JUDGE_COLOR[flash.judge];
    const glow = JUDGE_GLOW[flash.judge];

    ctx.save();
    ctx.globalAlpha = fade;
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = flash.judge === "perfect" ? 18 : 12;
    ctx.lineWidth = flash.judge === "perfect" ? 7 : flash.judge === "great" ? 5.5 : 4;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x + 4, hitY);
    ctx.lineTo(x + laneW - 4, hitY);
    ctx.stroke();

    const ringR = bloonSize * (0.42 + t * 0.55);
    ctx.shadowBlur = 10;
    ctx.lineWidth = flash.judge === "perfect" ? 3.5 : 2.5;
    ctx.beginPath();
    ctx.arc(cx, hitY, ringR, 0, Math.PI * 2);
    ctx.stroke();

    ctx.shadowBlur = 0;
    const core = ctx.createRadialGradient(cx, hitY, 2, cx, hitY, bloonSize * 0.55);
    core.addColorStop(0, glow);
    core.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(cx, hitY, bloonSize * 0.55, 0, Math.PI * 2);
    ctx.fill();

    // White pop slash lines (cartoon burst) — only on real hits.
    if (flash.rays?.length && flash.judge !== "miss") {
      const burst = Math.min(1, age / 0.18);
      const expand = 0.65 + burst * 0.9 + t * 0.35;
      const lineFade = fade * (1 - burst * 0.15);
      ctx.globalAlpha = lineFade;
      ctx.strokeStyle = "#ffffff";
      ctx.shadowColor = "rgba(255, 255, 255, 0.85)";
      ctx.shadowBlur = 5;
      ctx.lineCap = "round";
      for (const ray of flash.rays) {
        const cos = Math.cos(ray.angle);
        const sin = Math.sin(ray.angle);
        const inner = bloonSize * ray.inset * (0.85 + burst * 0.4);
        const outer = bloonSize * ray.len * expand;
        ctx.lineWidth = Math.max(1, ray.thick * (1 - t * 0.55));
        ctx.beginPath();
        ctx.moveTo(cx + cos * inner, hitY + sin * inner);
        ctx.lineTo(cx + cos * outer, hitY + sin * outer);
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
    }

    ctx.fillStyle = color;
    ctx.font = `800 ${Math.max(11, Math.min(15, laneW * 0.22))}px system-ui,sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.globalAlpha = fade * (flash.judge === "miss" ? 0.9 : 1);
    ctx.fillText(
      JUDGE_LABEL[flash.judge],
      cx,
      hitY - bloonSize * 0.55 - 2 - t * 10,
    );
    ctx.restore();
  }

  return nextHint;
}

function hexAlpha(hex: string, a: number): string {
  const n = hex.replace("#", "");
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}
