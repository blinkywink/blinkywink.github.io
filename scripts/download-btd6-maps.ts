/**
 * Downloads BTD6 map select images from the Bloons Wiki cargo table
 * and regenerates src/data/maps.json.
 *
 * Source: https://www.bloonswiki.com/List_of_maps_in_BTD6
 *
 * Usage: npm run download-maps
 */

import { access, mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PUBLIC_MAPS = path.join(ROOT, "public", "images", "maps");
const DATA_DIR = path.join(ROOT, "src", "data");

const API = "https://www.bloonswiki.com/api.php";
const USER_AGENT =
  "BloonArcadeAssetBot/1.0 (+local fan project; caches wiki map art offline)";

const OUTPUT_SIZE = 1024;
const FORCE = process.argv.includes("--force");

export type MapEntity = {
  id: string;
  name: string;
  difficulty: "Beginner" | "Intermediate" | "Advanced" | "Expert" | string;
  image: string;
  sourceFile: string;
};

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/#/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function apiJson<T>(params: Record<string, string>): Promise<T> {
  const url = new URL(API);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`API ${res.status} for ${url}`);
  }
  return (await res.json()) as T;
}

async function fetchCargoMaps(): Promise<
  { name: string; difficulty: string; image: string }[]
> {
  const data = await apiJson<{
    cargoquery?: Array<{
      title: { name: string; difficulty: string; image: string };
    }>;
    error?: { info: string };
  }>({
    action: "cargoquery",
    tables: "btd6_maps",
    fields: "name,difficulty,image",
    limit: "500",
    format: "json",
  });
  if (data.error) throw new Error(data.error.info);
  return (data.cargoquery ?? []).map((row) => row.title);
}

async function resolveImageUrls(
  files: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const batchSize = 40;

  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize);
    const titles = batch.map((f) => `File:${f}`).join("|");
    const data = await apiJson<{
      query: {
        pages:
          | Array<{
              title: string;
              missing?: boolean;
              imageinfo?: Array<{ url: string }>;
            }>
          | Record<
              string,
              {
                title: string;
                missing?: boolean;
                imageinfo?: Array<{ url: string }>;
              }
            >;
      };
    }>({
      action: "query",
      titles,
      prop: "imageinfo",
      iiprop: "url",
      format: "json",
      formatversion: "2",
    });

    const pages = Array.isArray(data.query.pages)
      ? data.query.pages
      : Object.values(data.query.pages);

    for (const page of pages) {
      const fileName = page.title.replace(/^File:/i, "");
      const url = page.imageinfo?.[0]?.url;
      if (!url) {
        console.warn(`  ! missing imageinfo for ${fileName}`);
        continue;
      }
      map.set(fileName, url);
      map.set(fileName.toLowerCase(), url);
    }
  }

  return map;
}

async function upscaleMapArt(buf: Buffer): Promise<Buffer> {
  const meta = await sharp(buf, { failOn: "none" }).metadata();
  const w = meta.width ?? OUTPUT_SIZE;
  const h = meta.height ?? OUTPUT_SIZE;
  const longest = Math.max(w, h);
  const target = Math.max(OUTPUT_SIZE, longest);

  return sharp(buf, { failOn: "none" })
    .ensureAlpha()
    .resize({
      width: w >= h ? target : undefined,
      height: h > w ? target : undefined,
      fit: "inside",
      kernel: sharp.kernel.lanczos3,
      withoutEnlargement: false,
    })
    .sharpen({
      sigma: 0.7,
      m1: 0.5,
      m2: 0.3,
      x1: 2,
      y2: 8,
      y3: 18,
    })
    .webp({ quality: 92, alphaQuality: 100, effort: 4 })
    .toBuffer();
}

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function downloadAndConvert(
  url: string,
  dest: string,
): Promise<boolean> {
  if (!FORCE && (await exists(dest))) return false;
  await mkdir(path.dirname(dest), { recursive: true });
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!res.ok) throw new Error(`Download failed ${res.status}: ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const out = await upscaleMapArt(buf);
  const tmp = `${dest}.tmp`;
  await writeFile(tmp, out);
  try {
    await unlink(dest);
  } catch {
    // ok
  }
  const { rename } = await import("node:fs/promises");
  await rename(tmp, dest);
  return true;
}

async function main() {
  console.log("Fetching BTD6 maps from cargo…");
  const rows = await fetchCargoMaps();
  console.log(`  ${rows.length} maps`);

  const files = [...new Set(rows.map((r) => r.image).filter(Boolean))];
  console.log(`Resolving ${files.length} image URLs…`);
  const urls = await resolveImageUrls(files);

  const entities: MapEntity[] = [];
  let downloaded = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    const id = slugify(row.name);
    const imagePath = `/images/maps/${id}.webp`;
    const dest = path.join(ROOT, "public", imagePath);
    const url =
      urls.get(row.image) ?? urls.get(row.image.toLowerCase()) ?? null;

    entities.push({
      id,
      name: row.name,
      difficulty: row.difficulty,
      image: imagePath,
      sourceFile: row.image,
    });

    if (!url) {
      console.warn(`  ! no URL for ${row.name} (${row.image})`);
      failed++;
      continue;
    }

    try {
      const wrote = await downloadAndConvert(url, dest);
      if (wrote) {
        downloaded++;
        console.log(`  + ${row.name}`);
      } else {
        skipped++;
      }
    } catch (err) {
      failed++;
      console.warn(
        `  ! failed ${row.name}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  entities.sort((a, b) => {
    const order = ["Beginner", "Intermediate", "Advanced", "Expert"];
    const da = order.indexOf(a.difficulty);
    const db = order.indexOf(b.difficulty);
    if (da !== db) return (da < 0 ? 99 : da) - (db < 0 ? 99 : db);
    return a.name.localeCompare(b.name);
  });

  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(
    path.join(DATA_DIR, "maps.json"),
    `${JSON.stringify(entities, null, 2)}\n`,
  );
  await writeFile(
    path.join(DATA_DIR, "maps.ts"),
    `/* Auto-generated by scripts/download-btd6-maps.ts — do not edit by hand */
import type { MapEntity } from "./types";
import data from "./maps.json";

export const maps = data as MapEntity[];

export const mapsByDifficulty = maps.reduce<Record<string, MapEntity[]>>(
  (acc, m) => {
    (acc[m.difficulty] ??= []).push(m);
    return acc;
  },
  {},
);

export function findMap(id: string): MapEntity | undefined {
  return maps.find((m) => m.id === id);
}
`,
  );

  console.log(
    `\nDone. downloaded=${downloaded} skipped=${skipped} failed=${failed} total=${entities.length}`,
  );
  console.log(`Wrote public/images/maps + src/data/maps.{json,ts}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
