import {
  CATEGORY_ORDER,
  type TowerCategory,
} from "./packTheme";
import { getAccessToken, supabase } from "./supabase";
import { loadAppSession } from "../auth/session";

const LS_PREFIX = "bloon-arcade:free-category-packs:";
const LS_MIGRATED_PREFIX = "bloon-arcade:free-category-packs-migrated:";
export const FREE_CATEGORY_PACKS_CHANGED =
  "bloon-arcade:free-category-packs-changed";

export type FreeCategoryCounts = Record<TowerCategory, number>;

type MemoryCache = {
  userId: string | null;
  counts: FreeCategoryCounts;
};

let memory: MemoryCache | null = null;

function emptyCounts(): FreeCategoryCounts {
  return {
    Primary: 0,
    Military: 0,
    Magic: 0,
    Support: 0,
  };
}

function storageKey(userId: string | null | undefined): string {
  return `${LS_PREFIX}${userId || "guest"}`;
}

function isCategory(v: string): v is TowerCategory {
  return (CATEGORY_ORDER as readonly string[]).includes(v);
}

export function parseFreeCategoryCounts(raw: unknown): FreeCategoryCounts {
  const out = emptyCounts();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  const obj = raw as Record<string, unknown>;
  for (const cat of CATEGORY_ORDER) {
    const n = obj[cat];
    if (typeof n === "number" && Number.isFinite(n) && n > 0) {
      out[cat] = Math.floor(n);
    } else if (typeof n === "string" && Number.isFinite(Number(n))) {
      const v = Math.floor(Number(n));
      if (v > 0) out[cat] = v;
    }
  }
  return out;
}

function readLocalForKey(userId: string | null | undefined): FreeCategoryCounts {
  if (typeof window === "undefined") return emptyCounts();
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return emptyCounts();
    return parseFreeCategoryCounts(JSON.parse(raw));
  } catch {
    return emptyCounts();
  }
}

function readGuestLocal(): FreeCategoryCounts {
  return readLocalForKey(null);
}

async function migrateLocalCreditsOnce(userId: string): Promise<void> {
  if (typeof window === "undefined") return;
  const flag = `${LS_MIGRATED_PREFIX}${userId}`;
  try {
    if (window.localStorage.getItem(flag)) return;
    window.localStorage.setItem(flag, "1");
  } catch {
    return;
  }
  const local = readLocalForKey(userId);
  for (const cat of CATEGORY_ORDER) {
    const n = local[cat] ?? 0;
    for (let i = 0; i < n; i++) {
      const { error } = await supabase.rpc("grant_free_category_pack", {
        p_category: cat,
      });
      if (error) break;
    }
  }
  try {
    window.localStorage.removeItem(storageKey(userId));
  } catch {
    // ignore
  }
}

function writeGuestLocal(counts: FreeCategoryCounts): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(null), JSON.stringify(counts));
  } catch {
    // ignore
  }
}

function notify(counts: FreeCategoryCounts): void {
  try {
    window.dispatchEvent(
      new CustomEvent(FREE_CATEGORY_PACKS_CHANGED, { detail: counts }),
    );
  } catch {
    // ignore
  }
}

export function applyFreeCategoryCounts(
  userId: string | null | undefined,
  counts: FreeCategoryCounts,
): void {
  const uid = userId ?? null;
  memory = { userId: uid, counts: { ...counts } };
  if (!uid) writeGuestLocal(counts);
  notify(counts);
}

/** Sync snapshot for UI. Prefer refreshFreeCategoryPacks for truth. */
export function getFreeCategoryCounts(
  userId: string | null | undefined,
): FreeCategoryCounts {
  const uid = userId ?? null;
  if (memory && memory.userId === uid) return { ...memory.counts };
  if (!uid) return readGuestLocal();
  return emptyCounts();
}

export function getFreeCategoryCount(
  userId: string | null | undefined,
  category: TowerCategory,
): number {
  return getFreeCategoryCounts(userId)[category] ?? 0;
}

