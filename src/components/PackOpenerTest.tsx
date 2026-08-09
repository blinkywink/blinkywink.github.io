import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../auth/AuthProvider";
import { useCardCollection } from "../auth/CardCollectionProvider";
import { towers } from "../data/towers";
import {
  buildTowerCardSpecs,
  maxPathTier,
  sortCardSpecs,
  type MonkeyCardSpec,
} from "../lib/pathCombos";
import { pullPackCards, duplicateCashForCard } from "../lib/packPull";
import {
  btd6Pack,
  packPrice,
  type PackDef,
} from "../lib/packTheme";
import { awardCoins } from "../lib/awardCoins";
import { spendCoins } from "../lib/spendCoins";
import { BoosterPackFace } from "./BoosterPackFace";
import { CurrencyChip } from "./CurrencyChip";
import { MonkeyCard } from "./MonkeyCard";

const SLASH_NEED = 90;
const SWIPE_NEED = 42;
const SWIPE_DEADZONE = 16;

const CARD_ENTER_MS = 240;
const CARD_EXIT_MS = 150;
const SLICE_REVEAL_MS = 420;
/** While holding Space, T4 cards force a beat so you can see them. */
const T4_SPACE_HOLD_MS = 1500;

type Phase = "shop" | "sealed" | "sliced" | "enter" | "ready" | "exit" | "done";
type Pt = { x: number; y: number }; // % of pack box
type SpaceHoldGate = "none" | "t4" | "rare";

function spaceHoldGate(card: MonkeyCardSpec | null | undefined): SpaceHoldGate {
  if (!card) return "none";
  if (card.isParagon || maxPathTier(card.pathLevels) >= 5) return "rare";
  if (maxPathTier(card.pathLevels) >= 4) return "t4";
  return "none";
}

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
    /** Newly unlocked cards only (duplicates excluded). */
    unlocked: MonkeyCardSpec[];
    duplicateCash: number;
  }) => void;
  /** Defaults to the all-towers BTD6 pack. Pass a tower pack to preview the template. */
  pack?: PackDef;
  /**
   * shop — buy with Cash first (default).
   * reward — clear-run prize; starts sealed, no purchase.
   */
  mode?: "shop" | "reward";
};

