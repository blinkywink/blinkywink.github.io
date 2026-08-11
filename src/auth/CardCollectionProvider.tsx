import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "./AuthProvider";
import {
  awardCards as persistAwardCards,
  fetchOwnedCopies,
} from "../lib/awardCards";
import {
  feedForCardId,
  mergeParagonMaps,
  previewParagonFeeds,
} from "../lib/paragonProgress";
import {
  pruneUnownedShowcase,
  showcaseFromProfile,
} from "../lib/profileShowcase";
import { mergeGuestProgressIntoAccount } from "../lib/mergeGuestProgress";
import {
  applyParagonFeeds as persistParagonFeeds,
  ensureParagonStates,
  feedParagonsFromCards as persistFeedFromCards,
  fetchOwnParagons,
} from "../lib/paragonApi";
import {
  freshParagonState,
  type ParagonApplyResult,
  type ParagonFeed,
  type ParagonState,
} from "../lib/paragonProgress";
import { needsVisualSeed, newVisualSeed } from "../lib/cardVisualSeed";
import type { ParagonMap } from "../lib/guestParagons";

type CardCollectionContextValue = {
  ready: boolean;
  owned: ReadonlySet<string>;
  owns: (cardId: string) => boolean;
  ownedCount: number;
  paragons: ReadonlyMap<string, ParagonState>;
  paragonOf: (cardId: string) => ParagonState | null;
  visualSeeds: ReadonlyMap<string, number>;
  visualSeedOf: (cardId: string) => number | null;
  /** Persist unlocks; returns newly added ids. */
  awardCards: (cardIds: string[]) => Promise<string[]>;
  applyParagonFeeds: (feeds: ParagonFeed[]) => Promise<ParagonApplyResult[]>;
  feedParagonsFromCards: (
    cardIds: string[],
    newIds?: string[],
  ) => Promise<ParagonApplyResult[]>;
  refresh: () => Promise<void>;
};

const CardCollectionContext = createContext<CardCollectionContextValue | null>(
  null,
);

