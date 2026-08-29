/**
 * Bake category pack shelf mosaics (3 towers → 1 webp) for shop perf.
 *
 *   npm run generate-category-pack-mosaics
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import {
  CATEGORY_ORDER,
  resolveCategoryPackTheme,
  type TowerCategory,
} from "../src/lib/packTheme";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "public", "images", "packs");

const CANVAS = 600;

type SlotSpec = {
  w: number;
  h: number;
  x: number;
  y: number;
  rotate: number;
};

/** Rough match to .pack-face__category-slot --0/1/2 in index.css */
const SLOTS: SlotSpec[] = [
  { w: 0.58, h: 0.68, x: 0.06, y: 0.2, rotate: -12 },
  { w: 0.58, h: 0.68, x: 0.36, y: 0.2, rotate: 12 },
  { w: 0.64, h: 0.74, x: 0.18, y: 0.1, rotate: -2 },
];

function publicFile(urlPath: string): string {
  return path.join(ROOT, "public", urlPath.replace(/^\//, ""));
}

async function tile(srcUrl: string, spec: SlotSpec): Promise<Buffer> {
  const tileW = Math.round(CANVAS * spec.w);
  const tileH = Math.round(CANVAS * spec.h);
  return sharp(publicFile(srcUrl))
    .resize(tileW, tileH, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .rotate(spec.rotate, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();
}

async function composeCategory(category: TowerCategory): Promise<void> {
  const theme = resolveCategoryPackTheme(category);
  const sources = theme.images.slice(0, 3);
  if (!sources.length) throw new Error(`No towers for ${category}`);

  while (sources.length < 3) {
    sources.push(sources[sources.length - 1]!);
  }

  const layers: sharp.OverlayOptions[] = [];
  for (let i = 0; i < 3; i++) {
    const spec = SLOTS[i]!;
    const buf = await tile(sources[i]!, spec);
    layers.push({
      input: buf,
      left: Math.round(CANVAS * spec.x),
      top: Math.round(CANVAS * spec.y),
    });
  }

  const out = path.join(
    OUT_DIR,
    `category-${category.toLowerCase()}-mosaic.webp`,
  );
  await sharp({
    create: {
      width: CANVAS,
      height: CANVAS,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(layers)
    .webp({ quality: 86, effort: 6 })
    .toFile(out);

  console.log("wrote", path.relative(ROOT, out));
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  for (const category of CATEGORY_ORDER) {
    await composeCategory(category);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