function signedInUserId(): string | null {
  if (!getAccessToken()) return null;
  return loadAppSession()?.userId ?? null;
}

/** Pull authoritative counts from the server (or guest localStorage). */
export async function refreshFreeCategoryPacks(
  userId?: string | null,
): Promise<FreeCategoryCounts> {
  const uid = userId === undefined ? signedInUserId() : userId ?? null;
  if (!uid || !getAccessToken()) {
    const local = readGuestLocal();
    applyFreeCategoryCounts(null, local);
    return local;
  }

  const { data, error } = await supabase.rpc("get_free_category_packs");
  if (error) {
    console.warn("Failed to load free category packs", error.message);
    // Fall back to whatever we last knew for this user - never invent packs.
    const cached =
      memory?.userId === uid ? memory.counts : emptyCounts();
    applyFreeCategoryCounts(uid, cached);
    return cached;
  }
  let counts = parseFreeCategoryCounts(data);

  // One-time lift of pre-sync local credits onto the account.
  const hadLocal = CATEGORY_ORDER.some((c) => readLocalForKey(uid)[c] > 0);
  if (hadLocal) {
    await migrateLocalCreditsOnce(uid);
    const again = await supabase.rpc("get_free_category_packs");
    if (!again.error) counts = parseFreeCategoryCounts(again.data);
  }

  applyFreeCategoryCounts(uid, counts);
  return counts;
}

/**
 * Grant one free open. Signed-in users hit the server; guests use localStorage.
 * Returns null if the server rejects the grant.
 */
export async function grantFreeCategoryPack(
  userId: string | null | undefined,
  category?: TowerCategory,
): Promise<TowerCategory | null> {
  const pick =
    category && isCategory(category)
      ? category
      : CATEGORY_ORDER[Math.floor(Math.random() * CATEGORY_ORDER.length)]!;

  const uid = userId ?? null;
  if (uid && getAccessToken()) {
    const { data, error } = await supabase.rpc("grant_free_category_pack", {
      p_category: pick,
    });
    if (error) {
      console.warn("Failed to grant free category pack", error.message);
      return null;
    }
    const payload = data as { category?: string; counts?: unknown } | null;
    const granted =
      typeof payload?.category === "string" && isCategory(payload.category)
        ? payload.category
        : pick;
    applyFreeCategoryCounts(uid, parseFreeCategoryCounts(payload?.counts));
    return granted;
  }

  // Guest / offline: local only.
  const next = readGuestLocal();
  next[pick] = (next[pick] ?? 0) + 1;
  applyFreeCategoryCounts(null, next);
  return pick;
}

/**
 * Consume one free open. Signed-in users must succeed on the server.
 * Returns false when the server says there is nothing left.
 */
export async function consumeFreeCategoryPack(
  userId: string | null | undefined,
  category: TowerCategory,
): Promise<boolean> {
  if (!isCategory(category)) return false;
  const uid = userId ?? null;

  if (uid && getAccessToken()) {
    const { data, error } = await supabase.rpc("consume_free_category_pack", {
      p_category: category,
    });
    if (error) {
      // Stale UI - resync so we stop offering free opens.
      void refreshFreeCategoryPacks(uid);
      return false;
    }
    const payload = data as { counts?: unknown } | null;
    applyFreeCategoryCounts(uid, parseFreeCategoryCounts(payload?.counts));
    return true;
  }

  const next = readGuestLocal();
  const cur = next[category] ?? 0;
  if (cur < 1) return false;
  next[category] = cur - 1;
  applyFreeCategoryCounts(null, next);
  return true;
}

export function subscribeFreeCategoryPacks(cb: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const onCustom = () => cb();
  window.addEventListener(FREE_CATEGORY_PACKS_CHANGED, onCustom);
  return () => {
    window.removeEventListener(FREE_CATEGORY_PACKS_CHANGED, onCustom);
  };
}
