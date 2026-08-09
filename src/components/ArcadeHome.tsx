import { useEffect, useRef } from "react";
import { preloadImage } from "../utils/imageProcessing";
import { DailyClaimButton } from "./DailyClaimButton";

export type GameId =
  | "zoomed"
  | "geoguessr"
  | "pricecheck"
  | "orderup"
  | "bloonle";

type Props = {
  onPlay: (game: GameId) => void;
  /** Embed on home hub — games grid only, full width. */
  embed?: boolean;
};

/** Bright mid-tier art so the home crop isn't near-black silhouette. */
const ZOOMED_PREVIEW_SRC =
  "/images/towers/ninja-monkey/grandmaster-ninja.webp";

/** Pick a vivid square crop for the home Zoomed tile. */
async function paintZoomedPreview(
  canvas: HTMLCanvasElement,
  src: string,
  outputSize = 360,
): Promise<void> {
  const img = await preloadImage(src);
  const imgW = img.naturalWidth;
  const imgH = img.naturalHeight;
  const crop = Math.min(imgW, imgH) * 0.3;

  const probe = document.createElement("canvas");
  probe.width = imgW;
  probe.height = imgH;
  const pctx = probe.getContext("2d", { willReadFrequently: true })!;
  pctx.drawImage(img, 0, 0);
  const { data } = pctx.getImageData(0, 0, imgW, imgH);

  const scoreWindow = (sx: number, sy: number): number => {
    let score = 0;
    let samples = 0;
    const step = Math.max(4, Math.floor(crop / 18));
    for (let y = sy; y < sy + crop; y += step) {
      for (let x = sx; x < sx + crop; x += step) {
        const i = (Math.floor(y) * imgW + Math.floor(x)) * 4;
        const a = data[i + 3]!;
        if (a < 180) continue;
        const r = data[i]!;
        const g = data[i + 1]!;
        const b = data[i + 2]!;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        if (lum < 35) continue;
        const sat = max === 0 ? 0 : (max - min) / max;
        score += sat * lum + (max - min) * 0.35;
        samples += 1;
      }
    }
    return samples < 8 ? 0 : score / samples;
  };

  let best = { score: -1, x: 0, y: 0 };
  const maxX = Math.max(0, imgW - crop);
  const maxY = Math.max(0, imgH - crop);
  for (let gy = 0; gy < 6; gy++) {
    for (let gx = 0; gx < 6; gx++) {
      const x = (gx / 5) * maxX;
      const y = (gy / 5) * maxY;
      const score = scoreWindow(x, y);
      if (score > best.score) best = { score, x, y };
    }
  }

  canvas.width = outputSize;
  canvas.height = outputSize;
  const ctx = canvas.getContext("2d")!;
  const bg = ctx.createRadialGradient(
    outputSize / 2,
    outputSize / 2,
    outputSize * 0.12,
    outputSize / 2,
    outputSize / 2,
    outputSize * 0.75,
  );
  bg.addColorStop(0, "#1a3d5c");
  bg.addColorStop(1, "#0c2238");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, outputSize, outputSize);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    img,
    best.x,
    best.y,
    crop,
    crop,
    0,
    0,
    outputSize,
    outputSize,
  );
}

