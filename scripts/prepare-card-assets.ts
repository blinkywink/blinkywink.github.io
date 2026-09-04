/**
 * Downloads BTD6 Upgrade Icons for a tower (default: Dart Monkey)
 * from https://bloons.fandom.com/wiki/Upgrade_Icons_(BTD6)
 * and extracts accent colors from portrait images.
 *
 * Usage:
 *   npx tsx scripts/prepare-card-assets.ts
 *   npx tsx scripts/prepare-card-assets.ts "Ninja Monkey"
 *   npx tsx scripts/prepare-card-assets.ts --missing-only
 */
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import towers from "../src/data/towers.json" with { type: "json" };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ICONS_DIR = path.join(ROOT, "public", "images", "upgrade-icons");
const ACCENTS_OUT = path.join(ROOT, "src", "data", "cardAccents.json");
const API = "https://bloons.fandom.com/api.php";
const USER_AGENT = "BloonArcadeAssetBot/1.0 (+local fan project)";

type Entity = (typeof towers)[number];

async function apiJson<T>(params: Record<string, string>): Promise<T> {
  const url = new URL(API);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return (await res.json()) as T;
}

function normalizeIconName(name: string): string {
  return name.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "");
}

/** Wiki labels that do not match BTD6 / our dataset names. */
const ICON_NAME_ALIASES: Record<string, string[]> = {
  fastfiring: ["fasterfiring"],
  kylieboomerang: ["kylieboomerangs"],
  necromancerunpoppedarmy: ["necromancer"],
};

/** Direct wiki filenames when the Upgrade Icons table label still misses. */
const ICON_FILE_FALLBACKS: Record<string, string> = {
  "sniper-monkey-31": "FastFiringUpgradeIcon.png",
  "boomerang-monkey-14": "MoarGlaivesUpgradeIcon.png",
  "boomerang-monkey-33": "KylieBoomerangUpgradeIcon.png",
  "wizard-monkey-34": "NecromancerUnpoppedArmyUpgradeIcon.png",
  "spike-factory-35": "Perma-SpikeUpgradeIcon.png",
};

function lookupWikiFile(
  map: Map<string, string>,
  entityName: string,
): string | undefined {
  const lower = entityName.toLowerCase();
  const direct = map.get(lower);
  if (direct) return direct;

  const byNorm = new Map<string, string>();
  for (const [label, file] of map) {
    byNorm.set(normalizeIconName(label), file);
  }
  const n = normalizeIconName(entityName);
  const exactNorm = byNorm.get(n);
  if (exactNorm) return exactNorm;
  for (const alias of ICON_NAME_ALIASES[n] ?? []) {
    const hit = byNorm.get(alias);
    if (hit) return hit;
  }
  return undefined;
}

