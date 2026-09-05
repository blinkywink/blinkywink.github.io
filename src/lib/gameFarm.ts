import { getAccessToken, supabase } from "./supabase";
import { awardGuestCoins, loadGuestWallet } from "./guestWallet";
import {
  emitSessionInvalid,
  isNotAuthenticatedError,
  loadAppSession,
  rpcErrorText,
} from "../auth/session";
import { GAME_PATHS, type GamePath } from "./routes";
import { GAME_STAT_LABELS } from "./accountStats";

const LS_KEY = "bloon-arcade:game-farm";
/** Client-side spam timers so the games page still shows them if the server lag/fails. */
const LS_SPAM_KEY = "bloon-arcade:game-farm-spam-v1";
/** Same game this many completed runs in a row → short No Cash cool-off. */
export const FARM_STREAK_PAUSE = 5;
/** Cool-off after farming one game 5× in a row. */
export const FARM_STREAK_COOL_MS = 2 * 60 * 1000;
/** Cool-off after instant-click / fast-award spam. */
export const FARM_SPAM_LOCK_MS = 20 * 60 * 1000;

/** @deprecated unique-wins unlock removed; kept for old snapshots. */
export const FARM_UNIQUE_WINS_NEED = 0;

export type GameFarmReason = "ok" | "paused" | "spam";

export type GameFarmSnapshot = {
  coins: number | null;
  paid: number;
  canPay: boolean;
  reason: GameFarmReason;
  justPaused: boolean;
  game: GamePath | null;
  have: number;
  need: number;
  paused: Partial<Record<GamePath, GamePath[]>>;
  spamUntil: Partial<Record<GamePath, string>>;
  lastGame: GamePath | null;
  streak: number;
};

type StoredFarm = {
  lastGame: GamePath | null;
  streak: number;
  paused: Partial<Record<GamePath, GamePath[]>>;
  spamUntil: Partial<Record<GamePath, string>>;
  lastPayAt: Partial<Record<GamePath, number>>;
  fastStreak: Partial<Record<GamePath, number>>;
};

const EMPTY_STORED: StoredFarm = {
  lastGame: null,
  streak: 0,
  paused: {},
  spamUntil: {},
  lastPayAt: {},
  fastStreak: {},
};

function isGamePath(v: string | null | undefined): v is GamePath {
  return Boolean(v && (GAME_PATHS as readonly string[]).includes(v));
}

function signedIn(): boolean {
  return Boolean(getAccessToken() && loadAppSession()?.userId);
}

function emptySnap(game: GamePath | null = null): GameFarmSnapshot {
  return {
    coins: null,
    paid: 0,
    canPay: true,
    reason: "ok",
    justPaused: false,
    game,
    have: 0,
    need: 0,
    paused: {},
    spamUntil: {},
    lastGame: null,
    streak: 0,
  };
}

function parseSpam(raw: unknown): Partial<Record<GamePath, string>> {
  const out: Partial<Record<GamePath, string>> = {};
  const now = Date.now();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!isGamePath(k)) continue;
    const ts = Date.parse(String(v ?? "").replace(" ", "T"));
    if (!Number.isFinite(ts) || ts <= now) continue;
    out[k] = new Date(ts).toISOString();
  }
  return out;
}

function mergeSpamMaps(
  ...maps: Array<Partial<Record<GamePath, string>> | null | undefined>
): Partial<Record<GamePath, string>> {
  const out: Partial<Record<GamePath, string>> = {};
  const now = Date.now();
  for (const map of maps) {
    if (!map) continue;
    for (const [k, iso] of Object.entries(map) as [GamePath, string][]) {
      if (!isGamePath(k) || !iso) continue;
      const ts = Date.parse(iso);
      if (!Number.isFinite(ts) || ts <= now) continue;
      const prev = out[k] ? Date.parse(out[k]!) : 0;
      if (ts >= prev) out[k] = new Date(ts).toISOString();
    }
  }
  return out;
}

function readLocalSpam(): Partial<Record<GamePath, string>> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(LS_SPAM_KEY);
    if (!raw) return {};
    return parseSpam(JSON.parse(raw));
  } catch {
    return {};
  }
}

/** Replace the local mirror with a full cloud snapshot (fetch). */
function replaceSpamCache(
  spam: Partial<Record<GamePath, string>>,
): Partial<Record<GamePath, string>> {
  const cleaned = parseSpam(spam);
  if (typeof window === "undefined") return cleaned;
  try {
    if (Object.keys(cleaned).length === 0) {
      window.localStorage.removeItem(LS_SPAM_KEY);
    } else {
      window.localStorage.setItem(LS_SPAM_KEY, JSON.stringify(cleaned));
    }
  } catch {
    /* ignore */
  }
  return cleaned;
}

