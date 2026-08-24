/**
 * Downloads BTD6 hero portraits (levels 1/3/7/10/20) + Medium costs
 * and writes a local dataset.
 *
 * Source: https://bloons.fandom.com/wiki/Heroes_(BTD6)
 *
 * Usage: npx tsx scripts/download-btd6-heroes.ts
 *        npx tsx scripts/download-btd6-heroes.ts --force
 */

import { access, mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PUBLIC_HEROES = path.join(ROOT, "public", "images", "heroes");
const DATA_DIR = path.join(ROOT, "src", "data");

const API = "https://bloons.fandom.com/api.php";
const USER_AGENT =
  "BloonArcadeAssetBot/1.0 (+local fan project; caches wiki heroes offline)";

const OUTPUT_SIZE = 768;
const FORCE = process.argv.includes("--force");
const PORTRAIT_STAGES = [1, 3, 7, 10, 20] as const;

type HeroCosts = {
  easy: number | null;
  medium: number;
  hard: number | null;
  impoppable: number | null;
};

type HeroPortraits = Record<"1" | "3" | "7" | "10" | "20", string>;

type HeroEntity = {
  id: string;
  name: string;
  title: string;
  description: string;
  costs: HeroCosts;
  cost: number;
  image: string;
  sourceFile: string;
  portraits: HeroPortraits;
  unlock: string;
  levelSpeed: number;
  isAltForm?: boolean;
  baseHeroId?: string;
};

type HeroSeed = {
  id: string;
  name: string;
  title: string;
  description: string;
  sourceFile: string;
  unlock: string;
  levelSpeed: number;
  mediumCost: number;
  isAltForm?: boolean;
  baseHeroId?: string;
};

const HEROES: HeroSeed[] = [
  {
    id: "quincy",
    name: "Quincy",
    title: "the Archer",
    description:
      "Proud, strong and intelligent, Quincy uses his bow to perform feats of amazing skill.",
    sourceFile: "QuincyPortrait.png",
    unlock: "During tutorial",
    levelSpeed: 1.0,
    mediumCost: 540,
  },
  {
    id: "gwendolin",
    name: "Gwendolin",
    title: "the Pyromaniac",
    description:
      "Gwendolin believes there hasn't yet been a Bloon problem that can't be solved with fire. Lots of fire.",
    sourceFile: "GwendolinPortrait.png",
    unlock: "Level 14+",
    levelSpeed: 1.0,
    mediumCost: 725,
  },
  {
    id: "striker-jones",
    name: "Striker Jones",
    title: "the Artillery Commander",
    description:
      "Striker Jones is a strong Commander who uses his knowledge of long range combat to greatly boost the power of explosives.",
    sourceFile: "StrikerJonesPortrait.png",
    unlock: "Level 21+",
    levelSpeed: 1.0,
    mediumCost: 700,
  },
  {
    id: "obyn-greenfoot",
    name: "Obyn Greenfoot",
    title: "the Forest Guardian",
    description:
      "Commanding powers of nature, Obyn can shoot through solid obstacles with his spirit wolf attack.",
    sourceFile: "ObynGreenFootPortrait.png",
    unlock: "Level 28+",
    levelSpeed: 1.0,
    mediumCost: 650,
  },
  {
    id: "captain-churchill",
    name: "Captain Churchill",
    title: "the Tank",
    description:
      "In his armored tank, the Captain is a no-nonsense powerhouse on the battlefield.",
    sourceFile: "CaptainChurchillPortrait.png",
    unlock: "Level 15+ and Monkey Money 2500",
    levelSpeed: 1.71,
    mediumCost: 2000,
  },
  {
    id: "benjamin",
    name: "Benjamin",
    title: "the Code Monkey",
    description:
      "Using his elite hacking skills, Benjamin can create extra money for the cause.",
    sourceFile: "BenjaminPortrait.png",
    unlock: "Level 15+ and Monkey Money 3000",
    levelSpeed: 1.5,
    mediumCost: 1200,
  },
  {
    id: "ezili",
    name: "Ezili",
    title: "the Voodoo Monkey",
    description: "Ezili is a wielder of dark arts and manipulator of Bloons. Beware.",
    sourceFile: "EziliPortrait.png",
    unlock: "Level 25+ and Monkey Money 3000",
    levelSpeed: 1.425,
    mediumCost: 600,
  },
  {
    id: "pat-fusty",
    name: "Pat Fusty",
    title: "the Giant Monkey",
    description:
      "Pat is a huge monkey of enormous strength. His unique size and power is a great asset in the war on Bloons.",
    sourceFile: "PatFustyPortrait.png",
    unlock: "Level 15+ and Monkey Money 3000",
    levelSpeed: 1.425,
    mediumCost: 800,
  },
  {
    id: "adora",
    name: "Adora",
    title: "the High Priestess",
    description:
      "Adora's devotion compels her to strike Bloons down with furious vengeance.",
    sourceFile: "AdoraPortrait.png",
    unlock: "Level 25+ and Monkey Money 5000",
    levelSpeed: 1.71,
    mediumCost: 1000,
  },
  {
    id: "admiral-brickell",
    name: "Admiral Brickell",
    title: "the Naval Commander",
    description:
      "Command all your water-based Monkeys to decisive victory. Requires water to place.",
    sourceFile: "AdmiralBrickellPortrait.png",
    unlock: "Level 35+ and Monkey Money 5000",
    levelSpeed: 1.425,
    mediumCost: 900,
  },
  {
    id: "etienne",
    name: "Etienne",
    title: "the Drone Operator",
    description:
      "This high-tech hero can pursue the Bloons wherever they go with his remote-controlled drone.",
    sourceFile: "EtiennePortrait.png",
    unlock: "Level 25+ and Monkey Money 5000",
    levelSpeed: 1.0,
    mediumCost: 850,
  },
  {
    id: "sauda",
    name: "Sauda",
    title: "the Swordmaster",
    description:
      "With a calm fury, Sauda can carve Bloons up with her twin razor-sharp swords.",
    sourceFile: "SaudaPortrait.png",
    unlock: "Level 25+ and Monkey Money 5000",
    levelSpeed: 1.425,
    mediumCost: 600,
  },
  {
    id: "psi",
    name: "Psi",
    title: "the Psionic Monkey",
    description:
      "A gifted monkey child, Psi uses only the power of the mind to destroy Bloons from the inside out.",
    sourceFile: "PsiPortrait.png",
    unlock: "Level 35+ and Monkey Money 5000",
    levelSpeed: 1.5,
    mediumCost: 1000,
  },
  {
    id: "geraldo",
    name: "Geraldo",
    title: "the Mystic Shopkeeper",
    description:
      "Geraldo the shopkeeper sells a selection of useful items and zaps Bloons with his lightning attack.",
    sourceFile: "GeraldoPortrait.png",
    unlock: "Level 35+ and Monkey Money 7000",
    levelSpeed: 1.0,
    mediumCost: 750,
  },
  {
    id: "corvus",
    name: "Corvus",
    title: "the Spirit Walker",
    description:
      "Corvus works well on the frontline, weakening nearby Bloons to harvest Mana and channel powerful energies through his Spirit companion.",
    sourceFile: "CorvusPortrait.png",
    unlock: "Level 35+ and Monkey Money 7000",
    levelSpeed: 1.425,
    mediumCost: 1025,
  },
  {
    id: "rosalia",
    name: "Rosalia",
    title: "the Tinkerer",
    description:
      "Rosalia can reposition in a moment with her jetpack and brings the firepower with her laser, grenade launcher and missiles.",
    sourceFile: "RosaliaPortrait.png",
    unlock: "Level 25+ and Monkey Money 5000",
    levelSpeed: 1.425,
    mediumCost: 875,
  },
  {
    id: "silas",
    name: "Silas",
    title: "the Ice Shaper",
    description:
      "Silas developed his calm demeanor surviving alone in harsh conditions. Commands the power of ice and boosts the power of ice attacks. Can be placed on land or water.",
    sourceFile: "SilasPortrait.png",
    unlock: "Level 25+ and Monkey Money 5000",
    levelSpeed: 1.5,
    mediumCost: 850,
  },
  {
    id: "dan-dmonke",
    name: "Dan D'Monke",
    title: "the Courtly Monkey",
    description:
      "Dan D'Monke flourishes his blade with style and sophistication.",
    sourceFile: "DanDMonkePortrait.png",
    unlock: "Monkey Money 7000",
    levelSpeed: 1.425,
    mediumCost: 650,
  },
  {
    id: "masqued-macaque",
    name: "Masqued Macaque",
    title: "the Courtly Monkey",
    description:
      "The Masqued Macaque is a daring and dashing rouge. A master of swordplay and certainly of no relation to Dan D'Monke!",
    sourceFile: "MasquedMacaquePortraitLvl3.png",
    unlock: "Monkey Money 7000",
    levelSpeed: 1.425,
    mediumCost: 650,
    isAltForm: true,
    baseHeroId: "dan-dmonke",
  },
];

function portraitSourceFile(baseFile: string, stage: number): string {
  const stem = baseFile.replace(/\.png$/i, "").replace(/Lvl\d+$/i, "");
  if (stage <= 1) return `${stem}.png`;
  return `${stem}Lvl${stage}.png`;
}

async function apiJson<T>(params: Record<string, string>): Promise<T> {
  const url = new URL(API);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`API ${res.status} for ${url}`);
  return (await res.json()) as T;
}

