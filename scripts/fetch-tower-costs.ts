/**
 * Scrapes Medium-difficulty cash costs from the Bloons Wiki Upgrades page
 * and writes them onto each entity in src/data/towers.json.
 *
 * Source: https://bloons.fandom.com/wiki/Upgrades (prices shown for Medium).
 *
 * Usage: npx tsx scripts/fetch-tower-costs.ts
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TOWERS_JSON = path.join(ROOT, "src", "data", "towers.json");

const API = "https://bloons.fandom.com/api.php";
const USER_AGENT =
  "BloonArcadeAssetBot/1.0 (+local fan project; caches wiki costs offline)";

const TOWER_SECTIONS = [
  { index: 7, category: "Primary" },
  { index: 8, category: "Military" },
  { index: 9, category: "Magic" },
  { index: 10, category: "Support" },
] as const;

type Entity = {
  id: string;
  name: string;
  type: string;
  tower: string;
  category: string;
  path: number | null;
  tier: number;
  image: string;
  sourceFile: string;
  cost?: number;
};

type Cell = { file: string; name: string; cost: number | null };

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
  const inner = raw.replace(/^\[\[/, "").replace(/\]\]$/, "");
  const parts = inner.split("|");
  const label = parts.length > 1 ? parts[parts.length - 1]! : parts[0]!;
  return stripHtml(label).replace(/_/g, " ");
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/\s+/g, " ")
    .trim();
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

async function fetchSectionWikitext(section: number): Promise<string> {
  const data = await apiJson<{ parse: { wikitext: string } }>({
    action: "parse",
    page: "Upgrades",
    section: String(section),
    prop: "wikitext",
    format: "json",
    formatversion: "2",
  });
  return data.parse.wikitext;
}

function extractCellsFromRow(row: string): Cell[] {
  const cells: Cell[] = [];
  const fileRe = /\[\[File:([^|\]]+)(?:\|[^\]]*)?\]\]/gi;
  let m: RegExpExecArray | null;
  while ((m = fileRe.exec(row)) !== null) {
    const file = m[1]!.trim();
    const after = row.slice(m.index + m[0].length);
    const nextFile = after.search(/\[\[File:/i);
    const window = nextFile === -1 ? after : after.slice(0, nextFile);
    const nameM = window.match(/\[\[([^\]]+)\]\]/);
    if (!nameM) continue;
    const costM = window.match(/\$([\d,]+)/);
    cells.push({
      file,
      name: parseWikiLinkLabel(`[[${nameM[1]}]]`),
      cost: costM ? Number(costM[1]!.replace(/,/g, "")) : null,
    });
  }
  return cells;
}

/** tower name (normalized) + entity name (normalized) → medium cash cost */
function scrapeCosts(wikitext: string): Map<string, number> {
  const costs = new Map<string, number>();
  const rows = wikitext
    .split(/\n\|-/)
    .map((r) => r.trim())
    .filter((r) => r.length > 0 && /\[\[File:/i.test(r));

  let currentTower: string | null = null;

  const setCost = (tower: string, name: string, cost: number | null) => {
    if (cost == null || Number.isNaN(cost)) return;
    costs.set(`${normalizeName(tower)}::${normalizeName(name)}`, cost);
  };

  for (const row of rows) {
    const isTowerStart = /rowspan\s*=\s*["']?3["']?/i.test(row);
    const cells = extractCellsFromRow(row);
    if (cells.length === 0) continue;

    if (isTowerStart) {
      currentTower = cells[0]!.name;
      for (const cell of cells) {
        setCost(currentTower, cell.name, cell.cost);
      }
      continue;
    }

    if (!currentTower) continue;
    for (const cell of cells) {
      setCost(currentTower, cell.name, cell.cost);
    }
  }

  return costs;
}

async function main() {
  const merged = new Map<string, number>();
  for (const { index, category } of TOWER_SECTIONS) {
    const wt = await fetchSectionWikitext(index);
    const sectionCosts = scrapeCosts(wt);
    console.log(`${category}: ${sectionCosts.size} priced cells`);
    for (const [k, v] of sectionCosts) merged.set(k, v);
  }

  const raw = await readFile(TOWERS_JSON, "utf8");
  const entities = JSON.parse(raw) as Entity[];

  let matched = 0;
  const missing: string[] = [];
  for (const e of entities) {
    const key = `${normalizeName(e.tower)}::${normalizeName(e.name)}`;
    const cost = merged.get(key);
    if (cost != null) {
      e.cost = cost;
      matched += 1;
    } else {
      missing.push(`${e.id} (${e.tower} / ${e.name})`);
      delete e.cost;
    }
  }

  await writeFile(TOWERS_JSON, `${JSON.stringify(entities, null, 2)}\n`);

  console.log(`\nMatched ${matched}/${entities.length} entities`);
  if (missing.length) {
    console.warn(`Missing costs (${missing.length}):`);
    for (const line of missing) console.warn(`  - ${line}`);
  }
  console.log(`Wrote → ${TOWERS_JSON}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
