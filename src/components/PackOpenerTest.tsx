import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../auth/AuthProvider";
import { useCardCollection } from "../auth/CardCollectionProvider";
import { towers } from "../data/towers";
import {
  buildTowerCardSpecs,
  sortCardSpecs,
  type MonkeyCardSpec,
} from "../lib/pathCombos";
import { pullPackCards } from "../lib/packPull";
import {
  btd6Pack,
  packPrice,
  type PackDef,
} from "../lib/packTheme";
import { spendCoins } from "../lib/spendCoins";
import { BoosterPackFace } from "./BoosterPackFace";
import { CurrencyChip } from "./CurrencyChip";
import { MonkeyCard } from "./MonkeyCard";

const SLASH_NEED = 90;
const SWIPE_NEED = 64;
const SWIPE_DEADZONE = 30;

type Phase = "shop" | "sealed" | "sliced" | "enter" | "ready" | "exit" | "done";
type Pt = { x: number; y: number }; // % of pack box

function buildPackPool(pack: PackDef): MonkeyCardSpec[] {
  if (pack.kind === "tower" && pack.tower) {
    return buildTowerCardSpecs(pack.tower).slice().sort(sortCardSpecs);
  }
  if (pack.kind === "category" && pack.category) {
    return towers
      .filter((t) => t.category === pack.category)
      .flatMap((t) => buildTowerCardSpecs(t.name))
      .sort(sortCardSpecs);
  }
  return towers
    .flatMap((t) => buildTowerCardSpecs(t.name))
    .sort(sortCardSpecs);
}

function pathLength(pts: Pt[]): number {
  let n = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    n += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return n;
}

function sideOfLine(p: Pt, a: Pt, b: Pt): number {
  return Math.sign((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x));
}

/** Split the 0–100 pack square with an infinite line through a→b into two clip polygons. */
function splitClips(a: Pt, b: Pt): [string, string] {
  const corners: Pt[] = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ];
  const edges: [Pt, Pt][] = [
    [corners[0]!, corners[1]!],
    [corners[1]!, corners[2]!],
    [corners[2]!, corners[3]!],
    [corners[3]!, corners[0]!],
  ];

  const hits: Pt[] = [];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  for (const [p1, p2] of edges) {
    const ex = p2.x - p1.x;
    const ey = p2.y - p1.y;
    const den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-6) continue;
    const t = ((p1.x - a.x) * ey - (p1.y - a.y) * ex) / den;
    const u = ((p1.x - a.x) * dy - (p1.y - a.y) * dx) / den;
    if (u < -0.001 || u > 1.001) continue;
    hits.push({ x: a.x + t * dx, y: a.y + t * dy });
  }

  // Dedupe near-identical hits
  const uniq: Pt[] = [];
  for (const h of hits) {
    if (uniq.every((q) => Math.hypot(q.x - h.x, q.y - h.y) > 0.5)) uniq.push(h);
  }
  while (uniq.length < 2) {
    // Fallback diagonal
    uniq.push(uniq.length === 0 ? { x: 0, y: 30 } : { x: 100, y: 70 });
  }
  const h0 = uniq[0]!;
  const h1 = uniq[1]!;

  const left: Pt[] = [h0, h1];
  const right: Pt[] = [h0, h1];
  for (const c of corners) {
    const s = sideOfLine(c, a, b);
    if (s < 0) left.push(c);
    else right.push(c);
  }

  const order = (pts: Pt[]) => {
    const cx = pts.reduce((n, p) => n + p.x, 0) / pts.length;
    const cy = pts.reduce((n, p) => n + p.y, 0) / pts.length;
    return pts
      .slice()
      .sort((p, q) => Math.atan2(p.y - cy, p.x - cx) - Math.atan2(q.y - cy, q.x - cx));
  };

  const poly = (pts: Pt[]) =>
    `polygon(${order(pts)
      .map((p) => `${p.x.toFixed(2)}% ${p.y.toFixed(2)}%`)
      .join(", ")})`;

  return [poly(left), poly(right)];
}

function slashToSvg(pts: Pt[]): string {
  if (!pts.length) return "";
  return pts
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
    .join(" ");
}