async function resolveImageUrls(files: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const batchSize = 40;
  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize);
    const titles = batch.map((f) => `File:${f}`).join("|");
    const data = await apiJson<{
      query: {
        pages: Array<{
          title: string;
          missing?: boolean;
          imageinfo?: Array<{ url: string }>;
        }>;
      };
    }>({
      action: "query",
      titles,
      prop: "imageinfo",
      iiprop: "url",
      format: "json",
      formatversion: "2",
    });

    for (const page of data.query.pages) {
      if (page.missing) continue;
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

async function downloadAndUpscale(
  url: string,
  dest: string,
): Promise<"wrote" | "skipped"> {
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
      // ok
    }
  }

  let lastErr: unknown;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "image/*" },
      });
      if (!res.ok) throw new Error(`Download failed ${res.status}: ${url}`);
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

async function main() {
  const allFiles = [
    ...new Set(
      HEROES.flatMap((h) =>
        PORTRAIT_STAGES.map((stage) => portraitSourceFile(h.sourceFile, stage)),
      ),
    ),
  ];
  console.log(`Resolving ${allFiles.length} hero portrait URLs…`);
  const urls = await resolveImageUrls(allFiles);

  const entities: HeroEntity[] = [];
  let wrote = 0;
  let skipped = 0;

  for (const hero of HEROES) {
    const portraits = {} as HeroPortraits;
    let lastPath: string | null = null;

    for (const stage of PORTRAIT_STAGES) {
      const file = portraitSourceFile(hero.sourceFile, stage);
      const url = urls.get(file) ?? urls.get(file.toLowerCase());
      const destRel = `/images/heroes/${hero.id}/lvl${stage}.webp`;
      const dest = path.join(PUBLIC_HEROES, hero.id, `lvl${stage}.webp`);

      if (url) {
        const status = await downloadAndUpscale(url, dest);
        if (status === "wrote") {
          wrote += 1;
          console.log(`  + ${hero.name} L${stage}`);
        } else {
          skipped += 1;
        }
        lastPath = destRel;
        portraits[String(stage) as keyof HeroPortraits] = destRel;
      } else if (lastPath) {
        console.warn(`  ! missing ${file} - using previous stage`);
        portraits[String(stage) as keyof HeroPortraits] = lastPath;
      } else {
        console.warn(`  ! missing ${file} and no fallback`);
      }
    }

    if (!portraits["1"]) {
      console.warn(`  ! skip ${hero.name} - no L1 portrait`);
      continue;
    }

    // Fill any gaps with L1
    for (const stage of PORTRAIT_STAGES) {
      const key = String(stage) as keyof HeroPortraits;
      portraits[key] ??= portraits["1"];
    }

    // Flat alias for L1 (legacy paths)
    const flatAlias = path.join(PUBLIC_HEROES, `${hero.id}.webp`);
    const lvl1Abs = path.join(PUBLIC_HEROES, hero.id, "lvl1.webp");
    try {
      await access(lvl1Abs);
      if (FORCE) {
        try {
          await unlink(flatAlias);
        } catch {
          // ok
        }
      }
      try {
        await access(flatAlias);
      } catch {
        const { copyFile } = await import("node:fs/promises");
        await copyFile(lvl1Abs, flatAlias);
      }
    } catch {
      // ignore
    }

    entities.push({
      id: hero.id,
      name: hero.name,
      title: hero.title,
      description: hero.description,
      costs: {
        easy: null,
        medium: hero.mediumCost,
        hard: null,
        impoppable: null,
      },
      cost: hero.mediumCost,
      image: portraits["1"],
      sourceFile: hero.sourceFile,
      portraits,
      unlock: hero.unlock,
      levelSpeed: hero.levelSpeed,
      ...(hero.isAltForm
        ? { isAltForm: true, baseHeroId: hero.baseHeroId }
        : {}),
    });
  }

  await mkdir(DATA_DIR, { recursive: true });
  const jsonPath = path.join(DATA_DIR, "heroes.json");
  await writeFile(jsonPath, `${JSON.stringify(entities, null, 2)}\n`, "utf8");

  const tsPath = path.join(DATA_DIR, "heroes.ts");
  await writeFile(
    tsPath,
    `/* Auto-generated by scripts/download-btd6-heroes.ts - do not edit by hand */
export type HeroCosts = {
  easy: number | null;
  medium: number;
  hard: number | null;
  impoppable: number | null;
};

export type HeroPortraitStage = 1 | 3 | 7 | 10 | 20;

export type HeroPortraits = Record<"1" | "3" | "7" | "10" | "20", string>;

export type HeroEntity = {
  id: string;
  name: string;
  title: string;
  description: string;
  costs: HeroCosts;
  cost: number;
  image: string;
  sourceFile: string;
  portraits: HeroPortraits;
  unlock: string;
  levelSpeed: number;
  isAltForm?: boolean;
  baseHeroId?: string;
};

import data from "./heroes.json";

export const heroEntities = data as HeroEntity[];

/** Base roster (excludes alt forms like Masqued Macaque). */
export const heroes = heroEntities.filter((h) => !h.isAltForm);

/** Portrait path for an in-game hero level (1-20). */
export function heroPortraitForLevel(
  hero: HeroEntity,
  level: number,
): string {
  const n = Math.max(1, Math.min(20, Math.floor(level) || 1));
  if (n >= 20) return hero.portraits["20"] ?? hero.image;
  if (n >= 10) return hero.portraits["10"] ?? hero.image;
  if (n >= 7) return hero.portraits["7"] ?? hero.image;
  if (n >= 3) return hero.portraits["3"] ?? hero.image;
  return hero.portraits["1"] ?? hero.image;
}

export function heroById(id: string): HeroEntity | null {
  return heroEntities.find((h) => h.id === id) ?? null;
}
`,
    "utf8",
  );

  console.log(
    `\nDone. ${entities.length} heroes · ${wrote} downloaded · ${skipped} cached`,
  );
  console.log(`Wrote ${path.relative(ROOT, jsonPath)}`);
  console.log(`Wrote ${path.relative(ROOT, tsPath)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
