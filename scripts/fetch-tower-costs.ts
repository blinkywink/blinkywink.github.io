/**
 * Pulls Medium-difficulty cash costs from Blooncyclopedia (bloonswiki.com) Cargo
 * tables and writes them onto each entity in src/data/towers.json.
 *
 * Source of truth: Blooncyclopedia Cargo (`btd6_towers` / `btd6_upgrades`).
 * https://www.bloonswiki.com/
 *
 * Usage: npm run fetch-tower-costs
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TOWERS_JSON = path.join(ROOT, "src", "data", "towers.json");

const API = "https://www.bloonswiki.com/api.php";
const USER_AGENT =
  "BloonArcadeAssetBot/1.0 (+local fan project; caches wiki costs offline)";

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

type CargoRow = Record<string, string>;

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function cargoQuery(
  tables: string,
  fields: string,
  opts: { where?: string; orderBy?: string; limit?: number } = {},
): Promise<CargoRow[]> {
  const rows: CargoRow[] = [];
  const limit = opts.limit ?? 500;
  let offset = 0;

  while (true) {
    const url = new URL(API);
    url.searchParams.set("action", "cargoquery");
    url.searchParams.set("tables", tables);
    url.searchParams.set("fields", fields);
    if (opts.where) url.searchParams.set("where", opts.where);
    if (opts.orderBy) url.searchParams.set("order_by", opts.orderBy);
    url.searchParams.set("limit", String(Math.min(limit, 500)));
    url.searchParams.set("offset", String(offset));
    url.searchParams.set("format", "json");

    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`Cargo API ${res.status} for ${url}`);
    const data = (await res.json()) as {
      cargoquery?: { title: CargoRow }[];
      error?: { info?: string };
    };
    if (data.error?.info) throw new Error(data.error.info);
    const batch = data.cargoquery ?? [];
    for (const item of batch) rows.push(item.title);
    if (batch.length < Math.min(limit, 500)) break;
    offset += batch.length;
  }

  return rows;
}

function parseCost(raw: string | undefined): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(String(raw).replace(/,/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

async function main() {
  const towerRows = await cargoQuery("btd6_towers", "name,cost", { limit: 100 });
  const upgradeRows = await cargoQuery(
    "btd6_upgrades",
    "tower,path,tier,name,cost",
    {
      where: "unused = 0",
      orderBy: "tower,path,tier",
      limit: 500,
    },
  );

  /** tower::name → medium cash */
  const byName = new Map<string, number>();
  /** tower::path-tier → medium cash (upgrades / paragons) */
  const byPathTier = new Map<string, number>();

  for (const row of towerRows) {
    const cost = parseCost(row.cost);
    if (cost == null || !row.name) continue;
    byName.set(`${normalizeName(row.name)}::${normalizeName(row.name)}`, cost);
  }

  for (const row of upgradeRows) {
    const cost = parseCost(row.cost);
    if (cost == null || !row.tower || !row.name) continue;
    const towerKey = normalizeName(row.tower);
    byName.set(`${towerKey}::${normalizeName(row.name)}`, cost);
    const path = Number(row.path);
    const tier = Number(row.tier);
    if (Number.isFinite(path) && Number.isFinite(tier) && tier > 0) {
      // Paragon rows use path -1 / tier 6
      byPathTier.set(`${towerKey}::${path}-${tier}`, cost);
      if (tier === 6) byPathTier.set(`${towerKey}::paragon`, cost);
    }
  }

  console.log(
    `Wiki: ${towerRows.length} towers, ${upgradeRows.length} upgrades/paragons`,
  );

  const raw = await readFile(TOWERS_JSON, "utf8");
  const entities = JSON.parse(raw) as Entity[];

  let matched = 0;
  const changed: string[] = [];
  const missing: string[] = [];

  for (const e of entities) {
    const towerKey = normalizeName(e.tower);
    let cost: number | null = null;

    if (e.type === "tower") {
      cost = byName.get(`${towerKey}::${normalizeName(e.name)}`) ?? null;
    } else if (e.type === "paragon") {
      cost =
        byPathTier.get(`${towerKey}::paragon`) ??
        byName.get(`${towerKey}::${normalizeName(e.name)}`) ??
        null;
    } else if (e.path != null && e.tier > 0) {
      cost =
        byPathTier.get(`${towerKey}::${e.path}-${e.tier}`) ??
        byName.get(`${towerKey}::${normalizeName(e.name)}`) ??
        null;
    } else {
      cost = byName.get(`${towerKey}::${normalizeName(e.name)}`) ?? null;
    }

    if (cost != null) {
      if (e.cost !== cost) {
        changed.push(`${e.id}: ${e.cost ?? "∅"} → ${cost}`);
      }
      e.cost = cost;
      matched += 1;
    } else {
      missing.push(`${e.id} (${e.tower} / ${e.name})`);
    }
  }

  await writeFile(TOWERS_JSON, `${JSON.stringify(entities, null, 2)}\n`);

  console.log(`Matched ${matched}/${entities.length} entities`);
  if (changed.length) {
    console.log(`Updated ${changed.length} costs:`);
    for (const line of changed.slice(0, 40)) console.log(`  ${line}`);
    if (changed.length > 40) console.log(`  … +${changed.length - 40} more`);
  }
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
