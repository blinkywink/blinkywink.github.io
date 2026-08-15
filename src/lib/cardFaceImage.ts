import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { toJpeg } from "html-to-image";
import { MonkeyCard } from "../components/MonkeyCard";
import { cardSpecById } from "./cardCatalog";
import { clampParagonDegree, PARAGON_MIN_DEGREE } from "./paragonProgress";

/** Authoring size — matches `.monkey-card` face width. */
export const CARD_FACE_W = 400;
export const CARD_FACE_H = (CARD_FACE_W * 3.5) / 2.5;
const PIXEL_RATIO = 2;
const IDB_NAME = "ba-card-faces";
const IDB_STORE = "faces";
const IDB_VERSION = 2;
/** Bump when card chrome/colors change so stale JPEGs are dropped. */
const FACE_STYLE_REV = "cat2";
/** Soft cap so IndexedDB doesn’t grow forever. */
const IDB_MAX_ENTRIES = 80;

export type CardFaceBakeOpts = {
  /** Paragon degree for the copy being shown. */
  degree?: number | null;
  /** Per-copy visualizer seed. */
  visualSeed?: number | null;
};

const inflight = new Map<string, Promise<string>>();
const ready = new Map<string, string>();

/** Serialize DOM bakes — parallel offscreen cards thrash WebKit / Tauri. */
let bakeQueue: Promise<unknown> = Promise.resolve();

function enqueueBake<T>(fn: () => Promise<T>): Promise<T> {
  const run = bakeQueue.then(fn, fn);
  bakeQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function cacheKey(cardId: string, opts?: CardFaceBakeOpts): string {
  const spec = cardSpecById(cardId);
  const degree = spec?.isParagon
    ? clampParagonDegree(opts?.degree ?? PARAGON_MIN_DEGREE)
    : 0;
  const seed =
    opts?.visualSeed != null && Number.isFinite(opts.visualSeed)
      ? Math.floor(Number(opts.visualSeed))
      : "";
  return `${FACE_STYLE_REV}:${cardId}::d${degree}::s${seed}`;
}

function openFaceDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onerror = () => resolve(null);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE, { keyPath: "key" });
        }
      };
      req.onsuccess = () => resolve(req.result);
    } catch {
      resolve(null);
    }
  });
}

type FaceRow = { key: string; blob: Blob; at: number };

async function idbGetFace(key: string): Promise<string | null> {
  const db = await openFaceDb();
  if (!db) return null;
  try {
    const row = await new Promise<FaceRow | undefined>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => resolve(req.result as FaceRow | undefined);
      req.onerror = () => reject(req.error);
    });
    if (!row?.blob) return null;
    return URL.createObjectURL(row.blob);
  } catch {
    return null;
  } finally {
    db.close();
  }
}

async function idbPutFace(key: string, blob: Blob): Promise<void> {
  const db = await openFaceDb();
  if (!db) return;
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      const store = tx.objectStore(IDB_STORE);
      store.put({ key, blob, at: Date.now() } satisfies FaceRow);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    await pruneFaceDb(db);
  } catch {
    /* ignore quota / private mode */
  } finally {
    db.close();
  }
}

async function pruneFaceDb(db: IDBDatabase): Promise<void> {
  const rows = await new Promise<FaceRow[]>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readonly");
    const req = tx.objectStore(IDB_STORE).getAll();
    req.onsuccess = () => resolve((req.result as FaceRow[]) ?? []);
    req.onerror = () => reject(req.error);
  });
  if (rows.length <= IDB_MAX_ENTRIES) return;
  rows.sort((a, b) => (a.at ?? 0) - (b.at ?? 0));
  const drop = rows.slice(0, rows.length - IDB_MAX_ENTRIES);
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    const store = tx.objectStore(IDB_STORE);
    for (const row of drop) store.delete(row.key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, data] = dataUrl.split(",");
  const mime = /data:([^;]+)/.exec(header ?? "")?.[1] ?? "image/jpeg";
  const bin = atob(data ?? "");
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function waitForImages(root: ParentNode, timeoutMs = 4000): Promise<void> {
  const imgs = Array.from(root.querySelectorAll("img"));
  if (imgs.length === 0) return Promise.resolve();
  const loaded = Promise.all(
    imgs.map(
      (img) =>
        img.complete && img.naturalWidth > 0
          ? Promise.resolve()
          : new Promise<void>((resolve) => {
              const done = () => resolve();
              img.addEventListener("load", done, { once: true });
              img.addEventListener("error", done, { once: true });
            }),
    ),
  ).then(() => undefined);
  return Promise.race([
    loaded,
    delay(timeoutMs).then(() => undefined),
  ]);
}

function frame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/**
 * html-to-image re-fetches img URLs into the SVG clone. On Tauri / asset
 * protocols that fetch often fails → blank faces. Inline already-decoded
 * bitmaps (and canvases) as data URLs so capture never needs network.
 */
