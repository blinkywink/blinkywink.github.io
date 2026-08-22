import { useCallback, useEffect, useRef } from "react";
import { useAuth } from "../auth/AuthProvider";
import { useCardCollection } from "../auth/CardCollectionProvider";
import { loadAppSession } from "../auth/session";
import { cacheInvalidate } from "../lib/cache";

const SYNC_MS = 45_000;
const SYNC_COOLDOWN_MS = 12_000;

/** Keep a long-lived desktop/web session honest with the server. */
export function LivePlayerSync() {
  const { session, isGuest, refreshProfile, signOut } = useAuth();
  const { refresh } = useCardCollection();
  const busyRef = useRef(false);
  const lastSyncRef = useRef(0);

  const sync = useCallback(async (force = false) => {
    if (busyRef.current || isGuest || !session) return;
    if (!force && Date.now() - lastSyncRef.current < SYNC_COOLDOWN_MS) return;
    if (!loadAppSession()) {
      await signOut();
      return;
    }
    busyRef.current = true;
    lastSyncRef.current = Date.now();
    try {
      cacheInvalidate("leaderboard:");
      cacheInvalidate("profile:");
      cacheInvalidate("player-paragons:");
      cacheInvalidate("player-cards:");
      cacheInvalidate("player-card-copies:");
      cacheInvalidate("market:");
      await Promise.all([refreshProfile(), refresh()]);
    } catch (err) {
      console.warn("Live player sync failed", err);
    } finally {
      busyRef.current = false;
    }
  }, [isGuest, refresh, refreshProfile, session, signOut]);

  useEffect(() => {
    const id = window.setInterval(() => void sync(), SYNC_MS);
    const onWake = () => {
      if (document.visibilityState === "visible") void sync();
    };
    window.addEventListener("focus", onWake);
    document.addEventListener("visibilitychange", onWake);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onWake);
      document.removeEventListener("visibilitychange", onWake);
    };
  }, [sync]);

  return null;
}
