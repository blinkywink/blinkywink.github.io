import type { DifficultyConfig } from "../games/zoomed/config";
import { ZOOMED_CONFIG } from "../games/zoomed/config";
import { biasedUnit, randRange } from "./random";

export type TransformParams = {
  cropX: number;
  cropY: number;
  cropW: number;
  cropH: number;
  zoom: number;
  rotation: number;
  stretchX: number;
  stretchY: number;
  blur: number;
  pixelation: number;
  brightness: number;
  contrast: number;
  distortion: number;
};

const imageCache = new Map<string, HTMLImageElement>();
const loading = new Map<string, Promise<HTMLImageElement>>();

export function preloadImage(src: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(src);
  if (cached?.complete && cached.naturalWidth > 0) {
    return Promise.resolve(cached);
  }
  const pending = loading.get(src);
  if (pending) return pending;

  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      imageCache.set(src, img);
      loading.delete(src);
      resolve(img);
    };
    img.onerror = () => {
      loading.delete(src);
      reject(new Error(`Failed to load ${src}`));
    };
    img.src = src;
  });
  loading.set(src, promise);
  return promise;
}

export function generateTransform(
  img: HTMLImageElement,
  difficulty: DifficultyConfig,
): TransformParams {
  const imgW = img.naturalWidth;
  const imgH = img.naturalHeight;
  const minSide = Math.min(imgW, imgH);
  const cropFrac = randRange(difficulty.cropSize[0], difficulty.cropSize[1]);
  // Tiny absolute floor — high-res sources still read as detail, not noise
  const cropW = Math.max(18, Math.min(imgW, minSide * cropFrac));
  const cropH = Math.max(18, Math.min(imgH, minSide * cropFrac));

  const maxX = Math.max(0, imgW - cropW);
  const maxY = Math.max(0, imgH - cropH);
  const { cropX, cropY } = pickInterestingCrop(
    img,
    cropW,
    cropH,
    maxX,
    maxY,
  );

  return {
    cropX,
    cropY,
    cropW,
    cropH,
    zoom: randRange(difficulty.zoom[0], difficulty.zoom[1]),
    rotation: randRange(-difficulty.rotation, difficulty.rotation),
    stretchX: randRange(difficulty.stretch[0], difficulty.stretch[1]),
    stretchY: randRange(difficulty.stretch[0], difficulty.stretch[1]),
    blur: randRange(difficulty.blur[0], difficulty.blur[1]),
    pixelation: randRange(difficulty.pixelation[0], difficulty.pixelation[1]),
    brightness: randRange(difficulty.brightness[0], difficulty.brightness[1]),
    contrast: randRange(difficulty.contrast[0], difficulty.contrast[1]),
    distortion: randRange(difficulty.distortion[0], difficulty.distortion[1]),
  };
}

const analysisCache = new Map<
  string,
  { w: number; h: number; data: Uint8ClampedArray }
>();

/** Downscale for fast region scoring (cached per image URL). */
function getAnalysisImage(img: HTMLImageElement): {
  w: number;
  h: number;
  data: Uint8ClampedArray;
} {
  const key = img.src;
  const hit = analysisCache.get(key);
  if (hit) return hit;

  const maxSide = 96;
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(8, Math.round(img.naturalWidth * scale));
  const h = Math.max(8, Math.round(img.naturalHeight * scale));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  const packed = { w, h, data };
  analysisCache.set(key, packed);
  // Bound cache growth
  if (analysisCache.size > 80) {
    const first = analysisCache.keys().next().value;
    if (first) analysisCache.delete(first);
  }
  return packed;
}

/**
 * Score a crop by color variety among opaque pixels.
 * Flat 1–2 color patches (or empty transparency) score low.
 */
