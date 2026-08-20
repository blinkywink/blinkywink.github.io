/**
 * Capture a 6×4 grid of real MonkeyCard T5 previews (same as PFP picker).
 *
 *   npm run export-t5-grid
 *   npm run export-t5-grid -- --seed 7
 */
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import {
  pickT5GridCards,
  T5_GRID_COUNT,
} from "../src/lib/t5GridPicker";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DEV_URL = "http://127.0.0.1:5173/__t5-grid-export";
const OUT = path.join(ROOT, "exports", "t5-card-grid-background.png");

function argSeed(): number {
  const idx = process.argv.indexOf("--seed");
  if (idx >= 0 && process.argv[idx + 1]) {
    return Number(process.argv[idx + 1]) || 42;
  }
  return 42;
}

async function waitForDevServer(timeoutMs = 20000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(DEV_URL);
      if (res.ok) return;
    } catch {
      // keep waiting
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error("Dev server not reachable at " + DEV_URL);
}

async function ensureDevServer(): Promise<() => void> {
  try {
    const res = await fetch(DEV_URL);
    if (res.ok) return () => undefined;
  } catch {
    // start one
  }

  const child = spawn("npm", ["run", "dev", "--", "--host", "127.0.0.1", "--port", "5173"], {
    cwd: ROOT,
    stdio: "ignore",
    detached: true,
  });
  child.unref();
  await waitForDevServer();
  return () => {
    try {
      process.kill(-child.pid!, "SIGTERM");
    } catch {
      /* ignore */
    }
  };
}

async function main() {
  const seed = argSeed();
  const cards = pickT5GridCards(seed);
  await mkdir(path.dirname(OUT), { recursive: true });

  const stopDev = await ensureDevServer();

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(`${DEV_URL}?seed=${seed}`, { waitUntil: "networkidle" });
    await page.waitForFunction(
      () => document.documentElement.dataset.exportReady === "1",
      undefined,
      { timeout: 30000 },
    );

    const grid = page.locator(".t5-grid-export");
    await grid.waitFor({ state: "visible", timeout: 10000 });

    await grid.screenshot({ path: OUT, type: "png" });

    const manifest = {
      generatedAt: new Date().toISOString(),
      output: OUT,
      seed,
      count: T5_GRID_COUNT,
      cards: cards.map((c) => ({
        id: c.id,
        name: c.entity.name,
        tower: c.tower,
        path: c.pathLevels.join("-"),
      })),
    };
    await writeFile(
      OUT.replace(/\.png$/i, ".json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );

    console.log(`Wrote ${OUT}`);
    console.log(`Cards (${cards.length}): ${cards.map((c) => c.entity.name).join(", ")}`);
  } finally {
    await browser.close();
    stopDev();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
