import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "./AuthProvider";
import { awardCards as persistAwardCards, fetchOwnedCardIds } from "../lib/awardCards";
import {
  pruneUnownedShowcase,
  showcaseFromProfile,
} from "../lib/profileShowcase";
import { mergeGuestProgressIntoAccount } from "../lib/mergeGuestProgress";
import {
  applyParagonFeeds as persistParagonFeeds,
  ensureParagonStates,
  fetchOwnParagons,
} from "../lib/paragonApi";
import {
  freshParagonState,
  type ParagonApplyResult,
  type ParagonFeed,
  type ParagonState,
} from "../lib/paragonProgress";
import type { ParagonMap } from "../lib/guestParagons";

type CardCollectionContextValue = {
  ready: boolean;
  owned: ReadonlySet<string>;
  owns: (cardId: string) => boolean;
  ownedCount: number;
  paragons: ReadonlyMap<string, ParagonState>;
  paragonOf: (cardId: string) => ParagonState | null;
  /** Persist unlocks; returns newly added ids. */
  awardCards: (cardIds: string[]) => Promise<string[]>;
  applyParagonFeeds: (feeds: ParagonFeed[]) => Promise<ParagonApplyResult[]>;
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
  const [paragonMap, setParagonMap] = useState<ParagonMap>({});

  const refresh = useCallback(async () => {
    const [ids, nextParagons] = await Promise.all([
      fetchOwnedCardIds(),
      fetchOwnParagons(),
    ]);
    setOwnedIds(ids);
    setParagonMap(await ensureParagonStates(ids, nextParagons));
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!authReady) return;
    let cancelled = false;
    setReady(true);
    setHydrated(false);
    void (async () => {
      if (session?.userId) {
        await mergeGuestProgressIntoAccount();
      }
      const [ids, nextParagons] = await Promise.all([
        fetchOwnedCardIds(),
        fetchOwnParagons(),
      ]);
      if (cancelled) return;
      setOwnedIds(ids);
      setParagonMap(await ensureParagonStates(ids, nextParagons));
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
    setOwnedIds((prev) => {
      const next = new Set(prev);
      for (const id of cardIds) next.add(id);
      return [...next];
    });
    setParagonMap((prev) => {
      const next = { ...prev };
      for (const id of cardIds) {
        if (id.endsWith("-paragon") && !next[id]) {
          next[id] = freshParagonState();
        }
      }
      return next;
    });
    return added;
  }, []);

  const applyParagonFeeds = useCallback(
    async (feeds: ParagonFeed[]) => {
      const ownedSet = new Set(ownedIds);
      const { map, results } = await persistParagonFeeds(
        feeds,
        ownedSet,
        paragonMap,
      );
      setParagonMap(map);
      return results;
    },
    [ownedIds, paragonMap],
  );

  const owned = useMemo(() => new Set(ownedIds), [ownedIds]);
  const paragons = useMemo(
    () => new Map(Object.entries(paragonMap)),
    [paragonMap],
  );

  const value = useMemo<CardCollectionContextValue>(
    () => ({
      ready,
      owned,
      owns: (cardId: string) => owned.has(cardId),
      ownedCount: owned.size,
      paragons,
      paragonOf: (cardId: string) => paragons.get(cardId) ?? null,
      awardCards,
      applyParagonFeeds,
      refresh,
    }),
    [ready, owned, paragons, awardCards, applyParagonFeeds, refresh],
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