function scoreCropRegion(
  analysis: { w: number; h: number; data: Uint8ClampedArray },
  imgW: number,
  imgH: number,
  cropX: number,
  cropY: number,
  cropW: number,
  cropH: number,
): number {
  const { w, h, data } = analysis;
  const x0 = Math.floor((cropX / imgW) * w);
  const y0 = Math.floor((cropY / imgH) * h);
  const x1 = Math.min(w, Math.ceil(((cropX + cropW) / imgW) * w));
  const y1 = Math.min(h, Math.ceil(((cropY + cropH) / imgH) * h));
  if (x1 <= x0 || y1 <= y0) return -1;

  let count = 0;
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let sumR2 = 0;
  let sumG2 = 0;
  let sumB2 = 0;
  const buckets = new Set<number>();

  // Step through the region — denser samples for small crops
  const step = Math.max(1, Math.floor(Math.min(x1 - x0, y1 - y0) / 12));

  for (let y = y0; y < y1; y += step) {
    for (let x = x0; x < x1; x += step) {
      const i = (y * w + x) * 4;
      const a = data[i + 3]!;
      if (a < 40) continue; // skip transparent / near-empty
      const r = data[i]!;
      const g = data[i + 1]!;
      const b = data[i + 2]!;
      count += 1;
      sumR += r;
      sumG += g;
      sumB += b;
      sumR2 += r * r;
      sumG2 += g * g;
      sumB2 += b * b;
      // Coarse HSV-ish hue bucket via quantized RGB (32 levels → fewer buckets)
      const br = r >> 5;
      const bg = g >> 5;
      const bb = b >> 5;
      buckets.add((br << 6) | (bg << 3) | bb);
    }
  }

  if (count < 8) return -1;

  const inv = 1 / count;
  const meanR = sumR * inv;
  const meanG = sumG * inv;
  const meanB = sumB * inv;
  const varR = Math.max(0, sumR2 * inv - meanR * meanR);
  const varG = Math.max(0, sumG2 * inv - meanG * meanG);
  const varB = Math.max(0, sumB2 * inv - meanB * meanB);
  const variance = varR + varG + varB;

  // Distinct color count reward (log so 20+ colors don't dominate forever)
  const variety = Math.log2(1 + buckets.size) * 900;

  // Prefer solid art coverage inside the crop
  const area = ((x1 - x0) * (y1 - y0)) / (step * step);
  const coverage = Math.min(1, count / Math.max(1, area));
  const coverageBonus = coverage * 400;

  return variance + variety + coverageBonus;
}

/** Sample crop origins; keep the most colorful ones, then pick with light randomness. */
function pickInterestingCrop(
  img: HTMLImageElement,
  cropW: number,
  cropH: number,
  maxX: number,
  maxY: number,
): { cropX: number; cropY: number } {
  const imgW = img.naturalWidth;
  const imgH = img.naturalHeight;
  const bias = ZOOMED_CONFIG.cropCenterBias;
  const analysis = getAnalysisImage(img);

  const candidates: { cropX: number; cropY: number; score: number }[] = [];
  const samples = 36;

  for (let i = 0; i < samples; i++) {
    const cropX = biasedUnit(bias) * maxX;
    const cropY = biasedUnit(bias) * maxY;
    const score = scoreCropRegion(
      analysis,
      imgW,
      imgH,
      cropX,
      cropY,
      cropW,
      cropH,
    );
    candidates.push({ cropX, cropY, score });
  }

  // Also force a few grid samples so we don't miss vivid corners of the art
  for (let gy = 0; gy < 3; gy++) {
    for (let gx = 0; gx < 3; gx++) {
      const cropX = maxX <= 0 ? 0 : (gx / 2) * maxX;
      const cropY = maxY <= 0 ? 0 : (gy / 2) * maxY;
      const score = scoreCropRegion(
        analysis,
        imgW,
        imgH,
        cropX,
        cropY,
        cropW,
        cropH,
      );
      candidates.push({ cropX, cropY, score });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  const viable = candidates.filter((c) => c.score > 0);
  const pool = (viable.length ? viable : candidates).slice(0, 6);
  // Weighted pick among top scores
  const weights = pool.map((c, i) => Math.max(0.15, c.score) * (1.15 - i * 0.08));
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = Math.random() * total;
  for (let i = 0; i < pool.length; i++) {
    roll -= weights[i]!;
    if (roll <= 0) return { cropX: pool[i]!.cropX, cropY: pool[i]!.cropY };
  }
  const fallback = pool[0]!;
  return { cropX: fallback.cropX, cropY: fallback.cropY };
}

/**
 * Expand the same crop outward after a miss so the player sees more.
 * Softens effects a bit with each step.
 */
export function zoomOutTransform(
  base: TransformParams,
  imgW: number,
  imgH: number,
  steps: number,
): TransformParams {
  if (steps <= 0) return base;

  const factor = Math.pow(1.5, steps);
  const cx = base.cropX + base.cropW / 2;
  const cy = base.cropY + base.cropH / 2;
  const cropW = Math.min(imgW, base.cropW * factor);
  const cropH = Math.min(imgH, base.cropH * factor);
  const cropX = Math.max(0, Math.min(imgW - cropW, cx - cropW / 2));
  const cropY = Math.max(0, Math.min(imgH - cropH, cy - cropH / 2));
  const ease = Math.pow(0.65, steps);

  return {
    ...base,
    cropX,
    cropY,
    cropW,
    cropH,
    zoom: Math.max(1, base.zoom * Math.pow(0.9, steps)),
    rotation: base.rotation * ease,
    stretchX: 1 + (base.stretchX - 1) * ease,
    stretchY: 1 + (base.stretchY - 1) * ease,
    blur: base.blur * Math.pow(0.45, steps),
    pixelation: Math.max(1, 1 + (base.pixelation - 1) * ease),
    distortion: base.distortion * Math.pow(0.35, steps),
  };
}

function applyPixelate(
  ctx: CanvasRenderingContext2D,
  size: number,
  block: number,
): void {
  if (block <= 1.2) return;
  const w = size;
  const h = size;
  const sw = Math.max(1, Math.round(w / block));
  const sh = Math.max(1, Math.round(h / block));
  const tmp = document.createElement("canvas");
  tmp.width = sw;
  tmp.height = sh;
  const tctx = tmp.getContext("2d")!;
  tctx.imageSmoothingEnabled = false;
  tctx.drawImage(ctx.canvas, 0, 0, w, h, 0, 0, sw, sh);
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(tmp, 0, 0, sw, sh, 0, 0, w, h);
  ctx.imageSmoothingEnabled = true;
}

function applyWaveDistortion(
  ctx: CanvasRenderingContext2D,
  size: number,
  amp: number,
): void {
  if (amp < 0.01) return;
  const src = ctx.getImageData(0, 0, size, size);
  const out = ctx.createImageData(size, size);
  const a = amp * size * 0.08;
  const freq = 2.4 + amp * 4;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const ox = Math.round(x + Math.sin((y / size) * Math.PI * freq) * a);
      const oy = Math.round(y + Math.cos((x / size) * Math.PI * freq * 0.8) * a);
      const sx = Math.min(size - 1, Math.max(0, ox));
      const sy = Math.min(size - 1, Math.max(0, oy));
      const si = (sy * size + sx) * 4;
      const di = (y * size + x) * 4;
      out.data[di] = src.data[si];
      out.data[di + 1] = src.data[si + 1];
      out.data[di + 2] = src.data[si + 2];
      out.data[di + 3] = src.data[si + 3];
    }
  }
  ctx.putImageData(out, 0, 0);
}