export function CardCollectionProvider({ children }: { children: ReactNode }) {
  const { ready: authReady, session, isGuest, profile, refreshProfile } =
    useAuth();
  const [ready, setReady] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [ownedIds, setOwnedIds] = useState<string[]>([]);
  const [seedMap, setSeedMap] = useState<Record<string, number>>({});
  const [paragonMap, setParagonMap] = useState<ParagonMap>({});
  const ownedRef = useRef(ownedIds);
  const paragonRef = useRef(paragonMap);
  const feedQueue = useRef(Promise.resolve());
  ownedRef.current = ownedIds;

  const refresh = useCallback(async () => {
    const [copies, nextParagons] = await Promise.all([
      fetchOwnedCopies(),
      fetchOwnParagons(),
    ]);
    setOwnedIds(copies.map((row) => row.cardId));
    setSeedMap(
      Object.fromEntries(
        copies
          .filter((row) => row.visualSeed != null)
          .map((row) => [row.cardId, row.visualSeed as number]),
      ),
    );
    if (nextParagons) {
      const merged = mergeParagonMaps(paragonRef.current, nextParagons);
      const next = await ensureParagonStates(
        copies.map((row) => row.cardId),
        merged,
      );
      paragonRef.current = next;
      setParagonMap(next);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!authReady) return;
    let cancelled = false;
    setReady(true);
    setHydrated(false);
    paragonRef.current = {};
    setParagonMap({});
    void (async () => {
      if (session?.userId) {
        await mergeGuestProgressIntoAccount();
      }
      const [copies, nextParagons] = await Promise.all([
        fetchOwnedCopies(),
        fetchOwnParagons(),
      ]);
      if (cancelled) return;
      setOwnedIds(copies.map((row) => row.cardId));
      setSeedMap(
        Object.fromEntries(
          copies
            .filter((row) => row.visualSeed != null)
            .map((row) => [row.cardId, row.visualSeed as number]),
        ),
      );
      if (nextParagons) {
        const merged = mergeParagonMaps(paragonRef.current, nextParagons);
        const next = await ensureParagonStates(
          copies.map((row) => row.cardId),
          merged,
        );
        paragonRef.current = next;
        setParagonMap(next);
      }
      setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [authReady, session?.userId, isGuest]);

  useEffect(() => {
    if (!hydrated || isGuest || !profile) return;
    const current = showcaseFromProfile(profile);
    if (current.length === 0) return;
    void pruneUnownedShowcase(ownedIds, current)
      .then((kept) => {
        if (kept) return refreshProfile();
      })
      .catch(() => undefined);
  }, [hydrated, isGuest, profile, ownedIds, refreshProfile]);

  const awardCards = useCallback(async (cardIds: string[]) => {
    const added = await persistAwardCards(cardIds);
    const nextOwned = new Set(ownedRef.current);
    for (const id of cardIds) nextOwned.add(id);
    ownedRef.current = [...nextOwned];
    setOwnedIds(ownedRef.current);
    const nextParagons = { ...paragonRef.current };
    let paragonsChanged = false;
    for (const id of cardIds) {
      if (id.endsWith("-paragon") && !nextParagons[id]) {
        nextParagons[id] = freshParagonState();
        paragonsChanged = true;
      }
    }
    if (paragonsChanged) {
      paragonRef.current = nextParagons;
      setParagonMap(nextParagons);
    }
    setSeedMap((prev) => {
      const next = { ...prev };
      for (const id of cardIds) {
        if (!needsVisualSeed(id) || next[id] != null) continue;
        next[id] = newVisualSeed();
      }
      return next;
    });
    void fetchOwnedCopies().then((copies) => {
      setOwnedIds(copies.map((row) => row.cardId));
      setSeedMap(
        Object.fromEntries(
          copies
            .filter((row) => row.visualSeed != null)
            .map((row) => [row.cardId, row.visualSeed as number]),
        ),
      );
    });
    return added;
  }, []);

  const applyParagonFeeds = useCallback(async (feeds: ParagonFeed[]) => {
    const run = async () => {
      const ownedSet = new Set([
        ...ownedRef.current,
        ...Object.keys(paragonRef.current),
        ...feeds.map((feed) => feed.paragonId),
      ]);
      const before = paragonRef.current;
      const preview = previewParagonFeeds(feeds, ownedSet, before);
      if (preview.results.length) {
        paragonRef.current = preview.map;
        setParagonMap(preview.map);
      }
      const { map, results } = await persistParagonFeeds(
        feeds,
        ownedSet,
        before,
      );
      paragonRef.current = map;
      setParagonMap(map);
      return results;
    };
    const next = feedQueue.current.then(run, run);
    feedQueue.current = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }, []);

  const feedParagonsFromCards = useCallback(
    async (cardIds: string[], newIds: string[] = []) => {
      const run = async () => {
        const ownedSet = new Set([
          ...ownedRef.current,
          ...Object.keys(paragonRef.current),
          ...cardIds.filter((id) => id.endsWith("-paragon")),
          ...newIds.filter((id) => id.endsWith("-paragon")),
        ]);
        const unlockedSet = new Set(newIds);
        const feeds = cardIds.flatMap((id) => {
          if (id.endsWith("-paragon") && unlockedSet.has(id)) return [];
          const feed = feedForCardId(id);
          return feed ? [feed] : [];
        });
        const before = paragonRef.current;
        const preview = previewParagonFeeds(feeds, ownedSet, before);
        if (preview.results.length) {
          paragonRef.current = preview.map;
          setParagonMap(preview.map);
        }
        const { map, results } = await persistFeedFromCards(
          cardIds,
          newIds,
          ownedSet,
          before,
        );
        paragonRef.current = map;
        setParagonMap(map);
        return results;
      };
      const next = feedQueue.current.then(run, run);
      feedQueue.current = next.then(
        () => undefined,
        () => undefined,
      );
      return next;
    },
    [],
  );

  const owned = useMemo(() => new Set(ownedIds), [ownedIds]);
  const paragons = useMemo(
    () => new Map(Object.entries(paragonMap)),
    [paragonMap],
  );
  const visualSeeds = useMemo(
    () => new Map(Object.entries(seedMap)),
    [seedMap],
  );

  const value = useMemo<CardCollectionContextValue>(
    () => ({
      ready,
      owned,
      owns: (cardId: string) => owned.has(cardId),
      ownedCount: owned.size,
      paragons,
      paragonOf: (cardId: string) => paragons.get(cardId) ?? null,
      visualSeeds,
      visualSeedOf: (cardId: string) => visualSeeds.get(cardId) ?? null,
      awardCards,
      applyParagonFeeds,
      feedParagonsFromCards,
      refresh,
    }),
    [
      ready,
      owned,
      paragons,
      visualSeeds,
      awardCards,
      applyParagonFeeds,
      feedParagonsFromCards,
      refresh,
    ],
  );

  return (
    <CardCollectionContext.Provider value={value}>
      {children}
    </CardCollectionContext.Provider>
  );
}

export function useCardCollection(): CardCollectionContextValue {
  const ctx = useContext(CardCollectionContext);
  if (!ctx) {
    throw new Error("useCardCollection must be used within CardCollectionProvider");
  }
  return ctx;
}

export function useCardCollectionOptional(): CardCollectionContextValue | null {
  return useContext(CardCollectionContext);
}
