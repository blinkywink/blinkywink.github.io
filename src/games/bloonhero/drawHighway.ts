import {
  APPROACH_S,
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
const LANE_DIM = LANES.map((l) => hexAlpha(l.color, 0.14));
const LANE_HOT = LANES.map((l) => hexAlpha(l.color, 0.28));
const LANE_BORDER = LANES.map((l) => hexAlpha(l.color, 0.4));
const LANE_BORDER_HOT = LANES.map((l) => hexAlpha(l.color, 0.85));
const LANE_TRAIL = LANES.map((l) => hexAlpha(l.color, 0.55));
const LANE_TRAIL_HOT = LANES.map((l) => hexAlpha(l.color, 0.9));
const LANE_TRAIL_DROP = LANES.map((l) => hexAlpha(l.color, 0.2));

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

/** Lean canvas highway — solid fills, approach-aware, dart pop FX. */
export function drawHeroHighway(
  ctx: CanvasRenderingContext2D,
  cssW: number,
  cssH: number,
  state: HighwayDrawState,
): number {
  const { now, notes, pressed, holding } = state;
  const approach = state.approachSec ?? APPROACH_S;
  const labels = state.laneLabels;
  const darts = state.darts ?? [];
  const wallMs = state.wallMs ?? performance.now();

  ctx.clearRect(0, 0, cssW, cssH);

  // Soft BTD-ish sky wash (still lean — one fill)
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
  const noteH = Math.max(10, Math.min(16, laneW * 0.26));
  const noteW = Math.min(laneW * 0.7, 48);
  const r = 4;

  for (let i = 0; i < laneCount; i++) {
    const x = i * (laneW + gap);
    const active = pressed.has(i) || holding.has(i);

    ctx.fillStyle = active ? LANE_HOT[i]! : "rgba(20,50,30,0.22)";
    ctx.fillRect(x, 0, laneW, cssH);

    ctx.strokeStyle = active ? LANE_BORDER_HOT[i]! : LANE_BORDER[i]!;
    ctx.lineWidth = active ? 2 : 1;
    ctx.strokeRect(x + 0.5, 0.5, laneW - 1, cssH - 1);

    const rx = x + (laneW - noteW) / 2;
    const ry = hitY - noteH / 2;
    ctx.fillStyle = active ? LANE_HOT[i]! : LANE_DIM[i]!;
    ctx.strokeStyle = LANE_BORDER_HOT[i]!;
    ctx.lineWidth = 2;
    fillRoundRect(ctx, rx, ry, noteW, noteH, r);
    ctx.stroke();

    const label = (labels?.[i] ?? LANES[i]!.label).toUpperCase();
    ctx.fillStyle = "rgba(20,40,28,0.85)";
    ctx.font = `700 ${Math.max(11, Math.min(13, laneW * 0.2))}px system-ui,sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, x + laneW / 2, cssH - 14);
  }

  ctx.strokeStyle = "rgba(255,236,160,0.9)";
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

    if (n.sustain && n.dur > 0) {
      const yEnd = yFor(now, n.t + n.dur, cssH, approach);
      const top = Math.min(yHead, yEnd);
      const bot = Math.max(yHead, yEnd);
      const tw = Math.min(laneW * 0.2, 10);
      ctx.fillStyle = n.releasedEarly
        ? LANE_TRAIL_DROP[lane]!
        : n.holding
          ? LANE_TRAIL_HOT[lane]!
          : LANE_TRAIL[lane]!;
      ctx.fillRect(cx - tw / 2, top, tw, Math.max(2, bot - top));
    }

    const miss = n.result === "miss";
    const nx = cx - noteW / 2;
    const ny = yHead - noteH / 2;
    ctx.globalAlpha = miss ? 0.35 : 1;
    ctx.fillStyle = LANE_FILL[lane]!;
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = n.holding && !n.releasedEarly ? 2.5 : 1.5;
    fillRoundRect(ctx, nx, ny, noteW, noteH, r);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // Darts fire from bottom toward hit line, then pop.
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

function fillRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  rad: number,
) {
  const rr = Math.min(rad, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
  ctx.fill();
}

function hexAlpha(hex: string, a: number): string {
  const n = hex.replace("#", "");
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}
