import { useCallback, useEffect, useRef } from "react";
import { useAuth } from "../auth/AuthProvider";
import { useCardCollection } from "../auth/CardCollectionProvider";
import { loadAppSession } from "../auth/session";
import { startVisiblePoll } from "../lib/visiblePoll";

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
      await Promise.all([refreshProfile(), refresh()]);
    } catch (err) {
      console.warn("Live player sync failed", err);
    } finally {
      busyRef.current = false;
    }
  }, [isGuest, refresh, refreshProfile, session, signOut]);

  useEffect(() => {
    return startVisiblePoll(() => void sync(), SYNC_MS);
  }, [sync]);

  return null;
}