function pointInPack(p: Pt): boolean {
  return p.x >= 0 && p.x <= 100 && p.y >= 0 && p.y <= 100;
}

/** True if any segment of the stroke crosses the pack face. */
function slashHitsPack(pts: Pt[]): boolean {
  if (pts.some(pointInPack)) return true;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    for (let s = 0; s <= 24; s++) {
      const t = s / 24;
      if (
        pointInPack({
          x: a.x + (b.x - a.x) * t,
          y: a.y + (b.y - a.y) * t,
        })
      ) {
        return true;
      }
    }
  }
  return false;
}

type Props = {
  open: boolean;
  onClose: () => void;
  /** After finishing a pack reveal, go to the player's collection. */
  onFinished?: (result: {
    pack: PackDef;
    pulls: MonkeyCardSpec[];
  }) => void;
  /** Defaults to the all-towers BTD6 pack. Pass a tower pack to preview the template. */
  pack?: PackDef;
};

/** Pack shop → purchase → slash open. */
export function PackOpenerTest({
  open,
  onClose,
  onFinished,
  pack: packProp,
}: Props) {
  const pack = packProp ?? btd6Pack();
  const price = packPrice(pack);
  const { profile, setCoinBalance } = useAuth();
  const { awardCards, owned } = useCardCollection();
  const pool = useMemo(() => buildPackPool(pack), [pack]);
  const unownedInPack = useMemo(
    () => pool.reduce((n, c) => n + (owned.has(c.id) ? 0 : 1), 0),
    [pool, owned],
  );

  const [phase, setPhase] = useState<Phase>("shop");
  const [pulls, setPulls] = useState<MonkeyCardSpec[]>([]);
  const [index, setIndex] = useState(0);
  const [slash, setSlash] = useState<Pt[]>([]);
  const [clips, setClips] = useState<[string, string] | null>(null);
  const [drag, setDrag] = useState({ x: 0, y: 0 });
  const [exitDir, setExitDir] = useState({ x: 0, y: -1 });
  const [buyBusy, setBuyBusy] = useState(false);
  const [buyError, setBuyError] = useState<string | null>(null);

  const phaseRef = useRef<Phase>("shop");
  const drawing = useRef(false);
  const slashRef = useRef<Pt[]>([]);
  const swipeOrigin = useRef<{ x: number; y: number } | null>(null);
  const dragRef = useRef({ x: 0, y: 0 });
  const indexRef = useRef(0);
  const pullsRef = useRef<MonkeyCardSpec[]>([]);
  const packRef = useRef<HTMLDivElement>(null);
  const timers = useRef<number[]>([]);

  const clearTimers = () => {
    for (const id of timers.current) window.clearTimeout(id);
    timers.current = [];
  };

  const later = (fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms);
    timers.current.push(id);
  };

  const setPhaseBoth = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  const reset = useCallback(() => {
    clearTimers();
    phaseRef.current = "shop";
    setPhase("shop");
    setPulls([]);
    pullsRef.current = [];
    setIndex(0);
    indexRef.current = 0;
    setSlash([]);
    slashRef.current = [];
    setClips(null);
    setDrag({ x: 0, y: 0 });
    dragRef.current = { x: 0, y: 0 };
    setExitDir({ x: 0, y: -1 });
    drawing.current = false;
    swipeOrigin.current = null;
    setBuyBusy(false);
    setBuyError(null);
  }, []);

  useEffect(() => {
    if (!open) return;
    reset();
    return clearTimers;
  }, [open, pack.id, reset]);

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleDone = () => {
    const result = { pack, pulls: pullsRef.current };
    reset();
    onClose();
    onFinished?.(result);
  };

  const purchase = async () => {
    if (buyBusy || phaseRef.current !== "shop") return;
    setBuyError(null);
    if (unownedInPack < 1) {
      setBuyError("You already own every card in this pack.");
      return;
    }
    if ((profile?.coins ?? 0) < price) {
      setBuyError("Not enough Cash.");
      return;
    }
    setBuyBusy(true);
    const balance = await spendCoins(price);
    setBuyBusy(false);
    if (balance == null) {
      setBuyError("Purchase failed — try again.");
      return;
    }
    setCoinBalance(balance);
    setPhaseBoth("sealed");
  };

  const showCardAt = useCallback((i: number) => {
    indexRef.current = i;
    setIndex(i);
    setDrag({ x: 0, y: 0 });
    dragRef.current = { x: 0, y: 0 };
    setPhaseBoth("enter");
    later(() => {
      if (phaseRef.current === "enter") setPhaseBoth("ready");
    }, 560);
  }, []);

  const beginDraw = useCallback(
    (cards: MonkeyCardSpec[]) => {
      pullsRef.current = cards;
      setPulls(cards);
      void awardCards(cards.map((c) => c.id));
      showCardAt(0);
    },
    [awardCards, showCardAt],
  );

  const completeCut = useCallback(
    (pts: Pt[]) => {
      if (phaseRef.current !== "sealed" || pts.length < 2) return;
      const a = pts[0]!;
      const b = pts[pts.length - 1]!;
      setClips(splitClips(a, b));
      setPhaseBoth("sliced");
      const cards = pullPackCards(pool, pack.cardCount, owned);
      later(() => beginDraw(cards), 700);
    },
    [beginDraw, pool, pack.cardCount, owned],
  );

  const autoSlashOpen = useCallback(() => {
    if (phaseRef.current !== "sealed") return;
    // Straight horizontal cut across the top of the pack
    const frames: Pt[][] = [];
    const steps = 14;
    const y = 11;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      frames.push([
        { x: -8, y },
        { x: -8 + 116 * t, y },
      ]);
    }
    let i = 0;
    const tick = () => {
      const pts = frames[i]!;
      slashRef.current = pts;
      setSlash(pts);
      i += 1;
      if (i < frames.length) later(tick, 28);
      else completeCut(pts);
    };
    tick();
  }, [completeCut]);

  const nextCard = useCallback(() => {
    const next = indexRef.current + 1;
    if (next >= pullsRef.current.length) {
      setPhaseBoth("done");
      return;
    }
    showCardAt(next);
  }, [showCardAt]);

  const flingAway = useCallback(
    (dir?: { x: number; y: number }) => {
      if (phaseRef.current !== "ready") return;
      const angle = Math.random() * Math.PI * 2;
      const nextDir = dir ?? { x: Math.cos(angle), y: Math.sin(angle) };
      setExitDir(nextDir);
      setPhaseBoth("exit");
      later(nextCard, 300);
    },
    [nextCard],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" && e.key !== " ") return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      e.preventDefault();
      const p = phaseRef.current;
      if (p === "sealed") autoSlashOpen();
      else if (p === "ready") flingAway();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, autoSlashOpen, flingAway]);

  /** Pack-local % — not clamped, so the streak can start/end off the pack. */
  const localPoint = (e: React.PointerEvent): Pt | null => {
    const el = packRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return null;
    return {
      x: ((e.clientX - r.left) / r.width) * 100,
      y: ((e.clientY - r.top) / r.height) * 100,
    };
  };

  const onSlashDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (phaseRef.current !== "sealed") return;
    // Don't steal clicks from close / backdrop
    if ((e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = localPoint(e);
    if (!p) return;
    drawing.current = true;
    slashRef.current = [p];
    setSlash([p]);
  };

  const onSlashMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drawing.current || phaseRef.current !== "sealed") return;
    const p = localPoint(e);
    if (!p) return;
    const prev = slashRef.current[slashRef.current.length - 1];
    if (prev && Math.hypot(p.x - prev.x, p.y - prev.y) < 1.2) return;
    const next = [...slashRef.current, p];
    slashRef.current = next;
    setSlash(next);
  };

  const onSlashUp = () => {
    if (!drawing.current || phaseRef.current !== "sealed") return;
    drawing.current = false;
    const pts = slashRef.current;
    if (pathLength(pts) >= SLASH_NEED && slashHitsPack(pts)) completeCut(pts);
    else {
      slashRef.current = [];
      setSlash([]);
    }
  };

  const onCardPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (phaseRef.current !== "ready") return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    swipeOrigin.current = { x: e.clientX, y: e.clientY };
    dragRef.current = { x: 0, y: 0 };
    setDrag({ x: 0, y: 0 });
  };

  const onCardPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!swipeOrigin.current || phaseRef.current !== "ready") return;
    const x = e.clientX - swipeOrigin.current.x;
    const y = e.clientY - swipeOrigin.current.y;
    const dist = Math.hypot(x, y);
    if (dist < SWIPE_DEADZONE) {
      dragRef.current = { x: 0, y: 0 };
      setDrag({ x: 0, y: 0 });
      return;
    }
    const scale = (dist - SWIPE_DEADZONE) / dist;
    const next = { x: x * scale, y: y * scale };
    dragRef.current = next;
    setDrag(next);
  };

  const onCardPointerUp = () => {
    if (phaseRef.current !== "ready") return;
    swipeOrigin.current = null;
    const { x, y } = dragRef.current;
    const dist = Math.hypot(x, y);
    if (dist >= SWIPE_NEED) {
      const len = dist || 1;
      flingAway({ x: x / len, y: y / len });
    } else {
      dragRef.current = { x: 0, y: 0 };
      setDrag({ x: 0, y: 0 });
    }
  };

  if (!open) return null;

  const current = pulls[index] ?? null;
  const showPack =
    phase === "shop" || phase === "sealed" || phase === "sliced";
  const showCard =
    (phase === "enter" || phase === "ready" || phase === "exit") && current;

  const cardStyle =
    phase === "ready"
      ? {
          transform: `translate(${drag.x}px, ${drag.y}px) rotate(${drag.x * 0.04 + drag.y * 0.02}deg)`,
          transition:
            drag.x === 0 && drag.y === 0 ? "transform 0.18s ease-out" : "none",
        }
      : phase === "exit"
        ? {
            transform: `translate(${exitDir.x * 720}px, ${exitDir.y * 720}px) rotate(${exitDir.x * 28}deg)`,
            opacity: 0,
            transition: "transform 0.28s ease, opacity 0.28s ease",
          }
        : undefined;

  const halfNudge = (() => {
    if (!slash.length) return { x: 18, y: -14 };
    const a = slash[0]!;
    const b = slash[slash.length - 1]!;
    const nx = -(b.y - a.y);
    const ny = b.x - a.x;
    const len = Math.hypot(nx, ny) || 1;
    return { x: (nx / len) * 22, y: (ny / len) * 22 };
  })();

  return createPortal(
    <div
      className="pack-opener"
      role="dialog"
      aria-modal="true"
      aria-label="Pack opener"
    >
      <button
        type="button"
        className="pack-opener__backdrop"
        aria-label="Close"
        onClick={handleClose}
      />

      <button
        type="button"
        className="pack-opener__close btn btn--ghost btn--sm"
        onClick={handleClose}
      >
        ✕
      </button>

      {phase !== "done" ? (
        <div
          className={`pack-opener__arena ${phase === "sealed" ? "is-slashing" : ""} ${phase === "shop" ? "is-shop" : ""}`}
          onPointerDown={phase === "sealed" ? onSlashDown : undefined}
          onPointerMove={phase === "sealed" ? onSlashMove : undefined}
          onPointerUp={phase === "sealed" ? onSlashUp : undefined}
          onPointerCancel={phase === "sealed" ? onSlashUp : undefined}
        >
          <p className="pack-opener__hint">
            {phase === "shop" && `${pack.title} pack`}
            {phase === "sealed" && "slash through the pack · space"}
            {phase === "sliced" && "…"}
            {(phase === "enter" || phase === "ready" || phase === "exit") &&
              `${index + 1}/${pack.cardCount}, swipe for next`}
          </p>

          <div className="pack-opener__stage">
            {showPack ? (
              <div
                className="booster-wrap"
                ref={packRef}
                style={
                  pack.coverArt
                    ? ({
                        ["--pack-art" as string]: `url(${pack.coverArt})`,
                      } as CSSProperties)
                    : undefined
                }
              >
                <div
                  className={`booster ${phase === "sliced" ? "is-open" : "is-sealed"}`}
                >
                  {phase === "sliced" ? (
                    <>
                      <div
                        className="booster__shard booster__shard--a"
                        style={{
                          clipPath: clips?.[0],
                          ["--dx" as string]: `${-halfNudge.x}%`,
                          ["--dy" as string]: `${-halfNudge.y}%`,
                        }}
                      >
                        <BoosterPackFace pack={pack} />
                      </div>
                      <div
                        className="booster__shard booster__shard--b"
                        style={{
                          clipPath: clips?.[1],
                          ["--dx" as string]: `${halfNudge.x}%`,
                          ["--dy" as string]: `${halfNudge.y}%`,
                        }}
                      >
                        <BoosterPackFace pack={pack} />
                      </div>
                    </>
                  ) : (
                    <div className="booster__model" aria-hidden={phase !== "shop"}>
                      <div className="booster__pack">
                        <div className="booster__crimp booster__crimp--top">
                          <span className="booster__crimp-ridges" />
                        </div>
                        <div className="booster__face">
                          <BoosterPackFace pack={pack} />
                          <div className="booster__foil" />
                          <div className="booster__glare" />
                          <div className="booster__bulge" />
                        </div>
                        <div className="booster__crimp booster__crimp--bottom">
                          <span className="booster__crimp-ridges" />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                {phase === "sealed" ? (
                  <svg
                    className="booster__slash"
                    viewBox="-90 -90 280 280"
                    preserveAspectRatio="none"
                    aria-hidden
                  >
                    <path
                      d={slashToSvg(slash)}
                      fill="none"
                      stroke="rgba(255,255,255,0.4)"
                      strokeWidth="7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      vectorEffect="non-scaling-stroke"
                    />
                    <path
                      d={slashToSvg(slash)}
                      fill="none"
                      stroke="rgba(255,255,255,0.96)"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      vectorEffect="non-scaling-stroke"
                    />
                  </svg>
                ) : null}
              </div>
            ) : null}

            {showCard ? (
              <div
                key={`${current.id}-${index}`}
                className={`pack-opener__card pack-opener__card--${phase}`}
                style={cardStyle}
                onPointerDownCapture={onCardPointerDown}
                onPointerMoveCapture={onCardPointerMove}
                onPointerUpCapture={onCardPointerUp}
                onPointerCancelCapture={onCardPointerUp}
              >
                <MonkeyCard
                  entity={current.entity}
                  pathLevels={current.pathLevels}
                  mode="focus"
                />
              </div>
            ) : null}
          </div>

          {phase === "shop" ? (
            <div className="pack-opener__buy">
              <CurrencyChip amount={price} />
              <button
                type="button"
                className="btn btn--primary btn--lg"
                disabled={buyBusy}
                onClick={() => void purchase()}
              >
                {buyBusy ? "Buying…" : "Purchase"}
              </button>
              {buyError ? (
                <p className="pack-opener__buy-error">{buyError}</p>
              ) : (
                <p className="pack-opener__buy-note">
                  Balance {(profile?.coins ?? 0).toLocaleString()}
                </p>
              )}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="pack-opener__done">
          <h2>Pack opened</h2>
          <p>
            {pack.cardCount} cards ·{" "}
            {pack.kind === "btd6"
              ? "all towers"
              : pack.kind === "category"
                ? `${pack.category} towers`
                : pack.tower}
          </p>
          <div className="pack-opener__summary-grid">
            {pulls.map((card, i) => (
              <div key={`${card.id}-${i}`} className="pack-opener__summary-card">
                <MonkeyCard
                  entity={card.entity}
                  pathLevels={card.pathLevels}
                  mode="preview"
                />
                <span>
                  {card.isParagon
                    ? `${card.tower} · Paragon`
                    : `${card.tower} · ${card.pathLevels.join("-")}`}
                </span>
              </div>
            ))}
          </div>
          <div className="pack-opener__actions">
            <button type="button" className="btn btn--secondary" onClick={reset}>
              Buy another
            </button>
            <button type="button" className="btn btn--primary" onClick={handleDone}>
              View collection
            </button>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