function inlineDecodedMedia(root: ParentNode): void {
  for (const canvas of Array.from(root.querySelectorAll("canvas"))) {
    try {
      const url = canvas.toDataURL("image/png");
      const img = document.createElement("img");
      img.src = url;
      img.alt = "";
      img.width = canvas.width;
      img.height = canvas.height;
      img.setAttribute("style", canvas.getAttribute("style") ?? "");
      img.className = canvas.className;
      canvas.replaceWith(img);
    } catch {
      /* tainted canvas */
    }
  }

  for (const img of Array.from(root.querySelectorAll("img"))) {
    if (!img.src || img.src.startsWith("data:")) continue;
    if (!img.complete || img.naturalWidth <= 0) continue;
    try {
      const c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext("2d");
      if (!ctx) continue;
      ctx.drawImage(img, 0, 0);
      img.srcset = "";
      img.src = c.toDataURL("image/png");
    } catch {
      /* cross-origin / tainted */
    }
  }
}

async function rasterizeCardFace(
  cardId: string,
  opts?: CardFaceBakeOpts,
): Promise<string> {
  const spec = cardSpecById(cardId);
  if (!spec) throw new Error(`Unknown card: ${cardId}`);

  const degree = spec.isParagon
    ? clampParagonDegree(opts?.degree ?? PARAGON_MIN_DEGREE)
    : undefined;
  const visualSeed =
    opts?.visualSeed != null && Number.isFinite(opts.visualSeed)
      ? Math.floor(Number(opts.visualSeed))
      : null;

  const host = document.createElement("div");
  host.className = "card-face-raster";
  host.setAttribute("aria-hidden", "true");
  // Off-screen but fully opaque — opacity:0 makes html-to-image blank on WebKit.
  host.style.cssText = [
    "position:fixed",
    "left:-10000px",
    "top:0",
    `width:${CARD_FACE_W}px`,
    `height:${CARD_FACE_H}px`,
    `--card-face-w:${CARD_FACE_W}px`,
    `--card-preview-w:${CARD_FACE_W}px`,
    `--card-preview-h:${CARD_FACE_H}px`,
    "--card-preview-scale:1",
    "pointer-events:none",
    "opacity:1",
    "z-index:0",
    "overflow:hidden",
  ].join(";");
  document.body.appendChild(host);

  const root = createRoot(host);
  try {
    root.render(
      createElement(MonkeyCard, {
        entity: spec.entity,
        pathLevels: spec.pathLevels,
        mode: "preview",
        staticArt: false,
        bake: true,
        owned: true,
        degree,
        visualSeed,
      }),
    );
    await frame();
    await waitForImages(host);
    // Let visualizer canvas + CSS FX settle.
    await delay(160);
    await frame();

    inlineDecodedMedia(host);
    await waitForImages(host);
    await frame();

    const scene = host.querySelector(".monkey-card-scene");
    const target = (scene instanceof HTMLElement ? scene : host) as HTMLElement;
    const dataUrl = await toJpeg(target, {
      width: CARD_FACE_W,
      height: CARD_FACE_H,
      pixelRatio: PIXEL_RATIO,
      quality: 0.9,
      // cacheBust appends ?t=… which breaks Tauri asset URLs.
      cacheBust: false,
      skipAutoScale: true,
      // Avoid embedding font CSS (another common desktop failure).
      skipFonts: true,
      backgroundColor: "#121218",
      style: {
        opacity: "1",
        transform: "none",
      },
    });

    const blob = dataUrlToBlob(dataUrl);
    const objectUrl = URL.createObjectURL(blob);
    const key = cacheKey(cardId, opts);
    const prev = ready.get(key);
    if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
    ready.set(key, objectUrl);
    void idbPutFace(key, blob);
    return objectUrl;
  } finally {
    root.unmount();
    host.remove();
  }
}

/** Sync hit if this card face was already rasterized this session. */
export function peekCardFaceImageUrl(
  cardId: string,
  opts?: CardFaceBakeOpts,
): string | null {
  return ready.get(cacheKey(cardId, opts)) ?? null;
}

/** Full-card JPEG (memory + IndexedDB). Used for PFPs so every size shares one bitmap. */
export function getCardFaceImageUrl(
  cardId: string,
  opts?: CardFaceBakeOpts,
): Promise<string> {
  const key = cacheKey(cardId, opts);
  const hit = ready.get(key);
  if (hit) return Promise.resolve(hit);
  let p = inflight.get(key);
  if (!p) {
    p = (async () => {
      const cached = await idbGetFace(key);
      if (cached) {
        ready.set(key, cached);
        return cached;
      }
      return enqueueBake(() => rasterizeCardFace(cardId, opts));
    })().catch((err) => {
      inflight.delete(key);
      throw err;
    });
    inflight.set(key, p);
  }
  return p;
}

export function prefetchCardFaceImage(
  cardId: string,
  opts?: CardFaceBakeOpts,
): void {
  void getCardFaceImageUrl(cardId, opts);
}
