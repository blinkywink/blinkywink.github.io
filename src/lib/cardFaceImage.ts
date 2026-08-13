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

export type CardFaceBakeOpts = {
  /** Paragon degree for the copy being shown. */
  degree?: number | null;
  /** Per-copy visualizer seed. */
  visualSeed?: number | null;
};

const inflight = new Map<string, Promise<string>>();
const ready = new Map<string, string>();

function cacheKey(cardId: string, opts?: CardFaceBakeOpts): string {
  const spec = cardSpecById(cardId);
  const degree = spec?.isParagon
    ? clampParagonDegree(opts?.degree ?? PARAGON_MIN_DEGREE)
    : 0;
  const seed =
    opts?.visualSeed != null && Number.isFinite(opts.visualSeed)
      ? Math.floor(Number(opts.visualSeed))
      : "";
  return `${cardId}::d${degree}::s${seed}`;
}

function waitForImages(root: ParentNode): Promise<void> {
  const imgs = Array.from(root.querySelectorAll("img"));
  if (imgs.length === 0) return Promise.resolve();
  return Promise.all(
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
}

function frame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
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
  // Keep in-viewport (opacity 0) so canvas visualizers / IO still paint.
  host.style.cssText = [
    "position:fixed",
    "left:0",
    "top:0",
    `width:${CARD_FACE_W}px`,
    `height:${CARD_FACE_H}px`,
    `--card-face-w:${CARD_FACE_W}px`,
    `--card-preview-w:${CARD_FACE_W}px`,
    `--card-preview-h:${CARD_FACE_H}px`,
    "--card-preview-scale:1",
    "pointer-events:none",
    "opacity:0",
    "z-index:-1",
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
    // Let visualizer canvas + CSS FX settle one frame.
    await delay(120);
    await frame();

    const scene = host.querySelector(".monkey-card-scene");
    const target = (scene instanceof HTMLElement ? scene : host) as HTMLElement;
    const url = await toJpeg(target, {
      width: CARD_FACE_W,
      height: CARD_FACE_H,
      pixelRatio: PIXEL_RATIO,
      quality: 0.92,
      cacheBust: true,
      skipAutoScale: true,
    });
    const key = cacheKey(cardId, opts);
    ready.set(key, url);
    return url;
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

/** Full-card JPEG data URL (cached). Used for PFPs so every size shares one bitmap. */
export function getCardFaceImageUrl(
  cardId: string,
  opts?: CardFaceBakeOpts,
): Promise<string> {
  const key = cacheKey(cardId, opts);
  const hit = ready.get(key);
  if (hit) return Promise.resolve(hit);
  let p = inflight.get(key);
  if (!p) {
    p = rasterizeCardFace(cardId, opts).catch((err) => {
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