function ZoomedPreview() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    if (!canvas) return;

    void (async () => {
      try {
        await paintZoomedPreview(canvas, ZOOMED_PREVIEW_SRC, 360);
      } catch {
        if (!cancelled) {
          canvas.width = 360;
          canvas.height = 360;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.fillStyle = "#1a3d5c";
            ctx.fillRect(0, 0, 360, 360);
          }
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="game-preview game-preview--zoomed" aria-hidden>
      <canvas ref={canvasRef} className="game-preview__canvas" />
    </div>
  );
}

function PricePreview() {
  return (
    <div className="game-preview game-preview--price" aria-hidden>
      <div className="game-preview__side">
        <img
          src="/images/towers/dart-monkey/dart-monkey.webp"
          alt=""
          draggable={false}
        />
      </div>
      <span className="game-preview__vs">VS</span>
      <div className="game-preview__side">
        <img
          src="/images/towers/super-monkey/dark-champion.webp"
          alt=""
          draggable={false}
        />
      </div>
    </div>
  );
}

function OrderPreview() {
  const faces = [
    "/images/towers/dart-monkey/dart-monkey.webp",
    "/images/towers/ninja-monkey/ninja-monkey.webp",
    "/images/towers/wizard-monkey/wizard-monkey.webp",
    "/images/towers/alchemist/alchemist.webp",
    "/images/towers/super-monkey/super-monkey.webp",
  ] as const;

  return (
    <div className="game-preview game-preview--order" aria-hidden>
      {faces.map((src, i) => (
        <div key={src} className="game-preview__order-slot">
          <span>{i + 1}</span>
          <img src={src} alt="" draggable={false} />
        </div>
      ))}
    </div>
  );
}

function BloonlePreview() {
  const row = "DRUID".split("");
  const marks = ["correct", "present", "absent", "present", "correct"] as const;

  return (
    <div className="game-preview game-preview--bloonle" aria-hidden>
      <div className="game-preview__bloonle-grid">
        {row.map((ch, i) => (
          <span key={i} className={`game-preview__bloonle-tile is-${marks[i]}`}>
            {ch}
          </span>
        ))}
      </div>
    </div>
  );
}

function MapPreview() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    if (!canvas) return;

    void (async () => {
      try {
        const img = await preloadImage("/images/maps/logs.webp");
        if (cancelled) return;
        const size = 360;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d")!;
        const crop = Math.min(img.naturalWidth, img.naturalHeight) * 0.28;
        const sx = img.naturalWidth * 0.42;
        const sy = img.naturalHeight * 0.38;
        const bg = ctx.createRadialGradient(
          size / 2,
          size / 2,
          size * 0.12,
          size / 2,
          size / 2,
          size * 0.75,
        );
        bg.addColorStop(0, "#1a3d5c");
        bg.addColorStop(1, "#0c2238");
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, size, size);
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(img, sx, sy, crop, crop, 0, 0, size, size);
      } catch {
        // preview optional
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="game-preview game-preview--zoomed" aria-hidden>
      <canvas ref={canvasRef} className="game-preview__canvas" />
    </div>
  );
}

/** Games hub — playable titles only. */
export function ArcadeHome({ onPlay, embed = false }: Props) {
  return (
    <div className={`arcade${embed ? " arcade--embed" : ""}`}>
      {!embed ? <div className="arcade__atmosphere" aria-hidden="true" /> : null}
      {!embed ? <DailyClaimButton variant="hero" /> : null}

      <section className="arcade__featured" aria-label="Available games">
        <button
          type="button"
          className="game-card game-card--live"
          aria-label="Zoomed — Guess the tower from the image"
          onClick={() => onPlay("zoomed")}
        >
          <ZoomedPreview />
          <div className="game-card__foot">
            <span className="game-card__title">ZOOMED</span>
            <span className="game-card__blurb">
              Guess the tower from the image.
            </span>
          </div>
        </button>

        <button
          type="button"
          className="game-card game-card--live"
          aria-label="Geoguessr — Guess the map from a zoomed crop"
          onClick={() => onPlay("geoguessr")}
        >
          <MapPreview />
          <div className="game-card__foot">
            <span className="game-card__title">GEOGUESSR</span>
            <span className="game-card__blurb">
              Guess the map from a zoomed crop.
            </span>
          </div>
        </button>

        <button
          type="button"
          className="game-card game-card--live"
          aria-label="Price Check — Which tower costs more?"
          onClick={() => onPlay("pricecheck")}
        >
          <PricePreview />
          <div className="game-card__foot">
            <span className="game-card__title">PRICE CHECK</span>
            <span className="game-card__blurb">Which tower costs more?</span>
          </div>
        </button>

        <button
          type="button"
          className="game-card game-card--live"
          aria-label="Order Up — Drag towers by price before time runs out"
          onClick={() => onPlay("orderup")}
        >
          <OrderPreview />
          <div className="game-card__foot">
            <span className="game-card__title">ORDER UP</span>
            <span className="game-card__blurb">
              Drag towers cheap to pricey before time runs out.
            </span>
          </div>
        </button>

        <button
          type="button"
          className="game-card game-card--live"
          aria-label="Bloonle — Daily Wordle with tower names"
          onClick={() => onPlay("bloonle")}
        >
          <BloonlePreview />
          <div className="game-card__foot">
            <span className="game-card__title">BLOONLE</span>
            <span className="game-card__blurb">
              Bloons worldle including all base towers and 5th tiers.
            </span>
          </div>
        </button>
      </section>

      {!embed ? (
        <footer className="arcade__footer">
          <p>
            made by:{" "}
            <a
              href="https://youtube.com/@blinkywink"
              target="_blank"
              rel="noreferrer"
            >
              blinkywink
            </a>
          </p>
          <p>BTD6 Creator code: blinky</p>
        </footer>
      ) : null}
    </div>
  );
}
