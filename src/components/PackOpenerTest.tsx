import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../auth/AuthProvider";
import { useCardCollection } from "../auth/CardCollectionProvider";
import { useHeroFx } from "../auth/HeroFxProvider";
import { useTowerComplete } from "../auth/TowerCompleteProvider";
import { towers } from "../data/towers";
import {
  buildTowerCardSpecs,
  maxPathTier,
  sortCardSpecs,
  type MonkeyCardSpec,
} from "../lib/pathCombos";
import { pullPackCards, duplicateCashForCard } from "../lib/packPull";
import {
  feedForCard,
  formatParagonFeedLine,
  PARAGON_MAX_DEGREE,
  PARAGON_MIN_DEGREE,
  type ParagonFeed,
} from "../lib/paragonProgress";
import { useQuizHeroFx } from "../lib/quizHeroFx";
import {
  btd6Pack,
  packPrice,
  type PackDef,
} from "../lib/packTheme";
import { awardCoins } from "../lib/awardCoins";
import { autoPackUnlockedFromProfile } from "../lib/autoPackOpen";
import { isTypingTarget } from "../lib/keyboard";
import { playBuy, playCardFocus, playCardWhoosh, playPackParagon, playPackRare, playPackSlice, playPackT4, preloadPackSounds } from "../lib/packSounds";
import { preloadImages } from "../lib/preloadImages";
import { spendCoins } from "../lib/spendCoins";
import { BoosterPackFace } from "./BoosterPackFace";
import { CashAmount } from "./CurrencyChip";
import { MonkeyCard } from "./MonkeyCard";
import { ParagonXpBar } from "./ParagonXpBar";
import {
  cosmeticsFromProfile,
  hasPlayerChrome,
  playerChromeStyle,
} from "../lib/profileCosmetics";

const SLASH_NEED = 90;
const SWIPE_NEED = 42;
const SWIPE_DEADZONE = 16;

const CARD_ENTER_MS = 240;
const CARD_EXIT_MS = 150;
const SLICE_REVEAL_MS = 420;
/** Dramatic hold before a T5 / Paragon face reveals. */
const RARE_SUSPENSE_MS = 1450;
const RARE_PARAGON_SUSPENSE_MS = 1900;
/** While holding Space, T4 cards force a beat so you can see them. */
const T4_SPACE_HOLD_MS = 1500;

type Phase =
  | "shop"
  | "sealed"
  | "sliced"
  | "suspense"
  | "enter"
  | "ready"
  | "exit"
  | "done";
type Pt = { x: number; y: number }; // % of pack box
type SpaceHoldGate = "none" | "t4" | "rare";

function isRareCard(card: MonkeyCardSpec | null | undefined): boolean {
  if (!card) return false;
  return card.isParagon || maxPathTier(card.pathLevels) >= 5;
}