/**
 * Merge one game's mute into the mirror without wiping other games' timers.
 * Price Check and Order Up (etc.) each keep their own countdown.
 */
function mergeSpamCache(
  spam: Partial<Record<GamePath, string>>,
): Partial<Record<GamePath, string>> {
  return replaceSpamCache(mergeSpamMaps(readLocalSpam(), spam));
}

/**
 * Optimistic mute mirror so the games page can paint instantly.
 * Cloud write must still succeed — this alone is not anti-cheat.
 */
export function rememberGameMute(game: GamePath, untilMs: number): void {
  const until = new Date(Math.max(Date.now() + 1000, untilMs)).toISOString();
  mergeSpamCache({ [game]: until });
}

/** Seed UI from the last server mirror (may be empty). */
export function peekCachedFarm(
  game: GamePath | null = null,
): GameFarmSnapshot {
  return snapshotFromStored(
    { ...EMPTY_STORED, spamUntil: readLocalSpam() },
    game,
  );
}

/** Full cloud fetch — replace cache with server truth for every game. */
function adoptFullFarm(snap: GameFarmSnapshot): GameFarmSnapshot {
  const spamUntil = replaceSpamCache(snap.spamUntil);
  return decorateMute(snap, spamUntil);
}

/** Partial update (flag one game) — merge so other games' timers stay. */
function adoptPartialFarm(snap: GameFarmSnapshot): GameFarmSnapshot {
  const spamUntil = mergeSpamCache(snap.spamUntil);
  return decorateMute(snap, spamUntil);
}

function decorateMute(
  snap: GameFarmSnapshot,
  spamUntil: Partial<Record<GamePath, string>>,
): GameFarmSnapshot {
  const gid = snap.game;
  const muted = Boolean(gid && spamUntil[gid]);
  return {
    ...snap,
    spamUntil,
    canPay: !muted,
    reason: muted
      ? snap.reason === "paused"
        ? "paused"
        : "spam"
      : "ok",
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => {
    const t = globalThis.setTimeout ?? setTimeout;
    t(r, ms);
  });
}

function extendMute(
  spamUntil: Partial<Record<GamePath, string>>,
  game: GamePath,
  untilMs: number,
): Partial<Record<GamePath, string>> {
  const nextIso = new Date(untilMs).toISOString();
  const cur = spamUntil[game];
  if (cur && Date.parse(cur) >= untilMs) return spamUntil;
  return { ...spamUntil, [game]: nextIso };
}

function snapshotFromStored(
  st: StoredFarm,
  game: GamePath | null,
  extra: Partial<GameFarmSnapshot> = {},
): GameFarmSnapshot {
  const spamUntil = parseSpam(st.spamUntil);
  const gid = game && isGamePath(game) ? game : null;
  const muted = Boolean(gid && spamUntil[gid]);
  let reason: GameFarmReason = extra.reason ?? "ok";
  if (muted && reason === "ok") reason = "spam";
  return {
    coins: extra.coins ?? null,
    paid: extra.paid ?? 0,
    canPay: extra.canPay ?? !muted,
    reason: muted ? reason : "ok",
    justPaused: extra.justPaused ?? false,
    game: gid,
    have: 0,
    need: 0,
    paused: {},
    spamUntil,
    lastGame: st.lastGame,
    streak: st.streak,
  };
}

function readGuest(): StoredFarm {
  if (typeof window === "undefined") {
    return { ...EMPTY_STORED };
  }
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return { ...EMPTY_STORED };
    const obj = JSON.parse(raw) as Partial<StoredFarm>;
    const lastGame = isGamePath(obj.lastGame ?? "") ? obj.lastGame! : null;
    return {
      lastGame,
      streak: Math.max(0, Math.floor(Number(obj.streak) || 0)),
      paused: {},
      spamUntil: parseSpam(obj.spamUntil),
      lastPayAt:
        obj.lastPayAt && typeof obj.lastPayAt === "object"
          ? (obj.lastPayAt as StoredFarm["lastPayAt"])
          : {},
      fastStreak:
        obj.fastStreak && typeof obj.fastStreak === "object"
          ? (obj.fastStreak as StoredFarm["fastStreak"])
          : {},
    };
  } catch {
    return { ...EMPTY_STORED };
  }
}

function writeGuest(st: StoredFarm) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(st));
  } catch {
    /* ignore */
  }
}

