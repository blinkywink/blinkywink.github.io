/**
 * Capture real MonkeyCard + BoosterPack faces for the home hub peeks.
 *
 *   npm run export-hub-peeks
 */
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import {
  HUB_PEEK_CARD_IDS,
  hubPeekPacks,
} from "../src/lib/hubPeeks";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DEV_URL = "http://127.0.0.1:5173/__hub-peek-export";
const OUT_DIR = path.join(ROOT, "public", "images", "hub");

async function waitForDevServer(timeoutMs = 25000): Promise<void> {
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

  const child = spawn(
    "npm",
    ["run", "dev", "--", "--host", "127.0.0.1", "--port", "5173"],
    {
      cwd: ROOT,
      stdio: "ignore",
      detached: true,
    },
  );
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
  await mkdir(OUT_DIR, { recursive: true });
  const stopDev = await ensureDevServer();
  const browser = await chromium.launch();

  try {
    const page = await browser.newPage({
      viewport: { width: 1400, height: 900 },
      deviceScaleFactor: 2,
    });
    await page.goto(DEV_URL, { waitUntil: "networkidle" });
    await page.waitForFunction(
      () => document.documentElement.dataset.exportReady === "1",
      undefined,
      { timeout: 45000 },
    );

    const targets = [
      ...HUB_PEEK_CARD_IDS.map((id) => `card-${id}`),
      ...hubPeekPacks().map((p) => `pack-${p.id}`),
    ];

    for (const id of targets) {
      const el = page.locator(`[data-export="${id}"]`);
      await el.waitFor({ state: "visible", timeout: 10000 });
      const out = path.join(OUT_DIR, `${id}.jpg`);
      await el.screenshot({ path: out, type: "jpeg", quality: 90 });
      console.log(`Wrote ${out}`);
    }
  } finally {
    await browser.close();
    stopDev();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
