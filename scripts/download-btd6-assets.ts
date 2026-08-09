/**
 * Downloads BTD6 Monkey Tower + upgrade images from the Bloons Wiki Upgrades page
 * and regenerates the local dataset.
 *
 * Source: https://bloons.fandom.com/wiki/Upgrades
 * Sections: Primary / Military / Magic / Support Monkeys only.
 * Excludes: Heroes, Pro Powers, and all non-BTD6 content.
 *
 * Usage: npm run download-assets
 */

import { mkdir, writeFile, access, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PUBLIC_TOWERS = path.join(ROOT, "public", "images", "towers");
const DATA_DIR = path.join(ROOT, "src", "data");

const API = "https://bloons.fandom.com/api.php";
const USER_AGENT =
  "BloonArcadeAssetBot/1.0 (+local fan project; caches wiki icons offline)";

/** BTD6 tower upgrade table sections — Heroes (11) intentionally omitted */
const TOWER_SECTIONS = [
  { index: 7, category: "Primary" },
  { index: 8, category: "Military" },
  { index: 9, category: "Magic" },
  { index: 10, category: "Support" },
] as const;

/** Target longest edge after sharp upscale (illustration-friendly). */
const OUTPUT_SIZE = 768;
const FORCE = process.argv.includes("--force");

export type TowerEntity = {
  id: string;
  name: string;
  type: "tower" | "upgrade" | "paragon";
  tower: string;
  category: string;
  path: number | null;
  tier: number;
  image: string;
  sourceFile: string;
};

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function stripHtml(input: string): string {
  return input
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .trim();
}

function parseWikiLinkLabel(raw: string): string {
  // [[Page|Label]] or [[Page]]
  const inner = raw.replace(/^\[\[/, "").replace(/\]\]$/, "");
  const parts = inner.split("|");
  const label = parts.length > 1 ? parts[parts.length - 1] : parts[0];
  return stripHtml(label).replace(/_/g, " ");
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

async function fetchSectionWikitext(section: number): Promise<string> {
  const data = await apiJson<{
    parse: { wikitext: string };
  }>({
    action: "parse",
    page: "Upgrades",
    section: String(section),
    prop: "wikitext",
    format: "json",
    formatversion: "2",
  });
  return data.parse.wikitext;
}

type Cell = { file: string; name: string };

function extractCellsFromRow(row: string): Cell[] {
  const cells: Cell[] = [];
  // Match File followed soon by a wiki link (name)
  const re =
    /\[\[File:([^|\]]+)(?:\|[^\]]*)?\]\][\s\S]*?\[\[([^\]]+)\]\]/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(row)) !== null) {
    cells.push({
      file: m[1].trim(),
      name: parseWikiLinkLabel(`[[${m[2]}]]`),
    });
  }
  return cells;
}