function parseSnap(
  raw: unknown,
  fallbackGame: GamePath | null,
): GameFarmSnapshot {
  if (!raw || typeof raw !== "object") return emptySnap(fallbackGame);
  const obj = raw as Record<string, unknown>;
  const game = isGamePath(String(obj.game ?? ""))
    ? (obj.game as GamePath)
    : fallbackGame;
  const reasonRaw = String(obj.reason ?? "ok");
  const reason: GameFarmReason =
    reasonRaw === "paused" || reasonRaw === "spam" ? reasonRaw : "ok";
  const spamUntil = parseSpam(obj.spamUntil);
  const muted = Boolean(game && spamUntil[game]);
  const coins =
    typeof obj.coins === "number" && Number.isFinite(obj.coins)
      ? obj.coins
      : obj.coins == null
        ? null
        : Number(obj.coins) || null;
  return {
    coins,
    paid: Math.max(0, Math.floor(Number(obj.paid) || 0)),
    canPay: obj.canPay !== false && !muted,
    reason: muted ? (reason === "ok" ? "spam" : reason) : "ok",
    justPaused: Boolean(obj.justPaused),
    game,
    have: 0,
    need: 0,
    paused: {},
    spamUntil,
    lastGame: isGamePath(String(obj.lastGame ?? ""))
      ? (obj.lastGame as GamePath)
      : null,
    streak: Math.max(0, Math.floor(Number(obj.streak) || 0)),
  };
}

function guestNoteRun(game: GamePath, _won: boolean): GameFarmSnapshot {
  const st = readGuest();
  let streak = st.lastGame === game ? st.streak + 1 : 1;
  let justPaused = false;
  let spamUntil = { ...st.spamUntil };
  if (streak >= FARM_STREAK_PAUSE) {
    spamUntil = extendMute(
      spamUntil,
      game,
      Date.now() + FARM_STREAK_COOL_MS,
    );
    justPaused = true;
    streak = 0;
  }
  const next: StoredFarm = {
    ...st,
    lastGame: game,
    streak,
    spamUntil,
    paused: {},
  };
  writeGuest(next);
  return snapshotFromStored(next, game, {
    justPaused,
    reason: justPaused ? "paused" : "ok",
  });
}

function guestFlagSpam(game: GamePath): GameFarmSnapshot {
  const st = readGuest();
  const spamUntil = extendMute(
    st.spamUntil,
    game,
    Date.now() + FARM_SPAM_LOCK_MS,
  );
  const next: StoredFarm = { ...st, spamUntil };
  writeGuest(next);
  return snapshotFromStored(next, game, { reason: "spam", canPay: false });
}

function guestTryPay(game: GamePath, amount: number): GameFarmSnapshot {
  const st = readGuest();
  const snap = snapshotFromStored(st, game);
  if (!snap.canPay) {
    return { ...snap, coins: loadGuestWallet().coins, paid: 0 };
  }

  const last = st.lastPayAt[game] ?? 0;
  const fast = Date.now() - last < 4000 ? (st.fastStreak[game] ?? 0) + 1 : 0;
  if (fast >= 3) {
    return guestFlagSpam(game);
  }
  const coins = awardGuestCoins(amount);
  const next: StoredFarm = {
    ...st,
    lastPayAt: { ...st.lastPayAt, [game]: Date.now() },
    fastStreak: { ...st.fastStreak, [game]: fast },
  };
  writeGuest(next);
  return snapshotFromStored(next, game, {
    coins,
    paid: amount,
    canPay: true,
  });
}

export function parseGameFarmSnapshot(
  raw: unknown,
  game: GamePath | null = null,
): GameFarmSnapshot {
  return parseSnap(raw, game);
}

export async function fetchGameFarm(
  game: GamePath | null = null,
): Promise<GameFarmSnapshot> {
  if (!signedIn()) {
    return adoptFullFarm(snapshotFromStored(readGuest(), game));
  }
  const { data, error } = await supabase.rpc("get_game_farm", {
    p_game_id: game,
  });
  if (error) {
    console.warn("get_game_farm failed", error.message);
    if (isNotAuthenticatedError(rpcErrorText(error))) emitSessionInvalid();
    // Soft fallback: last cloud mirror only (not a place to invent locks).
    return peekCachedFarm(game);
  }
  // Cloud is source of truth — full map for every game.
  return adoptFullFarm(parseSnap(data, game));
}

export async function noteGameFarmRun(
  game: GamePath,
  won: boolean,
): Promise<GameFarmSnapshot> {
  if (!signedIn()) {
    let snap = adoptPartialFarm(guestNoteRun(game, won));
    if (snap.justPaused) {
      const until = Date.now() + Math.max(spamUnlockMs(snap, game), FARM_STREAK_COOL_MS);
      rememberGameMute(game, until);
      snap = adoptPartialFarm({
        ...snap,
        canPay: false,
        reason: "paused",
        spamUntil: {
          ...snap.spamUntil,
          [game]: new Date(until).toISOString(),
        },
      });
    }
    emitGameFarm(snap);
    return snap;
  }
  const { data, error } = await supabase.rpc("note_game_run", {
    p_game_id: game,
    p_won: won,
  });
  if (error) {
    console.warn("note_game_run failed", error.message);
    if (isNotAuthenticatedError(rpcErrorText(error))) emitSessionInvalid();
    return peekCachedFarm(game);
  }
  // Server snapshot includes the full spamUntil map.
  let snap = adoptFullFarm(parseSnap(data, game));
  // 5 same-game runs → always a 2-minute mute on THIS game (cloud + UI).
  if (snap.justPaused || (snap.reason === "paused" && spamUnlockMs(snap, game) > 0)) {
    const until =
      Date.now() +
      Math.max(spamUnlockMs(snap, game), FARM_STREAK_COOL_MS);
    rememberGameMute(game, until);
    snap = adoptPartialFarm({
      ...snap,
      canPay: false,
      reason: "paused",
      justPaused: true,
      spamUntil: {
        ...snap.spamUntil,
        [game]: new Date(until).toISOString(),
      },
    });
  }
  emitGameFarm(snap);
  return snap;
}

