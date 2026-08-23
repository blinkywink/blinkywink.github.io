import { useEffect, useRef, useState } from "react";
import { BLOON_IMAGES, LANES } from "../games/bloonhero/config";
import {
  FEATURED_BONUS_CASH,
  FEATURED_BONUS_CHANGED,
  getOrCreateFeaturedBonusGame,
  type FeaturedBonusGame,
} from "../lib/featuredBonus";
import { preloadImage } from "../utils/imageProcessing";
import {
  DISCORD_INVITE_URL,
  YOUTUBE_CHANNEL_URL,
} from "../lib/openExternal";
import { ExternalLink } from "./ExternalLink";

export type GameId =
  | "zoomed"
  | "geoguessr"
  | "pricecheck"
  | "orderup"
  | "bloonle"
  | "camodetection"
  | "bloonssweeper"
  | "bananacatch"
  | "bloonhero"
  | "roundcheck"
  | "heliumpop"
  | "blowfree";

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

export function ZoomedPreview() {
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
  const row = [
    {
      src: "/images/towers/dart-monkey/dart-monkey.webp",
      wrong: false,
      label: "$",
    },
    {
      src: "/images/towers/ninja-monkey/ninja-monkey.webp",
      wrong: true,
      label: "$$",
    },
    {
      src: "/images/towers/super-monkey/super-monkey.webp",
      wrong: false,
      label: "$$$",
    },
  ] as const;

  return (
    <div className="game-preview game-preview--order" aria-hidden>
      <div className="game-preview__order-row">
        {row.map((t, i) => (
          <div
            key={t.src}
            className={`game-preview__order-tile${t.wrong ? " is-swap" : ""}`}
          >
            <em>{i + 1}</em>
            <img src={t.src} alt="" draggable={false} />
          </div>
        ))}
      </div>
      <div className="game-preview__order-scale" aria-hidden>
        <span className="game-preview__order-scale-rail" />
        {row.map((t) => (
          <span key={t.label} className="game-preview__order-scale-tick">
            <i />
            <em>{t.label}</em>
          </span>
        ))}
      </div>
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

function RoundCheckPreview() {
  const chips = [
    { src: "/images/bloons/btd6/ceramic.webp", n: 20 },
    { src: "/images/bloons/btd6/moab.webp", n: 2 },
  ];
  return (
    <div className="game-preview game-preview--roundcheck" aria-hidden>
      <div className="game-preview__roundcheck-board">
        {chips.map((c) => (
          <span key={c.src} className="game-preview__roundcheck-chip">
            <img src={c.src} alt="" draggable={false} />
            <em>×{c.n}</em>
          </span>
        ))}
      </div>
      <div className="game-preview__roundcheck-slide">
        <span className="game-preview__roundcheck-num">?</span>
        <span className="game-preview__roundcheck-rail">
          <i style={{ left: "62%" }} />
        </span>
        <span className="game-preview__roundcheck-ends">
          <em>40</em>
          <em>100</em>
        </span>
      </div>
    </div>
  );
}

function HeliumPopPreview() {
  return (
    <div className="game-preview game-preview--heliumpop" aria-hidden>
      <div className="game-preview__helium-meadow" />
      <div className="game-preview__helium-field">
        <img
          className="game-preview__helium-bloon game-preview__helium-bloon--a"
          src="/images/bloons/btd6/red.webp"
          alt=""
          draggable={false}
        />
        <img
          className="game-preview__helium-bloon game-preview__helium-bloon--b"
          src="/images/bloons/btd6/yellow.webp"
          alt=""
          draggable={false}
        />
        <img
          className="game-preview__helium-bloon game-preview__helium-bloon--c"
          src="/images/bloons/btd6/pink.webp"
          alt=""
          draggable={false}
        />
        <img
          className="game-preview__helium-bloon game-preview__helium-bloon--d"
          src="/images/bloons/btd6/ceramic.webp"
          alt=""
          draggable={false}
        />
        <img
          className="game-preview__helium-bloon game-preview__helium-bloon--e"
          src="/images/bloons/btd6/blue.webp"
          alt=""
          draggable={false}
        />
        <span className="game-preview__helium-pop" />
        <img
          className="game-preview__helium-star"
          src="/images/bloons/shuriken.webp"
          alt=""
          draggable={false}
        />
        <img
          className="game-preview__helium-tower"
          src="/images/towers/ninja-monkey/ninja-monkey.webp"
          alt=""
          draggable={false}
        />
      </div>
    </div>
  );
}

type BlowPreviewCell = {
  end?: "red" | "blue" | "yellow" | "pink" | "green";
  color?: "red" | "blue" | "yellow" | "pink" | "green";
  l?: boolean;
  r?: boolean;
  u?: boolean;
  d?: boolean;
};

const BLOW_PREVIEW_PIPE: Record<
  NonNullable<BlowPreviewCell["color"]>,
  string
> = {
  red: "#ff5a5a",
  blue: "#5a9fff",
  yellow: "#ffe566",
  pink: "#ff7ab8",
  green: "#6fd99a",
};

const BLOW_PREVIEW_END: Record<
  NonNullable<BlowPreviewCell["end"]>,
  string
> = {
  red: "/images/bloons/btd6/red.webp",
  blue: "/images/bloons/btd6/blue.webp",
  yellow: "/images/bloons/btd6/yellow.webp",
  pink: "/images/bloons/btd6/pink.webp",
  green: "/images/bloons/btd6/green.webp",
};

/**
 * Mini solved 5×5 — winding pipes (not stripes), every cell filled,
 * same joint/arm geometry as the real Blow Free board.
 */
const BLOW_PREVIEW_CELLS: BlowPreviewCell[] = [
  // row 0
  { end: "red", color: "red", r: true },
  { color: "red", l: true, r: true },
  { color: "red", l: true, r: true },
  { color: "red", l: true, d: true },
  { end: "blue", color: "blue", d: true },
  // row 1
  { end: "green", color: "green", d: true },
  { end: "yellow", color: "yellow", r: true },
  { color: "yellow", l: true, d: true },
  { end: "red", color: "red", u: true },
  { color: "blue", u: true, d: true },
  // row 2
  { color: "green", u: true, d: true },
  { end: "yellow", color: "yellow", r: true },
  { color: "yellow", l: true, u: true },
  { end: "pink", color: "pink", d: true },
  { color: "blue", u: true, d: true },
  // row 3
  { color: "green", u: true, r: true },
  { color: "green", l: true, r: true },
  { end: "green", color: "green", l: true },
  { color: "pink", u: true, d: true },
  { color: "blue", u: true, d: true },
  // row 4
  { end: "pink", color: "pink", r: true },
  { color: "pink", l: true, r: true },
  { color: "pink", l: true, r: true },
  { color: "pink", l: true, u: true },
  { end: "blue", color: "blue", u: true },
];

function BlowFreePreview() {
  return (
    <div className="game-preview game-preview--blowfree" aria-hidden>
      <div className="game-preview__blow-grid">
        {BLOW_PREVIEW_CELLS.map((cell, i) => {
          const pipe = cell.color ? BLOW_PREVIEW_PIPE[cell.color] : null;
          const onPipe = Boolean(pipe && (cell.l || cell.r || cell.u || cell.d));
          return (
            <span
              key={i}
              className={`game-preview__blow-cell${onPipe ? " is-pipe" : ""}${cell.end ? " is-end" : ""}`}
            >
              {onPipe && pipe ? (
                <>
                  <span
                    className="game-preview__blow-joint"
                    style={{ background: pipe }}
                  />
                  {cell.l || cell.r ? (
                    <span
                      className={`game-preview__blow-arm game-preview__blow-arm--h${cell.l ? " l" : ""}${cell.r ? " r" : ""}`}
                      style={{ background: pipe }}
                    />
                  ) : null}
                  {cell.u || cell.d ? (
                    <span
                      className={`game-preview__blow-arm game-preview__blow-arm--v${cell.u ? " u" : ""}${cell.d ? " d" : ""}`}
                      style={{ background: pipe }}
                    />
                  ) : null}
                </>
              ) : null}
              {cell.end ? (
                <img
                  className="game-preview__blow-bloon"
                  src={BLOW_PREVIEW_END[cell.end]}
                  alt=""
                  draggable={false}
                />
              ) : null}
            </span>
          );
        })}
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
        className="game-preview__catch-fall game-preview__catch-fall--banana"
        src="/images/bananas/banana.webp"
        alt=""
        draggable={false}
      />
      <img
        className="game-preview__catch-fall game-preview__catch-fall--banana2"
        src="/images/bananas/banana.webp"
        alt=""
        draggable={false}
      />
      <img
        className="game-preview__catch-fall game-preview__catch-fall--bloon"
        src="/images/bloons/red-bloon.webp"
        alt=""
        draggable={false}
      />
      <img
        className="game-preview__catch-fall game-preview__catch-fall--pink"
        src="/images/bloons/pink-bloon.webp"
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
              style={{ ["--d" as string]: `${lane.id * 0.58}s` }}
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
      id: "bananacatch" as const,
      title: "BANANA CATCH",
      blurb: "Catch falling bananas forever, dodge colored bloons & blimps.",
      label: "Banana Catch, Endless banana catch with escalating bloons",
      preview: <BananaCatchPreview />,
    },
    {
      id: "bloonle" as const,
      title: "BLOONLE",
      blurb: "Bloons worldle including all base towers and 5th tiers.",
      label: "Bloonle, Daily Wordle with base towers and T5s",
      preview: <BloonlePreview />,
    },
    {
      id: "heliumpop" as const,
      title: "HELIUM POP",
      blurb: "Clear all the bloons with ninjas.",
      label: "Helium Pop, Clear all the bloons with ninjas",
      preview: <HeliumPopPreview />,
    },
    {
      id: "zoomed" as const,
      title: "ZOOMED",
      blurb: "Guess the tower from the image.",
      label: "Zoomed, Guess the tower from the image",
      preview: <ZoomedPreview />,
    },
    {
      id: "bloonhero" as const,
      title: "BLOON HERO",
      blurb: "Encore Expert Guitar charts, Vocals when available. Hit with custom keys.",
      label: "Bloon Hero, Search Encore Guitar charts, play with remappable keys",
      preview: <BloonHeroPreview />,
    },
    {
      id: "blowfree" as const,
      title: "BLOW FREE",
      blurb: "Daily Flow Free. Big grid, big cash.",
      label: "Blow Free, Daily Flow Free with colored bloons",
      preview: <BlowFreePreview />,
    },
    {
      id: "camodetection" as const,
      title: "CAMO DETECTION",
      blurb: "Endless memory challenge. Spot the camo before time runs out.",
      label: "Camo Detection, Endless memory challenge with camo bloons",
      preview: <CamoPreview />,
    },
    {
      id: "pricecheck" as const,
      title: "PRICE CHECK",
      blurb: "Which tower costs more?",
      label: "Price Check, Which tower costs more?",
      preview: <PricePreview />,
    },
    {
      id: "roundcheck" as const,
      title: "ROUND CHECK",
      blurb: "Guess the round 1–100 in 4 or less. Higher or lower.",
      label: "Round Check, Guess the freeplay round 1 to 100 in 4 or less, higher or lower",
      preview: <RoundCheckPreview />,
    },
    {
      id: "geoguessr" as const,
      title: "GEOGUESSR",
      blurb: "Guess the map from a zoomed crop.",
      label: "Geoguessr, Guess the map from a zoomed crop",
      preview: <MapPreview />,
    },
    {
      id: "bloonssweeper" as const,
      title: "BLOONS SWEEPER",
      blurb: "Minesweeper, red bloons are the mines.",
      label: "Bloons Sweeper, Classic minesweeper with red bloon mines",
      preview: <SweeperPreview />,
    },
    {
      id: "orderup" as const,
      title: "ORDER UP",
      blurb: "Drag towers cheap to pricey before time runs out.",
      label: "Order Up, Drag towers by price before time runs out",
      preview: <OrderPreview />,
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
          <p className="arcade__footer-links">
            <span>
              made by:{" "}
              <ExternalLink href={YOUTUBE_CHANNEL_URL}>blinkywink</ExternalLink>
            </span>
            <ExternalLink href={DISCORD_INVITE_URL}>
              Join the discord
            </ExternalLink>
          </p>
          <p>BTD6 Creator code: blinky</p>
        </footer>
      ) : null}
    </div>
  );
}
