import { useEffect, useRef, useState } from "react";
import { BLOON_IMAGES, LANES } from "../games/bloonhero/config";
import {
  FEATURED_BONUS_CASH,
  FEATURED_BONUS_CHANGED,
  getOrCreateFeaturedBonusGame,
  type FeaturedBonusGame,
} from "../lib/featuredBonus";
import { preloadImage } from "../utils/imageProcessing";

export type GameId =
  | "zoomed"
  | "geoguessr"
  | "pricecheck"
  | "orderup"
  | "bloonle"
  | "camodetection"
  | "bloonssweeper"
  | "bananacatch"
  | "bloonhero";

type Props = {
  onPlay: (game: GameId) => void;
  /** Embed on home hub — games grid only, full width. */
  embed?: boolean;
  /** Cap how many tiles render (home hub uses 3). Ignored when `pick` is set. */
  limit?: number;
  /** Exact games to show, in order (home hub peeks). */
  pick?: readonly GameId[];
  /** Current gold-outline bonus mode (games hub). */
  bonusGame?: FeaturedBonusGame | null;
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

function CamoPreview() {
  const camo = new Set([1, 6, 11, 12]);
  return (
    <div className="game-preview game-preview--camo" aria-hidden>
      <div className="game-preview__camo-grid">
        {Array.from({ length: 16 }, (_, i) => (
          <span
            key={i}
            className={`game-preview__camo-cell${camo.has(i) ? " has-camo" : ""}`}
          >
            {camo.has(i) ? (
              <img
                src="/images/bloons/camo-bloon.webp"
                alt=""
                draggable={false}
              />
            ) : null}
          </span>
        ))}
      </div>
    </div>
  );
}

function SweeperPreview() {
  const mines = new Set([2, 7]);
  const flags = new Set([11]);
  const opens = new Set([0, 1, 4, 5, 8]);
  return (
    <div className="game-preview game-preview--sweeper" aria-hidden>
      <div className="game-preview__sweeper-grid">
        {Array.from({ length: 16 }, (_, i) => (
          <span
            key={i}
            className={[
              "game-preview__sweeper-cell",
              opens.has(i) ? "is-open" : "",
              mines.has(i) ? "is-mine" : "",
              flags.has(i) ? "is-flagged" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {mines.has(i) ? (
              <img src="/images/bloons/red-bloon.png" alt="" draggable={false} />
            ) : flags.has(i) ? (
              <img
                src="/images/ui/strikethrough-round.png"
                alt=""
                draggable={false}
              />
            ) : opens.has(i) ? (
              <span>{(i % 3) + 1}</span>
            ) : null}
          </span>
        ))}
      </div>
    </div>
  );
}

function BananaCatchPreview() {
  return (
    <div className="game-preview game-preview--catch" aria-hidden>
      <img
        className="game-preview__catch-banana game-preview__catch-banana--a"
        src="/images/bananas/banana.webp"
        alt=""
        draggable={false}
      />
      <img
        className="game-preview__catch-banana game-preview__catch-banana--b"
        src="/images/bananas/banana.webp"
        alt=""
        draggable={false}
      />
      <img
        className="game-preview__catch-bloon"
        src="/images/bloons/red-bloon.png"
        alt=""
        draggable={false}
      />
      <img
        className="game-preview__catch-moab"
        src="/images/bloons/moab.webp"
        alt=""
        draggable={false}
      />
      <img
        className="game-preview__catch-monkey"
        src="/images/bananas/banana-farm-dance.gif"
        alt=""
        draggable={false}
      />
    </div>
  );
}

function BloonHeroPreview() {
  return (
    <div className="game-preview game-preview--hero" aria-hidden>
      <div className="game-preview__hero-highway">
        <span className="game-preview__hero-hitline" />
        {LANES.map((lane) => (
          <span
            key={lane.id}
            className="game-preview__hero-lane"
            style={{ ["--lane" as string]: lane.color }}
          >
            <img
              className="game-preview__hero-note"
              src={BLOON_IMAGES[lane.id]}
              alt=""
              draggable={false}
              style={{ ["--d" as string]: `${0.12 + lane.id * 0.22}s` }}
            />
            <img
              className="game-preview__hero-note game-preview__hero-note--b"
              src={BLOON_IMAGES[lane.id]}
              alt=""
              draggable={false}
              style={{ ["--d" as string]: `${1.05 + lane.id * 0.18}s` }}
            />
            <img
              className="game-preview__hero-receptor"
              src={BLOON_IMAGES[lane.id]}
              alt=""
              draggable={false}
            />
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
export function ArcadeHome({
  onPlay,
  embed = false,
  limit,
  pick,
  bonusGame: bonusGameProp = null,
}: Props) {
  const [bonusGame, setBonusGame] = useState<FeaturedBonusGame | null>(
    () => bonusGameProp ?? getOrCreateFeaturedBonusGame(),
  );

  useEffect(() => {
    if (bonusGameProp != null) {
      setBonusGame(bonusGameProp);
      return;
    }
    setBonusGame(getOrCreateFeaturedBonusGame());
  }, [bonusGameProp]);

  // Re-read when returning to the hub (e.g. after a run rotates the bonus).
  useEffect(() => {
    const sync = () => setBonusGame(getOrCreateFeaturedBonusGame());
    window.addEventListener("focus", sync);
    document.addEventListener("visibilitychange", sync);
    window.addEventListener(FEATURED_BONUS_CHANGED, sync);
    return () => {
      window.removeEventListener("focus", sync);
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener(FEATURED_BONUS_CHANGED, sync);
    };
  }, []);

  // Hub remount / path back from a game.
  useEffect(() => {
    setBonusGame(getOrCreateFeaturedBonusGame());
  }, []);

  const games = [
    {
      id: "zoomed" as const,
      title: "ZOOMED",
      blurb: "Guess the tower from the image.",
      label: "Zoomed, Guess the tower from the image",
      preview: <ZoomedPreview />,
    },
    {
      id: "bloonle" as const,
      title: "BLOONLE",
      blurb: "Bloons worldle including all base towers and 5th tiers.",
      label: "Bloonle, Daily Wordle with tower names",
      preview: <BloonlePreview />,
    },
    {
      id: "bananacatch" as const,
      title: "BANANA CATCH",
      blurb: "Catch falling bananas forever, dodge colored bloons & blimps.",
      label: "Banana Catch, Endless banana catch with escalating bloons",
      preview: <BananaCatchPreview />,
    },
    {
      id: "bloonhero" as const,
      title: "BLOON HERO",
      blurb: "Encore Expert Guitar charts, Vocals when available. Hit with custom keys.",
      label: "Bloon Hero, Search Encore Guitar charts, play with remappable keys",
      preview: <BloonHeroPreview />,
    },
    {
      id: "bloonssweeper" as const,
      title: "BLOONS SWEEPER",
      blurb: "Minesweeper, red bloons are the mines.",
      label: "Bloons Sweeper, Classic minesweeper with red bloon mines",
      preview: <SweeperPreview />,
    },
    {
      id: "pricecheck" as const,
      title: "PRICE CHECK",
      blurb: "Which tower costs more?",
      label: "Price Check, Which tower costs more?",
      preview: <PricePreview />,
    },
    {
      id: "camodetection" as const,
      title: "CAMO DETECTION",
      blurb: "Remember where the camo bloons flashed.",
      label: "Camo Detection, Remember where the camo bloons flashed",
      preview: <CamoPreview />,
    },
    {
      id: "orderup" as const,
      title: "ORDER UP",
      blurb: "Drag towers cheap to pricey before time runs out.",
      label: "Order Up, Drag towers by price before time runs out",
      preview: <OrderPreview />,
    },
    {
      id: "geoguessr" as const,
      title: "GEOGUESSR",
      blurb: "Guess the map from a zoomed crop.",
      label: "Geoguessr, Guess the map from a zoomed crop",
      preview: <MapPreview />,
    },
  ];
  const shown = pick?.length
    ? pick
        .map((id) => games.find((g) => g.id === id))
        .filter((g): g is (typeof games)[number] => g != null)
    : limit != null && limit > 0
      ? games.slice(0, limit)
      : games;

  return (
    <div className={`arcade${embed ? " arcade--embed" : ""}`}>
      {!embed ? <div className="arcade__atmosphere" aria-hidden="true" /> : null}

      <section
        className={`arcade__featured${embed ? " arcade__featured--hub" : ""}`}
        aria-label="Available games"
      >
        {shown.map((g) => {
          const isBonus = bonusGame === g.id;
          return (
            <button
              key={g.id}
              type="button"
              className={`game-card game-card--live${isBonus ? " game-card--bonus" : ""}`}
              aria-label={
                isBonus
                  ? `${g.label} · Featured +${FEATURED_BONUS_CASH.toLocaleString()} Cash`
                  : g.label
              }
              onClick={() => onPlay(g.id)}
            >
              {g.preview}
              <div className="game-card__foot">
                <span className="game-card__title">{g.title}</span>
                {isBonus ? (
                  <span className="game-card__bonus">
                    +{FEATURED_BONUS_CASH.toLocaleString()} Clear bonus
                  </span>
                ) : (
                  <span className="game-card__blurb">{g.blurb}</span>
                )}
              </div>
            </button>
          );
        })}
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
