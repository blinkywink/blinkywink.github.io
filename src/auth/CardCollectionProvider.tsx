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
import { mergeGuestProgressIntoAccount } from "../lib/mergeGuestProgress";

type CardCollectionContextValue = {
  ready: boolean;
  owned: ReadonlySet<string>;
  owns: (cardId: string) => boolean;
  ownedCount: number;
  /** Persist unlocks; returns newly added ids. */
  awardCards: (cardIds: string[]) => Promise<string[]>;
  refresh: () => Promise<void>;
};

const CardCollectionContext = createContext<CardCollectionContextValue | null>(
  null,
);

export function CardCollectionProvider({ children }: { children: ReactNode }) {
  const { ready: authReady, session, isGuest } = useAuth();
  const [ready, setReady] = useState(false);
  const [ownedIds, setOwnedIds] = useState<string[]>([]);

  const refresh = useCallback(async () => {
    const ids = await fetchOwnedCardIds();
    setOwnedIds(ids);
  }, []);

  useEffect(() => {
    if (!authReady) return;
    let cancelled = false;
    setReady(true);
    void (async () => {
      if (session?.userId) {
        await mergeGuestProgressIntoAccount();
      }
      const ids = await fetchOwnedCardIds();
      if (cancelled) return;
      setOwnedIds(ids);
    })();
    return () => {
      cancelled = true;
    };
  }, [authReady, session?.userId, isGuest]);

  const awardCards = useCallback(async (cardIds: string[]) => {
    const added = await persistAwardCards(cardIds);
    setOwnedIds((prev) => {
      const next = new Set(prev);
      for (const id of cardIds) next.add(id);
      return [...next];
    });
    return added;
  }, []);

  const owned = useMemo(() => new Set(ownedIds), [ownedIds]);

  const value = useMemo<CardCollectionContextValue>(
    () => ({
      ready,
      owned,
      owns: (cardId: string) => owned.has(cardId),
      ownedCount: owned.size,
      awardCards,
      refresh,
    }),
    [ready, owned, awardCards, refresh],
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