function parseCategoryTable(
  wikitext: string,
  category: string,
): TowerEntity[] {
  const entities: TowerEntity[] = [];
  // Split into table rows
  const rows = wikitext
    .split(/\n\|-/)
    .map((r) => r.trim())
    .filter((r) => r.length > 0 && /\[\[File:/i.test(r));

  let currentTower: string | null = null;
  let pathIndex = 0; // 1..3
  let usedIds = new Set<string>();

  const pushUnique = (entity: TowerEntity) => {
    let id = entity.id;
    let n = 2;
    while (usedIds.has(id)) {
      id = `${entity.id}-${n++}`;
    }
    usedIds.add(id);
    entities.push({ ...entity, id });
  };

  for (const row of rows) {
    const isTowerStart = /rowspan\s*=\s*["']?3["']?/i.test(row);
    const cells = extractCellsFromRow(row);
    if (cells.length === 0) continue;

    if (isTowerStart) {
      currentTower = cells[0].name;
      pathIndex = 1;
      const towerSlug = slugify(currentTower);
      const base = cells[0];
      pushUnique({
        id: `${towerSlug}-000`,
        name: currentTower,
        type: "tower",
        tower: currentTower,
        category,
        path: null,
        tier: 0,
        image: `/images/towers/${towerSlug}/${slugify(base.name)}.webp`,
        sourceFile: base.file,
      });

      // Path 1 upgrades: cells 1..5, optional paragon at 6
      const upgrades = cells.slice(1);
      let tier = 1;
      for (const cell of upgrades) {
        const isParagon = /paragon/i.test(cell.file) || tier > 5;
        if (isParagon) {
          pushUnique({
            id: `${towerSlug}-paragon`,
            name: cell.name,
            type: "paragon",
            tower: currentTower,
            category,
            path: null,
            tier: 6,
            image: `/images/towers/${towerSlug}/${slugify(cell.name)}.webp`,
            sourceFile: cell.file,
          });
        } else {
          pushUnique({
            id: `${towerSlug}-${pathIndex}${tier}`,
            name: cell.name,
            type: "upgrade",
            tower: currentTower,
            category,
            path: pathIndex,
            tier,
            image: `/images/towers/${towerSlug}/${slugify(cell.name)}.webp`,
            sourceFile: cell.file,
          });
          tier++;
        }
      }
      continue;
    }

    // Continuation path rows (path 2 / 3)
    if (!currentTower) continue;
    pathIndex++;
    if (pathIndex > 3) {
      // Unexpected row; reset
      continue;
    }

    let tier = 1;
    for (const cell of cells) {
      if (/paragon/i.test(cell.file)) {
        // Paragon only appears on tower-start rows
        continue;
      }
      const towerSlug = slugify(currentTower);
      pushUnique({
        id: `${towerSlug}-${pathIndex}${tier}`,
        name: cell.name,
        type: "upgrade",
        tower: currentTower,
        category,
        path: pathIndex,
        tier,
        image: `/images/towers/${towerSlug}/${slugify(cell.name)}.webp`,
        sourceFile: cell.file,
      });
      tier++;
      if (tier > 5) break;
    }
  }

  return entities;
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
        pages: Record<
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

    for (const page of pages as Array<{
      title: string;
      missing?: boolean;
      imageinfo?: Array<{ url: string }>;
    }>) {
      const fileName = page.title.replace(/^File:/i, "");
      const url = page.imageinfo?.[0]?.url;
      if (!url) {
        console.warn(`  ! missing imageinfo for ${fileName}`);
        continue;
      }
      // Use full-resolution wiki originals — we upscale locally with sharp
      map.set(fileName, url);
      map.set(fileName.toLowerCase(), url);
    }
  }

  return map;
}

/**
 * Upscale flat illustration art while preserving hard edges.
 * Lanczos enlarge + light unsharp mask beats muddy browser bilinear zoom.
 */
async function upscaleIllustration(buf: Buffer): Promise<Buffer> {
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
      sigma: 0.9,
      m1: 0.6,
      m2: 0.35,
      x1: 2,
      y2: 8,
      y3: 18,
    })
    .webp({ quality: 95, alphaQuality: 100, effort: 4 })
    .toBuffer();
}

async function downloadAndUpscale(url: string, dest: string): Promise<"wrote" | "skipped"> {
  if (!FORCE) {
    try {
      await access(dest);
      return "skipped";
    } catch {
      // continue
    }
  } else {
    try {
      await unlink(dest);
    } catch {
      // ok if missing
    }
  }

  let lastErr: unknown;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "image/*" },
      });
      if (!res.ok) {
        throw new Error(`Download failed ${res.status}: ${url}`);
      }
      const raw = Buffer.from(await res.arrayBuffer());
      const polished = await upscaleIllustration(raw);
      await mkdir(path.dirname(dest), { recursive: true });
      await writeFile(dest, polished);
      return "wrote";
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 400 * attempt));
    }
  }
  throw lastErr;
}
function assertNoHeroes(entities: TowerEntity[]) {
  const heroNames = [
    "quincy",
    "gwendolin",
    "striker jones",
    "obyn",
    "churchill",
    "benjamin",
    "ezili",
    "pat fusty",
    "adora",
    "brickell",
    "etienne",
    "sauda",
    "psi",
    "geraldo",
    "corvus",
    "rosalia",
  ];
  const offenders = entities.filter((e) =>
    heroNames.some(
      (h) =>
        e.name.toLowerCase().includes(h) ||
        e.tower.toLowerCase().includes(h),
    ),
  );
  if (offenders.length) {
    throw new Error(
      `Hero entities leaked into dataset: ${offenders
        .map((o) => o.name)
        .join(", ")}`,
    );
  }
}