/**
 * Renders a randomized cropped/zoomed challenge into the provided canvas.
 * Output is square for consistent UI framing.
 */
export async function renderChallenge(
  canvas: HTMLCanvasElement,
  imageSrc: string,
  difficulty: DifficultyConfig,
  outputSize = 640,
  transform?: TransformParams,
): Promise<TransformParams> {
  const img = await preloadImage(imageSrc);
  const params =
    transform ?? generateTransform(img, difficulty);

  canvas.width = outputSize;
  canvas.height = outputSize;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, outputSize, outputSize);

  // Soft vignette background so transparent PNG edges don't flash white
  const bg = ctx.createRadialGradient(
    outputSize / 2,
    outputSize / 2,
    outputSize * 0.1,
    outputSize / 2,
    outputSize / 2,
    outputSize * 0.75,
  );
  bg.addColorStop(0, "#1a3d5c");
  bg.addColorStop(1, "#0c2238");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, outputSize, outputSize);

  ctx.save();
  ctx.translate(outputSize / 2, outputSize / 2);
  ctx.rotate((params.rotation * Math.PI) / 180);
  ctx.scale(params.stretchX * params.zoom, params.stretchY * params.zoom);

  // Stage crop into an intermediate canvas first so we control scaling quality
  const stageScale = Math.min(4, Math.max(2, Math.ceil(outputSize / Math.min(params.cropW, params.cropH))));
  const stageW = Math.max(1, Math.round(params.cropW * stageScale));
  const stageH = Math.max(1, Math.round(params.cropH * stageScale));
  const stage = document.createElement("canvas");
  stage.width = stageW;
  stage.height = stageH;
  const sctx = stage.getContext("2d")!;
  // Nearest for heavy upscales of illustration art (keeps hard edges)
  sctx.imageSmoothingEnabled = stageScale <= 2;
  sctx.imageSmoothingQuality = "high";
  sctx.drawImage(
    img,
    params.cropX,
    params.cropY,
    params.cropW,
    params.cropH,
    0,
    0,
    stageW,
    stageH,
  );

  const filter = [
    params.blur > 0.05 ? `blur(${params.blur}px)` : "",
    `brightness(${params.brightness})`,
    `contrast(${params.contrast})`,
    difficulty.tier === "easy" || difficulty.tier === "medium"
      ? "saturate(1.06)"
      : "",
  ]
    .filter(Boolean)
    .join(" ");
  ctx.filter = filter || "none";
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  ctx.drawImage(stage, -outputSize / 2, -outputSize / 2, outputSize, outputSize);
  ctx.restore();
  ctx.filter = "none";

  applyPixelate(ctx, outputSize, params.pixelation);
  applyWaveDistortion(ctx, outputSize, params.distortion);

  return params;
}