function spaceHoldGate(card: MonkeyCardSpec | null | undefined): SpaceHoldGate {
  if (!card) return "none";
  if (isRareCard(card)) return "rare";
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
  const { profile, setCoinBalance, refreshProfile } = useAuth();
  const { awardCards, feedParagonsFromCards, owned, listed, paragonOf } =
    useCardCollection();
  const ownedForDup = useMemo(
    () => new Set([...owned, ...listed]),
    [owned, listed],
  );
  const { setParagonNoticeDeferral } = useHeroFx();
  const { setTowerCompleteDeferral } = useTowerComplete();
  const {
    packPullMods,
    onObynExtra,
    dupCashMods,
    trySaudaDiscount,
  } = useQuizHeroFx();
  const pool = useMemo(() => buildPackPool(pack), [pack]);

  const [phase, setPhase] = useState<Phase>("shop");
  const [pulls, setPulls] = useState<MonkeyCardSpec[]>([]);
  const [duplicates, setDuplicates] = useState<ReadonlySet<string>>(new Set());
  const [duplicateCash, setDuplicateCash] = useState(0);
  const [paragonFeeds, setParagonFeeds] = useState<ReadonlyMap<string, ParagonFeed>>(
    new Map(),
  );
  const [godPack, setGodPack] = useState(false);
  const [index, setIndex] = useState(0);
  const [slash, setSlash] = useState<Pt[]>([]);
  const [clips, setClips] = useState<[string, string] | null>(null);
  const [drag, setDrag] = useState({ x: 0, y: 0 });
  const [exitDir, setExitDir] = useState({ x: 0, y: -1 });
  const [buyBusy, setBuyBusy] = useState(false);
  const [buyError, setBuyError] = useState<string | null>(null);
  const [autoOpenActive, setAutoOpenActive] = useState(false);
  const [focused, setFocused] = useState<MonkeyCardSpec | null>(null);
  const focusedRef = useRef<MonkeyCardSpec | null>(null);
  focusedRef.current = focused;

  const phaseRef = useRef<Phase>("shop");
  const drawing = useRef(false);
  const slashRef = useRef<Pt[]>([]);
  const swipeOrigin = useRef<{ x: number; y: number } | null>(null);
  const dragRef = useRef({ x: 0, y: 0 });
  const indexRef = useRef(0);
  const pullsRef = useRef<MonkeyCardSpec[]>([]);
  const unlockedRef = useRef<MonkeyCardSpec[]>([]);
  const duplicateCashRef = useRef(0);
  /** Indices already paid out during reveal (so Cash pops with each dup card). */
  const paidDupIndicesRef = useRef<Set<number>>(new Set());
  const duplicatesRef = useRef<ReadonlySet<string>>(new Set());
  const packRef = useRef<HTMLDivElement>(null);
  const timers = useRef<number[]>([]);
  /** Space currently down (incl. held through card changes). */
  const spaceHeldRef = useRef(false);
  /** T5 / Paragon: ignore Space until they release and press again. */
  const needFreshSpaceRef = useRef(false);
  /** When the current card became ready (for T4 hold gate). */
  const readyAtRef = useRef(0);
  /** Guards enter→ready so stale timers can't snap scale mid-animation. */
  const enterSeqRef = useRef(0);
  const enterStartedAtRef = useRef(0);
  /** Sync lock — React buyBusy alone races on Space-hold / key-repeat. */
  const buyLockRef = useRef(false);
  const autoOpenActiveRef = useRef(false);
  const preloadRef = useRef<HTMLImageElement[]>([]);
  const pendingPullsRef = useRef<{
    cards: MonkeyCardSpec[];
    isGod: boolean;
  } | null>(null);

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
    paidDupIndicesRef.current = new Set();
    duplicatesRef.current = new Set();
    setDuplicates(new Set());
    setDuplicateCash(0);
    setParagonFeeds(new Map());
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
    buyLockRef.current = false;
    autoOpenActiveRef.current = false;
    preloadRef.current = [];
    pendingPullsRef.current = null;
    setBuyBusy(false);
    setBuyError(null);
    setAutoOpenActive(false);
    setFocused(null);
    focusedRef.current = null;
  }, []);

  /** Clear open-state and jump to sealed (after a successful rebuy). */
  const resetToSealed = useCallback(() => {
    clearTimers();
    setPulls([]);
    pullsRef.current = [];
    unlockedRef.current = [];
    duplicateCashRef.current = 0;
    paidDupIndicesRef.current = new Set();
    duplicatesRef.current = new Set();
    setDuplicates(new Set());
    setDuplicateCash(0);
    setParagonFeeds(new Map());
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
    preloadRef.current = [];
    pendingPullsRef.current = null;
    setPhaseBoth("sealed");
  }, []);

  useEffect(() => {
    if (!open) return;
    preloadPackSounds();
    reset();
    if (mode === "reward") {
      phaseRef.current = "sealed";
      setPhase("sealed");
    }
    return clearTimers;
  }, [open, pack.id, mode, reset]);

  // Hold degree-up / tower-complete toasts until the pack summary (or close).
  useEffect(() => {
    if (!open) {
      setParagonNoticeDeferral(false);
      setTowerCompleteDeferral(false);
      return;
    }
    const defer = phase !== "shop" && phase !== "done";
    setParagonNoticeDeferral(defer);
    setTowerCompleteDeferral(defer);
  }, [open, phase, setParagonNoticeDeferral, setTowerCompleteDeferral]);

  useEffect(() => {
    return () => {
      setParagonNoticeDeferral(false);
      setTowerCompleteDeferral(false);
    };
  }, [setParagonNoticeDeferral, setTowerCompleteDeferral]);

  /** Credit Cash for one revealed duplicate (header +/- pops with the card). */
  const awardDupCashForIndex = useCallback(
    (i: number) => {
      const card = pullsRef.current[i];
      if (!card || !duplicatesRef.current.has(card.id)) return;
      if (paidDupIndicesRef.current.has(i)) return;
      paidDupIndicesRef.current.add(i);
      const cash = duplicateCashForCard(card, dupCashMods());
      if (cash < 1) return;
      void awardCoins(cash).then((balance) => {
        if (balance != null) setCoinBalance(balance);
      });
    },
    [dupCashMods, setCoinBalance],
  );

  /** If they close mid-pack, still bank any unrevealed duplicate Cash. */
  const flushUnpaidDupCash = useCallback(() => {
    let remaining = 0;
    pullsRef.current.forEach((card, i) => {
      if (!duplicatesRef.current.has(card.id)) return;
      if (paidDupIndicesRef.current.has(i)) return;
      paidDupIndicesRef.current.add(i);
      remaining += duplicateCashForCard(card, dupCashMods());
    });
    if (remaining < 1) return;
    void awardCoins(remaining).then((balance) => {
      if (balance != null) setCoinBalance(balance);
    });
  }, [dupCashMods, setCoinBalance]);

  const handleClose = () => {
    flushUnpaidDupCash();
    reset();
    onClose();
  };

  const skipToSummaryRef = useRef<() => void>(() => undefined);

  const showPackSummary = () => {
    skipToSummaryRef.current();
  };

  const onBackdropClose = () => {
    const p = phaseRef.current;
    if (p === "sealed" || p === "sliced") return;
    if (
      p === "suspense" ||
      p === "enter" ||
      p === "ready" ||
      p === "exit"
    ) {
      showPackSummary();
      return;
    }
    handleClose();
  };

  const onCloseButton = () => {
    const p = phaseRef.current;
    if (
      p === "sealed" ||
      p === "sliced" ||
      p === "suspense" ||
      p === "enter" ||
      p === "ready" ||
      p === "exit"
    ) {
      showPackSummary();
      return;
    }
    handleClose();
  };

  const finishPack = useCallback(() => {
    flushUnpaidDupCash();
    const result = {
      pack,
      pulls: pullsRef.current,
      unlocked: unlockedRef.current,
      duplicateCash: duplicateCashRef.current,
    };
    reset();
    onClose();
    onFinished?.(result);
  }, [flushUnpaidDupCash, onClose, onFinished, pack, reset]);

  const handleDone = () => {
    finishPack();
  };

  const purchase = useCallback(async () => {
    if (buyLockRef.current || mode === "reward" || phaseRef.current !== "shop") {
      return;
    }
    setBuyError(null);
    const charge =
      pack.kind === "btd6" ? trySaudaDiscount(price).price : price;
    if (charge > 0 && (profile?.coins ?? 0) < charge) {
      setBuyError("Not enough Cash.");
      return;
    }
    if (charge <= 0) {
      playBuy();
      setPhaseBoth("sealed");
      return;
    }
    buyLockRef.current = true;
    setBuyBusy(true);
    const balance = await spendCoins(charge, { shop: true });
    buyLockRef.current = false;
    setBuyBusy(false);
    if (balance == null) {
      setBuyError("Purchase failed, try again.");
      return;
    }
    playBuy();
    setCoinBalance(balance);
    void refreshProfile();
    setPhaseBoth("sealed");
  }, [
    mode,
    pack.kind,
    price,
    profile?.coins,
    refreshProfile,
    setCoinBalance,
    trySaudaDiscount,
  ]);

  const finishCardEnter = useCallback((seq?: number) => {
    if (phaseRef.current !== "enter") return;
    if (seq != null && enterSeqRef.current !== seq) return;
    const elapsed = performance.now() - enterStartedAtRef.current;
    if (elapsed < CARD_ENTER_MS - 32) return;
    readyAtRef.current = performance.now();
    const gate = spaceHoldGate(pullsRef.current[indexRef.current]);
    if (gate === "rare" && spaceHeldRef.current) {
      needFreshSpaceRef.current = true;
    }
    setPhaseBoth("ready");
  }, []);

  const beginCardEnter = useCallback(
    (seq: number) => {
      enterStartedAtRef.current = performance.now();
      setPhaseBoth("enter");
      // Fallback if animationend never fires (reduced motion, etc.)
      later(() => finishCardEnter(seq), CARD_ENTER_MS + 80);
    },
    [finishCardEnter],
  );

  const showCardAt = useCallback(
    (i: number) => {
      indexRef.current = i;
      setIndex(i);
      setDrag({ x: 0, y: 0 });
      dragRef.current = { x: 0, y: 0 };
      awardDupCashForIndex(i);
      const card = pullsRef.current[i];
      const rare = isRareCard(card);
      const enterSeq = ++enterSeqRef.current;

      if (rare) {
        if (card?.isParagon) playPackParagon();
        else playPackRare();
        setPhaseBoth("suspense");
        const suspenseMs = card?.isParagon
          ? RARE_PARAGON_SUSPENSE_MS
          : RARE_SUSPENSE_MS;
        later(() => {
          if (phaseRef.current !== "suspense") return;
          if (enterSeqRef.current !== enterSeq) return;
          beginCardEnter(enterSeq);
        }, suspenseMs);
        return;
      }

      if (card && maxPathTier(card.pathLevels) >= 4) {
        playPackT4();
      }

      beginCardEnter(enterSeq);
    },
    [awardDupCashForIndex, beginCardEnter],
  );

  const onCardEnterAnimationEnd = useCallback(
    (e: React.AnimationEvent<HTMLDivElement>) => {
      if (phaseRef.current !== "enter") return;
      if (e.target !== e.currentTarget) return;
      if (!e.animationName.includes("pack-card-enter")) return;
      finishCardEnter();
    },
    [finishCardEnter],
  );

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
    (cards: MonkeyCardSpec[], isGod: boolean, reveal: boolean) => {
      pendingPullsRef.current = null;
      const ownedAtOpen = ownedForDup;
      const dupIds = new Set<string>();
      const unlocked: MonkeyCardSpec[] = [];
      const feeds: ParagonFeed[] = [];
      const feedByCard = new Map<string, ParagonFeed>();
      let cash = 0;
      for (const card of cards) {
        if (ownedAtOpen.has(card.id)) {
          dupIds.add(card.id);
          cash += duplicateCashForCard(card, dupCashMods());
        } else {
          unlocked.push(card);
        }
      }
      const ownedParagons = new Set<string>();
      for (const id of owned) {
        if (id.endsWith("-paragon")) ownedParagons.add(id);
      }
      for (const card of unlocked) {
        if (card.isParagon) ownedParagons.add(card.id);
      }
      for (const card of cards) {
        if (!dupIds.has(card.id)) continue;
        const feed = feedForCard(card);
        if (!feed || !ownedParagons.has(feed.paragonId)) continue;
        if (listed.has(feed.paragonId)) continue;
        const ownedDegree = paragonOf(feed.paragonId)?.degree ?? PARAGON_MIN_DEGREE;
        if (ownedDegree >= PARAGON_MAX_DEGREE) continue;
        feeds.push(feed);
        feedByCard.set(card.id, feed);
      }

      pullsRef.current = cards;
      unlockedRef.current = unlocked;
      duplicateCashRef.current = cash;
      duplicatesRef.current = dupIds;
      paidDupIndicesRef.current = new Set();
      preloadRef.current = preloadImages(cards.map((card) => card.entity.image));
      setPulls(cards);
      setDuplicates(dupIds);
      setDuplicateCash(cash);
      setParagonFeeds(feedByCard);
      setGodPack(isGod);

      const newIds = unlocked.map((c) => c.id);
      const pulledIds = cards.map((c) => c.id);
      void (async () => {
        if (unlocked.length) await awardCards(newIds);
        await feedParagonsFromCards(pulledIds, newIds);
      })();
      if (reveal) {
        showCardAt(0);
      } else {
        flushUnpaidDupCash();
        setPhaseBoth("done");
      }
    },
    [
      awardCards,
      dupCashMods,
      feedParagonsFromCards,
      flushUnpaidDupCash,
      ownedForDup,
      owned,
      listed,
      paragonOf,
      showCardAt,
    ],
  );

  skipToSummaryRef.current = () => {
    const p = phaseRef.current;
    if (p === "shop" || p === "done") return;
    clearTimers();
    drawing.current = false;
    swipeOrigin.current = null;
    spaceHeldRef.current = false;
    setFocused(null);
    focusedRef.current = null;

    if (p === "sealed" || p === "sliced") {
      const pending = pendingPullsRef.current;
      if (pending) {
        beginDraw(pending.cards, pending.isGod, false);
        return;
      }
      if (pullsRef.current.length) {
        flushUnpaidDupCash();
        setPhaseBoth("done");
        return;
      }
      const mods = packPullMods();
      const result = pullPackCards(pool, pack.cardCount, ownedForDup, mods);
      if (result.extraCard) onObynExtra();
      beginDraw(result.cards, result.godPack, false);
      return;
    }

    flushUnpaidDupCash();
    setPhaseBoth("done");
  };

  const completeCut = useCallback(
    (pts: Pt[]) => {
      if (phaseRef.current !== "sealed" || pts.length < 2) return;
      playPackSlice();
      const a = pts[0]!;
      const b = pts[pts.length - 1]!;
      setClips(splitClips(a, b));
      setPhaseBoth("sliced");
      const mods = packPullMods();
      const result = pullPackCards(pool, pack.cardCount, ownedForDup, mods);
      if (result.extraCard) onObynExtra();
      setGodPack(result.godPack);
      pendingPullsRef.current = { cards: result.cards, isGod: result.godPack };
      later(() => beginDraw(result.cards, result.godPack, true), SLICE_REVEAL_MS);
    },
    [beginDraw, onObynExtra, packPullMods, pool, pack, pack.cardCount, ownedForDup],
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

  const stopAutoOpen = useCallback(() => {
    autoOpenActiveRef.current = false;
    spaceHeldRef.current = false;
    setAutoOpenActive(false);
  }, []);

  const buyAnother = useCallback(async () => {
    if (buyLockRef.current || mode === "reward") return;
    setBuyError(null);
    const charge =
      pack.kind === "btd6" ? trySaudaDiscount(price).price : price;
    if (charge <= 0) {
      buyLockRef.current = true;
      setBuyBusy(true);
      resetToSealed();
      playBuy();
    later(() => {
      buyLockRef.current = false;
      setBuyBusy(false);
      // Auto mode slashes via the sealed-phase effect; Space rebuy slashes here.
      if (!autoOpenActiveRef.current) autoSlashOpen();
    }, 160);
      return;
    }
    if ((profile?.coins ?? 0) < charge) {
      stopAutoOpen();
      reset();
      setBuyError("Not enough Cash.");
      return;
    }
    buyLockRef.current = true;
    setBuyBusy(true);
    const balance = await spendCoins(charge, { shop: true });
    if (balance == null) {
      buyLockRef.current = false;
      setBuyBusy(false);
      stopAutoOpen();
      reset();
      setBuyError("Purchase failed, try again.");
      return;
    }
    setCoinBalance(balance);
    void refreshProfile();
    resetToSealed();
    playBuy();
    later(() => {
      buyLockRef.current = false;
      setBuyBusy(false);
      if (!autoOpenActiveRef.current) autoSlashOpen();
    }, 160);
  }, [
    autoSlashOpen,
    mode,
    pack.kind,
    price,
    profile?.coins,
    refreshProfile,
    reset,
    resetToSealed,
    setCoinBalance,
    stopAutoOpen,
    trySaudaDiscount,
  ]);

  const nextCard = useCallback(() => {
    const next = indexRef.current + 1;
    if (next >= pullsRef.current.length) {
      setPhaseBoth("done");
      // Holding Space through the last card should buy another without a re-tap.
      // Reward packs are free post-game grants — not purchasable again.
      if (spaceHeldRef.current && mode !== "reward") {
        later(() => {
          if (phaseRef.current === "done" && spaceHeldRef.current) {
            void buyAnother();
          }
        }, 60);
      }
      return;
    }
    showCardAt(next);
  }, [buyAnother, mode, showCardAt]);

  const flingAway = useCallback(
    (dir?: { x: number; y: number }) => {
      if (phaseRef.current !== "ready") return;
      playCardWhoosh();
      const angle = Math.random() * Math.PI * 2;
      const nextDir = dir ?? { x: Math.cos(angle), y: Math.sin(angle) };
      setExitDir(nextDir);
      setPhaseBoth("exit");
      later(nextCard, CARD_EXIT_MS);
    },
    [nextCard],
  );

  /** Same pacing as holding Space — keeps spaceHeld and ticks flings via Space gates. */
  const startAutoOpen = useCallback(() => {
    if (mode === "reward") return;
    if (!autoPackUnlockedFromProfile(profile)) return;
    autoOpenActiveRef.current = true;
    spaceHeldRef.current = true;
    needFreshSpaceRef.current = false;
    setAutoOpenActive(true);
    const p = phaseRef.current;
    if (p === "sealed") autoSlashOpen();
    else if (p === "ready") {
      const fake = { repeat: false } as KeyboardEvent;
      if (spaceCanFling(fake)) flingAway();
    } else if (p === "done") {
      void buyAnother();
    }
  }, [autoSlashOpen, buyAnother, flingAway, mode, profile, spaceCanFling]);

  // Drive card flings like Space key-repeat while Auto is on.
  useEffect(() => {
    if (!open || !autoOpenActive) return;
    const id = window.setInterval(() => {
      if (!autoOpenActiveRef.current || buyLockRef.current) return;
      spaceHeldRef.current = true;
      if (phaseRef.current !== "ready") return;
      const gate = spaceHoldGate(pullsRef.current[indexRef.current]);
      // Holding Space can't clear a rare by itself; Auto taps once like a fresh press.
      if (gate === "rare" && needFreshSpaceRef.current) {
        needFreshSpaceRef.current = false;
      }
      const fake = {
        repeat: gate !== "rare",
      } as KeyboardEvent;
      if (spaceCanFling(fake)) flingAway();
    }, 50);
    return () => window.clearInterval(id);
  }, [autoOpenActive, flingAway, open, spaceCanFling]);

  // If Auto is already on when a pack becomes sealed, slash once (like held Space).
  useEffect(() => {
    if (!open || !autoOpenActive || phase !== "sealed") return;
    const id = window.setTimeout(() => {
      if (phaseRef.current === "sealed" && autoOpenActiveRef.current) {
        autoSlashOpen();
      }
    }, 280);
    return () => window.clearTimeout(id);
  }, [autoOpenActive, autoSlashOpen, open, phase]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (buyBusy) return;
        if (focusedRef.current) {
          setFocused(null);
          focusedRef.current = null;
          return;
        }
        const p = phaseRef.current;
        if (
          p === "sealed" ||
          p === "sliced" ||
          p === "suspense" ||
          p === "enter" ||
          p === "ready" ||
          p === "exit"
        ) {
          showPackSummary();
          return;
        }
        handleClose();
        return;
      }
      if (e.code !== "Space" && e.key !== " ") return;
      if (isTypingTarget(e.target)) return;
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
        if (focusedRef.current) return;
        // Fresh Space only. Hold-through repacks are queued in nextCard —
        // key-repeat here was double-charging packs.
        if (mode !== "reward" && !e.repeat) void buyAnother();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== "Space" && e.key !== " ") return;
      // Auto Open = sticky Space hold; don't clear it on real keyup.
      if (autoOpenActiveRef.current) {
        spaceHeldRef.current = true;
        return;
      }
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
    mode,
    autoSlashOpen,
    flingAway,
    purchase,
    buyAnother,
    buyBusy,
    spaceCanFling,
    flushUnpaidDupCash,
    reset,
    onClose,
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
    preloadPackSounds();
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
    (phase === "suspense" ||
      phase === "enter" ||
      phase === "ready" ||
      phase === "exit");
  const showPack =
    phase === "shop" || phase === "sealed" || phase === "sliced";
  const showCard =
    (phase === "suspense" ||
      phase === "enter" ||
      phase === "ready" ||
      phase === "exit") &&
    current;
  const showCardFace = phase !== "suspense";

  const cardStyle =
    phase === "ready"
      ? drag.x !== 0 || drag.y !== 0
        ? {
            transform: `translate(${drag.x}px, ${drag.y}px) rotate(${drag.x * 0.04 + drag.y * 0.02}deg)`,
            transition: "none",
          }
        : undefined
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

  const packChrome = playerChromeStyle({
    accentColor: cosmeticsFromProfile(profile ?? {}).accentColor,
  });
  const packChromeOn = hasPlayerChrome(packChrome);

  const showAutoDock =
    mode !== "reward" &&
    autoPackUnlockedFromProfile(profile) &&
    (phase !== "done" || autoOpenActive);

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
        onClick={onBackdropClose}
      />

      {godPack && phase !== "shop" && phase !== "sealed" ? (
        <div className="pack-opener__god-burst" aria-hidden>
          <span />
          <span />
          <span />
        </div>
      ) : null}

      {phase !== "done" ? (
        <>
        <div
          className={`pack-opener__arena ${phase === "sealed" ? "is-slashing" : ""} ${phase === "shop" ? "is-shop" : ""}${godPack ? " is-god" : ""}`}
          onPointerDown={phase === "sealed" ? onSlashDown : undefined}
          onPointerMove={phase === "sealed" ? onSlashMove : undefined}
          onPointerUp={phase === "sealed" ? onSlashUp : undefined}
          onPointerCancel={phase === "sealed" ? onSlashUp : undefined}
        >
          <div className="pack-opener__panel">
            {godPack &&
            (phase === "enter" || phase === "ready" || phase === "exit") ? (
              <p className="pack-opener__god-title" role="status">
                GOD PACK
              </p>
            ) : null}

            {showCard ? (
              <p
                className="pack-opener__progress"
                aria-live="polite"
              >
                {index + 1} / {pulls.length}
              </p>
            ) : null}

            <div className="pack-opener__stage">
            <button
              type="button"
              className="pack-opener__close btn btn--ghost btn--sm"
              aria-label="Close"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={onCloseButton}
            >
              ✕
            </button>
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
                  phase === "suspense" ? "is-suspense" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                style={cardStyle}
                onAnimationEnd={onCardEnterAnimationEnd}
                onPointerDownCapture={
                  phase === "ready" ? onCardPointerDown : undefined
                }
                onPointerMoveCapture={
                  phase === "ready" ? onCardPointerMove : undefined
                }
                onPointerUpCapture={
                  phase === "ready" ? onCardPointerUp : undefined
                }
                onPointerCancelCapture={
                  phase === "ready" ? onCardPointerUp : undefined
                }
              >
                {phase === "suspense" ? (
                  <div
                    className={`pack-opener__suspense pack-opener__suspense--${currentTier === "paragon" ? "paragon" : "t5"}`}
                    aria-hidden
                  >
                    <div className="pack-opener__suspense-plate">
                      <span className="pack-opener__suspense-outline" />
                      <span className="pack-opener__suspense-outline pack-opener__suspense-outline--mid" />
                      <span className="pack-opener__suspense-outline pack-opener__suspense-outline--hot" />
                      <span className="pack-opener__suspense-shimmer" />
                      {currentTier === "paragon" ? (
                        <>
                          <span className="pack-opener__suspense-bloom" />
                          <span className="pack-opener__suspense-ring" />
                          <span className="pack-opener__suspense-ring pack-opener__suspense-ring--late" />
                          <span className="pack-opener__suspense-corners">
                            <i />
                            <i />
                            <i />
                            <i />
                          </span>
                          <span className="pack-opener__suspense-flare" />
                          <span className="pack-opener__suspense-shimmer pack-opener__suspense-shimmer--cross" />
                        </>
                      ) : null}
                    </div>
                    <p className="pack-opener__suspense-label">
                      {currentTier === "paragon" ? "PARAGON" : "TIER 5"}
                    </p>
                  </div>
                ) : null}
                {showTierGlow && showCardFace ? (
                  <div
                    className={`pack-opener__card-glow pack-opener__card-glow--${currentTier}`}
                    aria-hidden
                  />
                ) : null}
                {showCardFace ? (
                  <>
                    <MonkeyCard
                      entity={current.entity}
                      pathLevels={current.pathLevels}
                      mode="focus"
                      degree={
                        current.isParagon ? PARAGON_MIN_DEGREE : undefined
                      }
                    />
                    {currentIsDup || paragonFeeds.get(current.id) ? (
                      <div className="pack-opener__dup-stack" role="status">
                        {currentIsDup ? (
                          <p className="pack-opener__dup-banner">
                            Duplicate. +
                            <CashAmount
                              amount={duplicateCashForCard(
                                current,
                                dupCashMods(),
                              )}
                              size={15}
                            />
                          </p>
                        ) : null}
                        {paragonFeeds.get(current.id) ? (
                          <p className="pack-opener__xp-banner">
                            {formatParagonFeedLine(paragonFeeds.get(current.id)!)}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </>
                ) : null}
              </div>
            ) : null}
          </div>

          {phase === "shop" ? (
            <div className="pack-opener__buy">
              <button
                type="button"
                className="btn btn--primary btn--lg"
                disabled={buyBusy}
                onClick={() => void purchase()}
              >
                {buyBusy ? (
                  "Buying…"
                ) : price <= 0 ? (
                  "Open"
                ) : (
                  <>
                    Purchase for{" "}
                    <CashAmount
                      amount={
                        pack.kind === "btd6"
                          ? trySaudaDiscount(price).price
                          : price
                      }
                      size={22}
                    />
                  </>
                )}
              </button>
              {buyError ? (
                <p className="pack-opener__buy-error">{buyError}</p>
              ) : null}
            </div>
          ) : null}
          </div>
        </div>
        </>
      ) : (
        <div
          className={`pack-opener__done${packChromeOn ? " has-player-chrome" : ""}`}
          style={packChrome}
        >
          <button
            type="button"
            className="pack-opener__close btn btn--ghost btn--sm"
            aria-label="Close"
            onClick={handleClose}
          >
            ✕
          </button>
          <h2>{godPack ? "GOD PACK!" : "Pack summary"}</h2>
          {duplicates.size > 0 ? (
            <p className="pack-opener__done-stats">
              {duplicates.size} duplicate
              {duplicates.size === 1 ? "" : "s"}. +
              <CashAmount amount={duplicateCash} size={18} />
            </p>
          ) : null}
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
                    owned
                    staticArt
                    degree={card.isParagon ? PARAGON_MIN_DEGREE : undefined}
                    onSelect={() => {
                      playCardFocus();
                      setFocused(card);
                    }}
                  />
                </div>
              );
            })}
          </div>
          <div className="pack-opener__actions">
            {mode !== "reward" ? (
              <button
                type="button"
                className="btn btn--secondary"
                disabled={buyBusy || autoOpenActive}
                onClick={() => {
                  void buyAnother();
                }}
              >
                {buyBusy ? "Buying…" : "Buy another · Space"}
              </button>
            ) : null}
            <button type="button" className="btn btn--primary" onClick={handleDone}>
              View collection
            </button>
          </div>
        </div>
      )}
      {focused ? (
        <div
          className="card-focus pack-opener__focus"
          role="dialog"
          aria-modal="true"
          aria-label={focused.entity.name}
        >
          <button
            type="button"
            className="card-focus__backdrop"
            aria-label="Close"
            onClick={() => setFocused(null)}
          />
          <div className="card-focus__panel">
            <div className="card-focus__face">
              <button
                type="button"
                className="btn btn--ghost btn--sm card-focus__close"
                aria-label="Close"
                onClick={() => setFocused(null)}
              >
                ✕
              </button>
              <MonkeyCard
                entity={focused.entity}
                pathLevels={focused.pathLevels}
                mode="focus"
                owned
                degree={
                  focused.isParagon ? paragonOf(focused.id)?.degree : undefined
                }
              />
            </div>
            {focused.isParagon ? (
              <ParagonXpBar
                degree={paragonOf(focused.id)?.degree ?? 1}
                xp={paragonOf(focused.id)?.xp ?? 0}
              />
            ) : null}
          </div>
        </div>
      ) : null}
      {showAutoDock ? (
        <button
          type="button"
          className={`btn btn--secondary pack-opener__auto-btn${autoOpenActive ? " is-on" : ""}`}
          disabled={buyBusy}
          onClick={() => {
            if (autoOpenActive) stopAutoOpen();
            else startAutoOpen();
          }}
        >
          {autoOpenActive ? "Stop Auto" : "Auto Open"}
        </button>
      ) : null}
    </div>,
    document.body,
  );
}