async function main() {
  console.log("BTD6 asset pipeline — Monkey Towers only (no Heroes)");
  console.log(
    `Upscale target: ${OUTPUT_SIZE}px · force=${FORCE ? "yes" : "no"}\n`,
  );

  const all: TowerEntity[] = [];

  for (const section of TOWER_SECTIONS) {
    console.log(`Parsing section ${section.index}: ${section.category}…`);
    const wt = await fetchSectionWikitext(section.index);
    const entities = parseCategoryTable(wt, section.category);
    console.log(`  → ${entities.length} entities`);
    all.push(...entities);
  }

  assertNoHeroes(all);

  const uniqueFiles = [...new Set(all.map((e) => e.sourceFile))];
  console.log(`\nResolving ${uniqueFiles.length} image URLs…`);
  const urlMap = await resolveImageUrls(uniqueFiles);

  console.log("Downloading + upscaling images…");
  let downloaded = 0;
  let skipped = 0;
  let failed = 0;

  const queue = [...all];
  const concurrency = 8;

  async function worker() {
    while (queue.length) {
      const entity = queue.shift();
      if (!entity) return;
      const url =
        urlMap.get(entity.sourceFile) ??
        urlMap.get(entity.sourceFile.toLowerCase());
      if (!url) {
        console.warn(`  ! no URL for ${entity.sourceFile} (${entity.name})`);
        failed++;
        continue;
      }
      const dest = path.join(ROOT, "public", entity.image);
      try {
        const result = await downloadAndUpscale(url, dest);
        if (result === "skipped") skipped++;
        else downloaded++;
        const done = downloaded + skipped + failed;
        if (done % 25 === 0) {
          console.log(`  … ${done}/${all.length}`);
        }
      } catch (err) {
        console.warn(`  ! download failed for ${entity.name}:`, err);
        failed++;
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  // Drop entities whose image file is missing
  const withImages: TowerEntity[] = [];
  for (const entity of all) {
    const dest = path.join(ROOT, "public", entity.image);
    const ok = await access(dest)
      .then(() => true)
      .catch(() => false);
    if (ok) withImages.push(entity);
  }

  await mkdir(DATA_DIR, { recursive: true });
  await mkdir(PUBLIC_TOWERS, { recursive: true });

  const jsonPath = path.join(DATA_DIR, "towers.json");
  await writeFile(jsonPath, JSON.stringify(withImages, null, 2) + "\n");

  const tsPath = path.join(DATA_DIR, "towers.ts");
  await writeFile(
    tsPath,
    `/* Auto-generated by scripts/download-btd6-assets.ts — do not edit by hand */\n` +
      `import type { TowerEntity } from "./types";\n` +
      `import data from "./towers.json";\n\n` +
      `export const towerEntities = data as TowerEntity[];\n\n` +
      `export const towers = towerEntities.filter((e) => e.type === "tower");\n` +
      `export const upgrades = towerEntities.filter((e) => e.type === "upgrade" || e.type === "paragon");\n` +
      `export const byTower = towerEntities.reduce<Record<string, TowerEntity[]>>((acc, e) => {\n` +
      `  (acc[e.tower] ??= []).push(e);\n` +
      `  return acc;\n` +
      `}, {});\n`,
  );

  const towers = withImages.filter((e) => e.type === "tower");
  const upgrades = withImages.filter((e) => e.type === "upgrade");
  const paragons = withImages.filter((e) => e.type === "paragon");

  console.log("\nDone.");
  console.log(`  Towers:   ${towers.length}`);
  console.log(`  Upgrades: ${upgrades.length}`);
  console.log(`  Paragons: ${paragons.length}`);
  console.log(`  Total:    ${withImages.length}`);
  console.log(`  Downloaded/upscaled: ${downloaded}, cached: ${skipped}, failed: ${failed}`);
  console.log(`  Dataset → src/data/towers.json`);
  if (!FORCE && skipped > 0) {
    console.log(`  Tip: re-run with --force to rebuild sharper upscales.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