async function fetchUpgradeIconMap(towerName: string): Promise<Map<string, string>> {
  const data = await apiJson<{ parse: { wikitext: string } }>({
    action: "parse",
    page: "Upgrade_Icons_(BTD6)",
    prop: "wikitext",
    format: "json",
    formatversion: "2",
  });
  const raw = data.parse.wikitext;
  const sectionMatch = raw.match(
    new RegExp(
      `===${towerName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}===(.*?)(?=\\n===|\\n==[^=]|$)`,
      "s",
    ),
  );
  if (!sectionMatch) throw new Error(`Section not found: ${towerName}`);

  const text = sectionMatch[1];
  const map = new Map<string, string>();
  const fileStart = /\[\[file:([^\]|]+)\|/gi;
  let m: RegExpExecArray | null;
  while ((m = fileStart.exec(text))) {
    const file = m[1].trim();
    const contentStart = m.index + m[0].length;
    // Walk nested [[...]] so Paragon cells like
    // [[File:X.webp|thumb|[[Root of All Nature]]]] close correctly.
    let depth = 1;
    let i = contentStart;
    while (i < text.length && depth > 0) {
      if (text[i] === "[" && text[i + 1] === "[") {
        depth += 1;
        i += 2;
        continue;
      }
      if (text[i] === "]" && text[i + 1] === "]") {
        depth -= 1;
        i += 2;
        continue;
      }
      i += 1;
    }
    const inner = text.slice(contentStart, Math.max(contentStart, i - 2));
    const nested = [...inner.matchAll(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g)].at(
      -1,
    );
    let label: string | null = null;
    if (nested) {
      label = (nested[2] ?? nested[1]).trim();
    } else {
      const after = text.slice(i);
      const nextFile = after.search(/\[\[file:/i);
      const nameMatch = after.match(
        /^[\s\S]*?<br\s*\/?>\s*\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/i,
      );
      if (nameMatch) {
        const nameAt = after.search(/<br\s*\/?>\s*\[\[/i);
        if (nextFile === -1 || nameAt < nextFile) {
          label = (nameMatch[2] ?? nameMatch[1]).trim();
        }
      }
    }
    if (label) map.set(label.toLowerCase(), file);
  }
  return map;
}

async function resolveFileUrl(filename: string): Promise<string> {
  const data = await apiJson<{
    query: { pages: Array<{ imageinfo?: Array<{ url: string }> }> };
  }>({
    action: "query",
    titles: `File:${filename}`,
    prop: "imageinfo",
    iiprop: "url",
    format: "json",
    formatversion: "2",
  });
  const url = data.query.pages[0]?.imageinfo?.[0]?.url;
  if (!url) throw new Error(`No url for ${filename}`);
  return url;
}

async function downloadIcon(filename: string, outPath: string) {
  try {
    await access(outPath);
    return;
  } catch {
    // continue
  }
  const url = await resolveFileUrl(filename);
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`download ${filename} ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await sharp(buf)
    .resize(128, 128, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 90 })
    .toFile(outPath);
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}

function saturation(r: number, g: number, b: number) {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  if (max === 0) return 0;
  return (max - min) / max;
}

function hueDeg(r: number, g: number, b: number) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  if (d === 0) return 0;
  let h = 0;
  if (max === rn) h = ((gn - bn) / d) % 6;
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return h;
}

/** Down-rank monkey fur / leather browns so accents come from paint pops. */
function brownPenalty(r: number, g: number, b: number) {
  const h = hueDeg(r, g, b);
  const sat = saturation(r, g, b);
  const lum = (r + g + b) / 3 / 255;
  // Warm orange-brown band that dominates Dart Monkey art
  if (h >= 12 && h <= 55 && sat < 0.72 && lum > 0.12 && lum < 0.7) {
    return 0.12 + sat * 0.2;
  }
  return 1;
}

function vividScore(r: number, g: number, b: number) {
  const sat = saturation(r, g, b);
  const lum = (r + g + b) / 3 / 255;
  // Prefer punchy mid-bright chromas (neither muddy nor near-white)
  const lumSweet = 1 - Math.abs(lum - 0.52) * 1.6;
  const chromaBoost = sat ** 2.4;
  return Math.max(0, chromaBoost * Math.max(0.15, lumSweet) * brownPenalty(r, g, b));
}

function colorDist(
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number },
) {
  return Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b);
}

async function extractAccent(imagePath: string): Promise<{
  primary: string;
  secondary: string;
  colors: string[];
  rgb: [number, number, number];
}> {
  const { data } = await sharp(imagePath)
    .resize(96, 96, { fit: "cover" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  type Bucket = { r: number; g: number; b: number; w: number; peak: number };
  const buckets = new Map<string, Bucket>();

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    const a = data[i + 3]!;
    if (a < 180) continue;
    const lum = (r + g + b) / 3;
    if (lum < 26 || lum > 242) continue;
    const sat = saturation(r, g, b);
    // Ignore muddy / near-grey pixels entirely
    if (sat < 0.28) continue;
    const score = vividScore(r, g, b);
    if (score < 0.02) continue;
    const key = `${Math.round(r / 18)}-${Math.round(g / 18)}-${Math.round(b / 18)}`;
    const prev = buckets.get(key) ?? { r: 0, g: 0, b: 0, w: 0, peak: 0 };
    // Weight by vividness only - not pixel mass - so rare brights win
    const weight = score * score;
    prev.r += r * weight;
    prev.g += g * weight;
    prev.b += b * weight;
    prev.w += weight;
    prev.peak = Math.max(prev.peak, score);
    buckets.set(key, prev);
  }

  const ranked = [...buckets.values()]
    .map((b) => {
      const r = Math.round(b.r / b.w);
      const g = Math.round(b.g / b.w);
      const bch = Math.round(b.b / b.w);
      return {
        r,
        g,
        b: bch,
        w: b.w,
        sat: saturation(r, g, bch),
        score: vividScore(r, g, bch) * (0.55 + b.peak),
      };
    })
    .sort((a, b) => b.score - a.score || b.sat - a.sat);

  const picked: { r: number; g: number; b: number }[] = [];
  for (const c of ranked) {
    if (c.sat < 0.32) continue;
    if (picked.every((p) => colorDist(p, c) > 65)) {
      picked.push({ r: c.r, g: c.g, b: c.b });
    }
    if (picked.length >= 4) break;
  }

  // Fall back: allow slightly less strict picks if image is mostly neutral
  if (picked.length < 2) {
    for (const c of ranked) {
      if (picked.every((p) => colorDist(p, c) > 50)) {
        picked.push({ r: c.r, g: c.g, b: c.b });
      }
      if (picked.length >= 2) break;
    }
  }

  while (picked.length < 2) {
    const base = picked[0] ?? { r: 47, g: 159, b: 224 };
    picked.push({
      r: Math.min(255, base.r + 45),
      g: Math.min(255, base.g + 20),
      b: Math.min(255, base.b + 35),
    });
  }

  while (picked.length < 4) {
    const base = picked[picked.length % 2]!;
    const t = picked.length;
    picked.push({
      r: Math.max(0, Math.min(255, base.r + (t % 2 ? 35 : -20))),
      g: Math.max(0, Math.min(255, base.g + (t % 3 ? -15 : 40))),
      b: Math.max(0, Math.min(255, base.b + (t % 2 ? 45 : -10))),
    });
  }

  const top = picked[0]!;
  const second = picked[1]!;

  return {
    primary: rgbToHex(top.r, top.g, top.b),
    secondary: rgbToHex(second.r, second.g, second.b),
    colors: picked.map((c) => rgbToHex(c.r, c.g, c.b)),
    rgb: [top.r, top.g, top.b],
  };
}

async function prepareTower(towerName: string) {
  const iconFiles = await fetchUpgradeIconMap(towerName);
  console.log(`Found ${iconFiles.size} icons for ${towerName}`);

  const entities = (towers as Entity[]).filter((e) => e.tower === towerName);
  const accents: Record<
    string,
    {
      primary: string;
      secondary: string;
      colors: string[];
      rgb: [number, number, number];
      icon: string | null;
    }
  > = {};

  for (const entity of entities) {
    const file =
      lookupWikiFile(iconFiles, entity.name) ?? ICON_FILE_FALLBACKS[entity.id];
    let iconPath: string | null = null;
    if (file) {
      const slug = entity.id;
      const out = path.join(ICONS_DIR, `${slug}.webp`);
      try {
        await downloadIcon(file, out);
        iconPath = `/images/upgrade-icons/${slug}.webp`;
        console.log(`icon ✓ ${entity.name}`);
      } catch (e) {
        console.warn(`icon ✗ ${entity.name}`, e);
      }
    } else {
      const portraitAbs = path.join(
        ROOT,
        "public",
        entity.image.replace(/^\//, ""),
      );
      const out = path.join(ICONS_DIR, `${entity.id}.webp`);
      try {
        await access(portraitAbs);
        await sharp(portraitAbs)
          .resize(128, 128, {
            fit: "contain",
            background: { r: 0, g: 0, b: 0, alpha: 0 },
          })
          .webp({ quality: 90 })
          .toFile(out);
        iconPath = `/images/upgrade-icons/${entity.id}.webp`;
        console.warn(`icon portrait-fallback ${entity.name}`);
      } catch {
        console.warn(`no wiki icon match for ${entity.name}`);
      }
    }

    const portraitAbs = path.join(ROOT, "public", entity.image.replace(/^\//, ""));
    try {
      const accent = await extractAccent(portraitAbs);
      accents[entity.id] = { ...accent, icon: iconPath };
      console.log(`color ✓ ${entity.name} ${accent.primary}`);
    } catch (e) {
      console.warn(`color ✗ ${entity.name}`, e);
      accents[entity.id] = {
        primary: "#2f9fe0",
        secondary: "#ffd23f",
        colors: ["#2f9fe0", "#ffd23f", "#7cf0c0", "#ff6b9d"],
        rgb: [47, 159, 224],
        icon: iconPath,
      };
    }
  }

  return accents;
}

async function iconOnDisk(id: string): Promise<boolean> {
  try {
    await access(path.join(ICONS_DIR, `${id}.webp`));
    return true;
  } catch {
    return false;
  }
}

async function fillMissingIcons() {
  await mkdir(ICONS_DIR, { recursive: true });
  const accents = JSON.parse(await readFile(ACCENTS_OUT, "utf8")) as Record<
    string,
    { icon?: string | null }
  >;
  const byTower = new Map<string, Entity[]>();
  for (const entity of towers as Entity[]) {
    if (await iconOnDisk(entity.id)) continue;
    const list = byTower.get(entity.tower) ?? [];
    list.push(entity);
    byTower.set(entity.tower, list);
  }

  for (const [tower, ents] of byTower) {
    let map = new Map<string, string>();
    try {
      map = await fetchUpgradeIconMap(tower);
    } catch (e) {
      console.warn(`wiki section ${tower}`, e);
    }
    for (const entity of ents) {
      const file =
        lookupWikiFile(map, entity.name) ?? ICON_FILE_FALLBACKS[entity.id];
      const out = path.join(ICONS_DIR, `${entity.id}.webp`);
      try {
        if (file) {
          await downloadIcon(file, out);
        } else {
          const portraitAbs = path.join(
            ROOT,
            "public",
            entity.image.replace(/^\//, ""),
          );
          await sharp(portraitAbs)
            .resize(128, 128, {
              fit: "contain",
              background: { r: 0, g: 0, b: 0, alpha: 0 },
            })
            .webp({ quality: 90 })
            .toFile(out);
          console.warn(`icon portrait-fallback ${entity.name}`);
        }
        const icon = `/images/upgrade-icons/${entity.id}.webp`;
        if (accents[entity.id]) accents[entity.id].icon = icon;
        console.log(`filled ${entity.id} (${entity.name})`);
      } catch (e) {
        console.warn(`fail ${entity.id}`, e);
      }
    }
  }

  await writeFile(ACCENTS_OUT, `${JSON.stringify(accents, null, 2)}\n`);
}

async function main() {
  await mkdir(ICONS_DIR, { recursive: true });

  if (process.argv.includes("--missing-only")) {
    await fillMissingIcons();
    return;
  }

  const arg = process.argv[2] ?? "Dart Monkey";
  const towerNames =
    arg.toLowerCase() === "all"
      ? [
          ...new Set(
            (towers as Entity[])
              .filter((e) => e.type === "tower")
              .map((e) => e.tower),
          ),
        ]
      : [arg];

  let existing: Record<string, unknown> = {};
  try {
    const raw = await readFile(ACCENTS_OUT, "utf8");
    existing = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    existing = {};
  }

  const merged = { ...existing } as Awaited<ReturnType<typeof prepareTower>>;

  for (const name of towerNames) {
    console.log(`\n-- ${name} --`);
    try {
      const next = await prepareTower(name);
      Object.assign(merged, next);
      // Persist after each tower so the app can use icons/colors mid-run
      await writeFile(ACCENTS_OUT, `${JSON.stringify(merged, null, 2)}\n`);
      console.log(`saved ${Object.keys(merged).length} accents`);
    } catch (e) {
      console.warn(`skip ${name}`, e);
    }
  }

  console.log(`\nWrote ${Object.keys(merged).length} accents → ${ACCENTS_OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
