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

function yFor(now: number, t: number, height: number): number {
  const u = (t - now) / APPROACH_S;
  const clamped = Math.min(1, Math.max(0, u));
  const pct = SPAWN_Y + (1 - clamped) * (HIT_LINE_Y - SPAWN_Y);
  return (pct / 100) * height;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export type HighwayDrawState = {
  now: number;
  notes: HighwayNote[];
  /** First unresolved-or-visible index hint (notes sorted by t). */
  scanFrom: number;
  pressed: ReadonlySet<number>;
  holding: ReadonlySet<number>;
};

/** Imperative canvas highway — no React for note motion. */
export function drawHeroHighway(
  ctx: CanvasRenderingContext2D,
  cssW: number,
  cssH: number,
  state: HighwayDrawState,
): number {
  const { now, notes, pressed, holding } = state;
  ctx.clearRect(0, 0, cssW, cssH);

  const laneCount = LANES.length;
  const gap = 3;
  const laneW = (cssW - gap * (laneCount - 1)) / laneCount;
  const hitY = (HIT_LINE_Y / 100) * cssH;
  const noteH = Math.max(10, Math.min(18, laneW * 0.28));
  const noteW = Math.min(laneW * 0.72, 54);

  // Lane beds + receptors (static look; scroll lines are cheap)
  const scroll = ((Math.max(0, now) * 168) % 36);
  for (let i = 0; i < laneCount; i++) {
    const x = i * (laneW + gap);
    const color = LANES[i]!.color;
    const active = pressed.has(i) || holding.has(i);

    ctx.fillStyle = active
      ? hexAlpha(color, 0.22)
      : "rgba(255,255,255,0.03)";
    roundRect(ctx, x, 0, laneW, cssH, 10);
    ctx.fill();

    ctx.strokeStyle = hexAlpha(color, active ? 0.75 : 0.32);
    ctx.lineWidth = active ? 2 : 1;
    roundRect(ctx, x + 0.5, 0.5, laneW - 1, cssH - 1, 10);
    ctx.stroke();

    // Highway ticks
    ctx.save();
    ctx.beginPath();
    roundRect(ctx, x, 0, laneW, cssH * 0.86, 10);
    ctx.clip();
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    ctx.lineWidth = 1;
    for (let y = -scroll; y < cssH; y += 36) {
      ctx.beginPath();
      ctx.moveTo(x + 6, y);
      ctx.lineTo(x + laneW - 6, y);
      ctx.stroke();
    }
    ctx.restore();

    // Receptor
    const rx = x + (laneW - noteW) / 2;
    const ry = hitY - noteH / 2;
    ctx.strokeStyle = hexAlpha(color, active ? 0.95 : 0.8);
    ctx.lineWidth = active ? 2.5 : 2;
    ctx.fillStyle = hexAlpha(color, active ? 0.28 : 0.12);
    roundRect(ctx, rx, ry, noteW, noteH * 1.05, 5);
    ctx.fill();
    ctx.stroke();

    // Key label
    ctx.fillStyle = "rgba(244,241,230,0.85)";
    ctx.font = `700 ${Math.max(11, Math.min(14, laneW * 0.22))}px system-ui,sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(LANES[i]!.label, x + laneW / 2, cssH - 14);
  }

  // Notes — scan forward from hint; skip far-future once past approach
  let nextHint = state.scanFrom;
  const approachEnd = now + APPROACH_S + 0.05;
  const earliest = now - WINDOW_GOOD - 0.05;

  for (let i = Math.max(0, state.scanFrom - 8); i < notes.length; i++) {
    const n = notes[i]!;
    const end = n.t + (n.sustain ? n.dur : 0);

    if (n.t > approachEnd) break;
    if (end < earliest && !(n.resolved && n.result === "miss" && now - n.t < 0.18)) {
      if (!n.resolved || n.result === "miss") nextHint = Math.max(nextHint, i + 1);
      continue;
    }

    // After hit (non-sustain / finished sustain): hide
    if (n.resolved && !n.sustain && n.result !== "miss") continue;
    if (n.resolved && n.sustain && !n.holding && (n.releasedEarly || now > end)) {
      if (n.result !== "miss") continue;
    }
    if (n.resolved && n.result === "miss" && now - n.t >= 0.18) continue;

    const lane = n.lane;
    if (lane < 0 || lane >= laneCount) continue;
    const x = lane * (laneW + gap);
    const color = LANES[lane]!.color;
    const cx = x + laneW / 2;
    const yHead = yFor(now, n.t, cssH);

    if (n.sustain && n.dur > 0) {
      const yEnd = yFor(now, n.t + n.dur, cssH);
      const top = Math.min(yHead, yEnd);
      const bot = Math.max(yHead, yEnd);
      const tw = Math.min(laneW * 0.22, 12);
      ctx.fillStyle = n.releasedEarly
        ? hexAlpha(color, 0.18)
        : n.holding
          ? hexAlpha(color, 0.85)
          : hexAlpha(color, 0.55);
      roundRect(ctx, cx - tw / 2, top, tw, Math.max(2, bot - top), tw / 2);
      ctx.fill();
    }

    const miss = n.result === "miss";
    const nx = cx - noteW / 2;
    const ny = yHead - noteH / 2;
    ctx.globalAlpha = miss ? 0.35 : 1;
    const grd = ctx.createLinearGradient(nx, ny, nx, ny + noteH);
    grd.addColorStop(0, mixWhite(color, 0.35));
    grd.addColorStop(0.45, color);
    grd.addColorStop(1, mixBlack(color, 0.35));
    ctx.fillStyle = grd;
    ctx.strokeStyle = mixWhite(color, 0.35);
    ctx.lineWidth = 2;
    roundRect(ctx, nx, ny, noteW, noteH, 5);
    ctx.fill();
    ctx.stroke();

    // Specular
    ctx.fillStyle = "rgba(255,255,255,0.28)";
    roundRect(ctx, nx + noteW * 0.12, ny + noteH * 0.15, noteW * 0.76, noteH * 0.28, 99);
    ctx.fill();
    ctx.globalAlpha = 1;

    if (n.holding && !n.releasedEarly) {
      ctx.shadowColor = hexAlpha(color, 0.7);
      ctx.shadowBlur = 12;
      ctx.strokeStyle = mixWhite(color, 0.5);
      ctx.lineWidth = 2;
      roundRect(ctx, nx, ny, noteW, noteH, 5);
      ctx.stroke();
      ctx.shadowBlur = 0;
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

function mixWhite(hex: string, t: number): string {
  const n = hex.replace("#", "");
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  const m = (c: number) => Math.round(c + (255 - c) * t);
  return `rgb(${m(r)},${m(g)},${m(b)})`;
}

function mixBlack(hex: string, t: number): string {
  const n = hex.replace("#", "");
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  const m = (c: number) => Math.round(c * (1 - t));
  return `rgb(${m(r)},${m(g)},${m(b)})`;
}