/** Pack shop → purchase → slash open. */
export function PackOpenerTest({
  open,
  onClose,
  onFinished,
  pack: packProp,
  mode = "shop",
}: Props) {
  const pack = packProp ?? btd6Pack();
  const price = packPrice(pack);
  const { profile, setCoinBalance } = useAuth();
  const { awardCards, owned } = useCardCollection();
  const pool = useMemo(() => buildPackPool(pack), [pack]);

  const [phase, setPhase] = useState<Phase>("shop");
  const [pulls, setPulls] = useState<MonkeyCardSpec[]>([]);
  const [duplicates, setDuplicates] = useState<ReadonlySet<string>>(new Set());
  const [duplicateCash, setDuplicateCash] = useState(0);
  const [godPack, setGodPack] = useState(false);
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
  const unlockedRef = useRef<MonkeyCardSpec[]>([]);
  const duplicateCashRef = useRef(0);
  const packRef = useRef<HTMLDivElement>(null);
  const timers = useRef<number[]>([]);
  /** Space currently down (incl. held through card changes). */
  const spaceHeldRef = useRef(false);
  /** T5 / Paragon: ignore Space until they release and press again. */
  const needFreshSpaceRef = useRef(false);
  /** When the current card became ready (for T4 hold gate). */
  const readyAtRef = useRef(0);

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
    unlockedRef.current = [];
    duplicateCashRef.current = 0;
    setDuplicates(new Set());
    setDuplicateCash(0);
    setGodPack(false);
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
    spaceHeldRef.current = false;
    needFreshSpaceRef.current = false;
    readyAtRef.current = 0;
    setBuyBusy(false);
    setBuyError(null);
  }, []);

  /** Clear open-state and jump to sealed (after a successful rebuy). */
  const resetToSealed = useCallback(() => {
    clearTimers();
    setPulls([]);
    pullsRef.current = [];
    unlockedRef.current = [];
    duplicateCashRef.current = 0;
    setDuplicates(new Set());
    setDuplicateCash(0);
    setGodPack(false);
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
    needFreshSpaceRef.current = false;
    readyAtRef.current = 0;
    setBuyError(null);
    setPhaseBoth("sealed");
  }, []);

  useEffect(() => {
    if (!open) return;
    reset();
    if (mode === "reward") {
      phaseRef.current = "sealed";
      setPhase("sealed");
    }
    return clearTimers;
  }, [open, pack.id, mode, reset]);

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleDone = () => {
    const result = {
      pack,
      pulls: pullsRef.current,
      unlocked: unlockedRef.current,
      duplicateCash: duplicateCashRef.current,
    };
    reset();
    onClose();
    onFinished?.(result);
  };

  const purchase = useCallback(async () => {
    if (buyBusy || phaseRef.current !== "shop") return;
    setBuyError(null);
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
  }, [buyBusy, price, profile?.coins, setCoinBalance]);

  const showCardAt = useCallback((i: number) => {
    indexRef.current = i;
    setIndex(i);
    setDrag({ x: 0, y: 0 });
    dragRef.current = { x: 0, y: 0 };
    setPhaseBoth("enter");
    later(() => {
      if (phaseRef.current !== "enter") return;
      readyAtRef.current = performance.now();
      const gate = spaceHoldGate(pullsRef.current[i]);
      // Holding Space through a rare pull: force a fresh press.
      if (gate === "rare" && spaceHeldRef.current) {
        needFreshSpaceRef.current = true;
      }
      setPhaseBoth("ready");
    }, CARD_ENTER_MS);
  }, []);

  const spaceCanFling = useCallback((e: KeyboardEvent): boolean => {
    const gate = spaceHoldGate(pullsRef.current[indexRef.current]);
    if (gate === "rare") {
      // No key-repeat / hold-through — must let go and press again.
      if (e.repeat || needFreshSpaceRef.current) return false;
      return true;
    }
    if (gate === "t4") {
      // Pause auto-hold long enough to read the card, then hold can resume.
      if (performance.now() - readyAtRef.current < T4_SPACE_HOLD_MS) {
        return false;
      }
      return true;
    }
    return true;
  }, []);

  const beginDraw = useCallback(
    (cards: MonkeyCardSpec[], isGod: boolean) => {
      const ownedAtOpen = owned;
      const dupIds = new Set<string>();
      const unlocked: MonkeyCardSpec[] = [];
      let cash = 0;
      for (const card of cards) {
        if (ownedAtOpen.has(card.id)) {
          dupIds.add(card.id);
          cash += duplicateCashForCard(card);
        } else {
          unlocked.push(card);
        }
      }

      pullsRef.current = cards;
      unlockedRef.current = unlocked;
      duplicateCashRef.current = cash;
      setPulls(cards);
      setDuplicates(dupIds);
      setDuplicateCash(cash);
      setGodPack(isGod);

      if (unlocked.length) {
        void awardCards(unlocked.map((c) => c.id));
      }
      if (cash > 0) {
        void awardCoins(cash).then((balance) => {
          if (balance != null) setCoinBalance(balance);
        });
      }
      showCardAt(0);
    },
    [awardCards, owned, setCoinBalance, showCardAt],
  );

  const completeCut = useCallback(
    (pts: Pt[]) => {
      if (phaseRef.current !== "sealed" || pts.length < 2) return;
      const a = pts[0]!;
      const b = pts[pts.length - 1]!;
      setClips(splitClips(a, b));
      setPhaseBoth("sliced");
      const result = pullPackCards(pool, pack.cardCount, owned);
      setGodPack(result.godPack);
      later(() => beginDraw(result.cards, result.godPack), SLICE_REVEAL_MS);
    },
    [beginDraw, pool, pack.cardCount, owned],
  );

  const autoSlashOpen = useCallback(() => {
    if (phaseRef.current !== "sealed") return;
    const frames: Pt[][] = [];
    const steps = 10;
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
      if (i < frames.length) later(tick, 16);
      else completeCut(pts);
    };
    tick();
  }, [completeCut]);

  const buyAnother = useCallback(async () => {
    if (buyBusy || mode === "reward") return;
    setBuyError(null);
    if ((profile?.coins ?? 0) < price) {
      reset();
      setBuyError("Not enough Cash.");
      return;
    }
    setBuyBusy(true);
    const balance = await spendCoins(price);
    setBuyBusy(false);
    if (balance == null) {
      reset();
      setBuyError("Purchase failed — try again.");
      return;
    }
    setCoinBalance(balance);
    resetToSealed();
    later(() => autoSlashOpen(), 160);
  }, [
    autoSlashOpen,
    buyBusy,
    mode,
    price,
    profile?.coins,
    reset,
    resetToSealed,
    setCoinBalance,
  ]);

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
      later(nextCard, CARD_EXIT_MS);
    },
    [nextCard],
  );

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Space" && e.key !== " ") return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      e.preventDefault();
      spaceHeldRef.current = true;
      if (buyBusy) return;
      const p = phaseRef.current;
      if (p === "shop") {
        if (!e.repeat) void purchase();
      } else if (p === "sealed") {
        if (!e.repeat) autoSlashOpen();
      } else if (p === "ready") {
        if (spaceCanFling(e)) flingAway();
      } else if (p === "done") {
        if (!e.repeat) void buyAnother();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== "Space" && e.key !== " ") return;
      spaceHeldRef.current = false;
      needFreshSpaceRef.current = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [
    open,
    autoSlashOpen,
    flingAway,
    purchase,
    buyAnother,
    buyBusy,
    spaceCanFling,
  ]);

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
  const currentIsDup = current ? duplicates.has(current.id) : false;
  const currentTier = current
    ? current.isParagon
      ? "paragon"
      : maxPathTier(current.pathLevels) >= 5
        ? "t5"
        : maxPathTier(current.pathLevels) >= 4
          ? "t4"
          : null
    : null;
  const showTierGlow =
    Boolean(currentTier) &&
    (phase === "enter" || phase === "ready" || phase === "exit");
  const showRareFx =
    (currentTier === "t5" || currentTier === "paragon") && showTierGlow;
  const showPack =
    phase === "shop" || phase === "sealed" || phase === "sliced";
  const showCard =
    (phase === "enter" || phase === "ready" || phase === "exit") && current;

  const cardStyle =
    phase === "ready"
      ? {
          transform: `translate(${drag.x}px, ${drag.y}px) rotate(${drag.x * 0.04 + drag.y * 0.02}deg)`,
          transition:
            drag.x === 0 && drag.y === 0 ? "transform 0.12s ease-out" : "none",
        }
      : phase === "exit"
        ? {
            transform: `translate(${exitDir.x * 820}px, ${exitDir.y * 820}px) rotate(${exitDir.x * 32}deg)`,
            opacity: 0,
            transition: "transform 0.15s ease, opacity 0.14s ease",
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
      className={`pack-opener${godPack ? " pack-opener--god" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label={godPack ? "God pack" : "Pack opener"}
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

      {godPack && phase !== "shop" && phase !== "sealed" ? (
        <div className="pack-opener__god-burst" aria-hidden>
          <span />
          <span />
          <span />
        </div>
      ) : null}

      {phase !== "done" ? (
        <div
          className={`pack-opener__arena ${phase === "sealed" ? "is-slashing" : ""} ${phase === "shop" ? "is-shop" : ""}${godPack ? " is-god" : ""}`}
          onPointerDown={phase === "sealed" ? onSlashDown : undefined}
          onPointerMove={phase === "sealed" ? onSlashMove : undefined}
          onPointerUp={phase === "sealed" ? onSlashUp : undefined}
          onPointerCancel={phase === "sealed" ? onSlashUp : undefined}
        >
          <p className="pack-opener__hint">
            {phase === "shop" && `${pack.title} pack · Space to buy`}
            {phase === "sealed" &&
              (mode === "reward"
                ? `Clear reward · ${pack.title} · slash / Space`
                : "slash through the pack · Space")}
            {phase === "sliced" && (godPack ? "GOD PACK!" : "…")}
            {(phase === "enter" || phase === "ready" || phase === "exit") &&
              (godPack
                ? `GOD PACK · ${index + 1}/${pack.cardCount}`
                : currentTier === "paragon" || currentTier === "t5"
                  ? `${index + 1}/${pack.cardCount} · tap Space / swipe`
                  : spaceHoldGate(current) === "t4"
                    ? `${index + 1}/${pack.cardCount} · hold pauses · Space / swipe`
                    : `${index + 1}/${pack.cardCount} · swipe / Space`)}
          </p>

          {godPack &&
          (phase === "enter" || phase === "ready" || phase === "exit") ? (
            <p className="pack-opener__god-title" role="status">
              GOD PACK
            </p>
          ) : null}

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
                className={[
                  "pack-opener__card",
                  `pack-opener__card--${phase}`,
                  currentIsDup ? "is-duplicate" : "",
                  currentTier ? `is-glow-${currentTier}` : "",
                  currentTier === "t5" ? "is-rare-t5" : "",
                  currentTier === "paragon" ? "is-rare-paragon" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                style={cardStyle}
                onPointerDownCapture={onCardPointerDown}
                onPointerMoveCapture={onCardPointerMove}
                onPointerUpCapture={onCardPointerUp}
                onPointerCancelCapture={onCardPointerUp}
              >
                {showTierGlow ? (
                  <div
                    className={`pack-opener__card-glow pack-opener__card-glow--${currentTier}`}
                    aria-hidden
                  />
                ) : null}
                {showRareFx && currentTier !== "paragon" ? (
                  <div
                    className={`pack-opener__rare-burst pack-opener__rare-burst--${currentTier}`}
                    aria-hidden
                  >
                    <span />
                    <span />
                  </div>
                ) : null}
                {showRareFx ? (
                  <p
                    className={`pack-opener__rare-label pack-opener__rare-label--${currentTier}`}
                    role="status"
                  >
                    {currentTier === "paragon" ? "PARAGON" : "TIER 5"}
                  </p>
                ) : null}
                <MonkeyCard
                  entity={current.entity}
                  pathLevels={current.pathLevels}
                  mode="focus"
                />
                {currentIsDup ? (
                  <p className="pack-opener__dup-banner" role="status">
                    Duplicate · +{duplicateCashForCard(current)} Cash
                  </p>
                ) : null}
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
                {buyBusy ? "Buying…" : "Purchase · Space"}
              </button>
              {buyError ? (
                <p className="pack-opener__buy-error">{buyError}</p>
              ) : (
                <p className="pack-opener__buy-note">
                  Balance {(profile?.coins ?? 0).toLocaleString()} · dupes scale
                  by tier
                </p>
              )}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="pack-opener__done">
          <h2>{godPack ? "GOD PACK!" : "Pack opened"}</h2>
          <p>
            {pack.cardCount} cards
            {godPack ? " · all T4+" : ""}
            {duplicateCash > 0
              ? ` · ${duplicates.size} duplicate${duplicates.size === 1 ? "" : "s"} → +${duplicateCash} Cash`
              : ""}
            {" · "}
            {pack.kind === "btd6"
              ? "all towers"
              : pack.kind === "category"
                ? `${pack.category} towers`
                : pack.tower}
          </p>
          <div className="pack-opener__summary-grid">
            {pulls.map((card, i) => {
              const isDup = duplicates.has(card.id);
              return (
                <div
                  key={`${card.id}-${i}`}
                  className={`pack-opener__summary-card${isDup ? " is-duplicate" : ""}`}
                >
                  <MonkeyCard
                    entity={card.entity}
                    pathLevels={card.pathLevels}
                    mode="preview"
                  />
                  <span>
                    {isDup
                      ? `Duplicate · +${duplicateCashForCard(card)}`
                      : card.isParagon
                        ? `${card.tower} · Paragon`
                        : `${card.tower} · ${card.pathLevels.join("-")}`}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="pack-opener__actions">
            <button
              type="button"
              className="btn btn--secondary"
              disabled={buyBusy || mode === "reward"}
              onClick={() => {
                void buyAnother();
              }}
            >
              {buyBusy ? "Buying…" : "Buy another · Space"}
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
