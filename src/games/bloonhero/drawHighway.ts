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
};

export type HighwayDrawState = {
  now: number;
  notes: HighwayNote[];
  scanFrom: number;
  pressed: ReadonlySet<number>;
  holding: ReadonlySet<number>;
  /** Travel time spawn→hit. Lower = faster track. */
  approachSec?: number;
  /** Lane key labels (defaults to D F J K L). */
  laneLabels?: readonly string[];
  darts?: readonly DartFx[];
  /** performance.now() for dart timing */
  wallMs?: number;
};

const LANE_FILL = LANES.map((l) => l.color);
const LANE_TRAIL = LANES.map((l) => hexAlpha(l.color, 0.7));
const LANE_TRAIL_HOT = LANES.map((l) => hexAlpha(l.color, 0.95));
const LANE_TRAIL_DROP = LANES.map((l) => hexAlpha(l.color, 0.28));
const LANE_BORDER = LANES.map((l) => hexAlpha(l.color, 0.35));

type BloonSprite = {
  img: HTMLImageElement;
  outline: HTMLCanvasElement | null;
};

const sprites: (BloonSprite | null)[] = BLOON_IMAGES.map(() => null);
let loadStarted = false;

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
  if (loadStarted || typeof Image === "undefined") return;
  loadStarted = true;
  BLOON_IMAGES.forEach((src, i) => {
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

function drawDart(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  color: string,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, -13);
  ctx.lineTo(3.5, 7);
  ctx.lineTo(0, 3);
  ctx.lineTo(-3.5, 7);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(244,241,230,0.9)";
  ctx.fillRect(-1, -1, 2, 9);
  ctx.restore();
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
  ctx.globalAlpha = alpha;
  ctx.drawImage(spr.img, cx - size / 2, cy - size / 2, size, size);
  ctx.globalAlpha = 1;
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
  // Ghost fill
  if (spr?.img.complete && spr.img.naturalWidth) {
    ctx.globalAlpha = pressed ? 0.42 : 0.26;
    ctx.drawImage(spr.img, cx - s / 2, y - s / 2, s, s);
    ctx.globalAlpha = 1;
    if (spr.outline) {
      const os = s * 1.12;
      ctx.globalAlpha = pressed ? 1 : 0.88;
      ctx.drawImage(spr.outline, cx - os / 2, y - os / 2, os, os);
      ctx.globalAlpha = 1;
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
  const { now, notes, pressed, holding } = state;
  const approach = state.approachSec ?? APPROACH_S;
  const labels = state.laneLabels;
  const darts = state.darts ?? [];
  const wallMs = state.wallMs ?? performance.now();

  ctx.clearRect(0, 0, cssW, cssH);

  const bg = ctx.createLinearGradient(0, 0, 0, cssH);
  bg.addColorStop(0, "#4eb8e0");
  bg.addColorStop(0.45, "#6ecf8a");
  bg.addColorStop(1, "#4a9e52");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, cssW, cssH);

  const laneCount = 5;
  const gap = 3;
  const laneW = (cssW - gap * (laneCount - 1)) / laneCount;
  const hitY = (HIT_LINE_Y / 100) * cssH;
  const bloonSize = Math.min(laneW * 0.78, 56);

  for (let i = 0; i < laneCount; i++) {
    const x = i * (laneW + gap);
    const active = pressed.has(i) || holding.has(i);

    ctx.fillStyle = "rgba(20,50,30,0.18)";
    ctx.fillRect(x, 0, laneW, cssH);
    ctx.strokeStyle = LANE_BORDER[i]!;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, 0.5, laneW - 1, cssH - 1);

    drawReceptor(
      ctx,
      i,
      x + laneW / 2,
      hitY,
      bloonSize,
      active,
    );

    const label = (labels?.[i] ?? LANES[i]!.label).toUpperCase();
    ctx.fillStyle = "rgba(20,40,28,0.85)";
    ctx.font = `700 ${Math.max(11, Math.min(13, laneW * 0.2))}px system-ui,sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, x + laneW / 2, cssH - 14);
  }

  ctx.strokeStyle = "rgba(255,236,160,0.75)";
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
    const color = LANE_FILL[d.lane] ?? "#fff";
    const fly = Math.min(1, age / d.dur);
    const startY = cssH + 6;
    const y = startY + (hitY - startY) * fly;
    if (fly < 1) {
      drawDart(ctx, cx, y, 0.9 + 0.2 * (1 - fly), color);
    } else {
      const pop = Math.min(1, (age - d.dur) / 0.14);
      ctx.globalAlpha = 1 - pop;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(cx, hitY, 6 + pop * 18, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(cx, hitY, 5 * (1 - pop), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
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