export async function flagGameSpam(game: GamePath): Promise<GameFarmSnapshot> {
  const untilMs = Date.now() + FARM_SPAM_LOCK_MS;
  // Optimistic mirror for this device's games page while cloud write lands.
  rememberGameMute(game, untilMs);

  if (!signedIn()) {
    const snap = adoptPartialFarm(guestFlagSpam(game));
    emitGameFarm(snap);
    return snap;
  }

  let lastError: string | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await supabase.rpc("flag_game_spam", {
      p_game_id: game,
    });
    if (!error) {
      // Full map from cloud (other games' timers preserved server-side).
      let snap = adoptFullFarm(parseSnap(data, game));
      if (spamUnlockMs(snap, game) <= 0) {
        snap = await fetchGameFarm(game);
      }
      if (spamUnlockMs(snap, game) <= 0) {
        rememberGameMute(game, untilMs);
        snap = adoptPartialFarm({
          ...snap,
          canPay: false,
          reason: "spam",
          spamUntil: {
            ...snap.spamUntil,
            [game]: new Date(untilMs).toISOString(),
          },
        });
      }
      emitGameFarm(snap);
      return snap;
    }
    lastError = error.message;
    if (isNotAuthenticatedError(rpcErrorText(error))) {
      emitSessionInvalid();
      break;
    }
    await sleep(200 * (attempt + 1));
  }

  console.warn("flag_game_spam failed after retries", lastError);
  const optimistic = adoptPartialFarm({
    ...emptySnap(game),
    canPay: false,
    reason: "spam",
    spamUntil: mergeSpamMaps(readLocalSpam(), {
      [game]: new Date(untilMs).toISOString(),
    }),
  });
  emitGameFarm(optimistic);
  return optimistic;
}

export async function awardGameCoins(
  amount: number,
  game: GamePath,
): Promise<GameFarmSnapshot> {
  const rounded = Math.round(amount);
  if (!Number.isFinite(rounded) || rounded < 1) {
    return { ...emptySnap(game), coins: loadGuestWallet().coins };
  }
  if (!signedIn()) {
    const snap = adoptPartialFarm(guestTryPay(game, rounded));
    if (!snap.canPay || snap.reason !== "ok") emitGameFarm(snap);
    return snap;
  }

  const { data, error } = await supabase.rpc("award_game_coins", {
    p_amount: rounded,
    p_game_id: game,
  });
  if (error) {
    console.warn("award_game_coins failed", error.message);
    if (isNotAuthenticatedError(rpcErrorText(error))) emitSessionInvalid();
    return peekCachedFarm(game);
  }
  const snap = adoptFullFarm(parseSnap(data, game));
  if (!snap.canPay || snap.reason !== "ok" || snap.justPaused) {
    emitGameFarm(snap);
  }
  return snap;
}

export function farmGameLabel(id: GamePath): string {
  return GAME_STAT_LABELS[id] ?? id;
}

export function spamUnlockMs(snap: GameFarmSnapshot, game: GamePath): number {
  const raw = snap.spamUntil[game];
  if (!raw) return 0;
  const ts = Date.parse(raw);
  if (!Number.isFinite(ts)) return 0;
  return Math.max(0, ts - Date.now());
}

export function formatSpamClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function formatSpamWait(ms: number): string {
  return formatSpamClock(ms);
}

export function farmNoPayGames(
  snap: GameFarmSnapshot | null | undefined,
): GamePath[] {
  if (!snap) return [];
  const out: GamePath[] = [];
  for (const id of GAME_PATHS) {
    if (spamUnlockMs(snap, id) > 0) out.push(id);
  }
  return out;
}

export function emitGameFarm(snap: GameFarmSnapshot) {
  if (typeof window === "undefined") return;
  // Merge so a one-game update never wipes other games' timers in the UI.
  const detail = adoptPartialFarm(snap);
  window.dispatchEvent(
    new CustomEvent("monkeycards:game-farm", { detail }),
  );
}
