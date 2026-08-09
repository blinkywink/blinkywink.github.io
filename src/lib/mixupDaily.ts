import {
  dayStamp,
  formatShopCountdown,
  nextUtcMidnightMs,
} from "./packTheme";
import { getAccessToken, supabase } from "./supabase";
import { loadAppSession } from "../auth/session";

const LS_KEY = "bloon-arcade:mixup:last-day";

export function mixupDayKey(d = new Date()): string {
  return dayStamp(d);
}

export function mixupUnlockAtMs(now = new Date()): number {
  return nextUtcMidnightMs(now);
}

export function formatMixupUnlock(ms: number): string {
  return formatShopCountdown(ms);
}

function loadLocalDay(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(LS_KEY);
    return v && /^\d{4}-\d{1,2}-\d{1,2}$/.test(v) ? v : null;
  } catch {
    return null;
  }
}

function saveLocalDay(day: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LS_KEY, day);
  } catch {
    // ignore
  }
}

export type MixupDailyStatus = {
  day: string;
  completed: boolean;
};

/** Has this browser / account already finished today's Mix Up? */
export async function fetchMixupDailyStatus(): Promise<MixupDailyStatus> {
  const today = mixupDayKey();
  const local = loadLocalDay();
  const localDone = local === today;

  if (!getAccessToken() || !loadAppSession()) {
    return { day: today, completed: localDone };
  }

  const { data, error } = await supabase.rpc("get_mixup_daily_status");
  if (error) {
    console.warn("get_mixup_daily_status failed", error.message);
    return { day: today, completed: localDone };
  }
  const raw = data as { completed?: unknown } | null;
  // Always use client UTC dayStamp for puzzles (matches generateMixupRun).
  const completed = Boolean(raw?.completed) || localDone;
  if (completed) saveLocalDay(today);
  return { day: today, completed };
}

/**
 * Reserve today's Mix Up completion.
 * Returns true if this was the first clear (OK to pay Cash).
 * Guests always get true once locally unmarked.
 */
export async function completeMixupDaily(): Promise<boolean> {
  const today = mixupDayKey();
  const alreadyLocal = loadLocalDay() === today;

  if (!getAccessToken() || !loadAppSession()) {
    if (alreadyLocal) return false;
    saveLocalDay(today);
    return true;
  }

  const { data, error } = await supabase.rpc("complete_mixup_daily");
  if (error) {
    console.warn("complete_mixup_daily failed", error.message);
    // Fallback: still lock locally so they can't farm mid-offline.
    if (alreadyLocal) return false;
    saveLocalDay(today);
    return true;
  }

  const claimed = Boolean((data as { claimed?: unknown } | null)?.claimed);
  saveLocalDay(today);
  return claimed;
}
