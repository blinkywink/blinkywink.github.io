import { getAccessToken, supabase } from "./supabase";
import { awardGuestCoins, loadGuestWallet } from "./guestWallet";
import { emitSessionInvalid, isNotAuthenticatedError, loadAppSession, rpcErrorText } from "../auth/session";
import { GAME_PATHS, type GamePath } from "./routes";
import { GAME_STAT_LABELS } from "./accountStats";

const LS_KEY = "bloon-arcade:game-farm";
export const FARM_UNIQUE_WINS_NEED = 4;
export const FARM_STREAK_PAUSE = 5;
export const FARM_SPAM_LOCK_MS = 20 * 60 * 1000;

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
    need: FARM_UNIQUE_WINS_NEED,
    paused: {},
    spamUntil: {},
    lastGame: null,
    streak: 0,
  };
}

function parsePaused(raw: unknown): Partial<Record<GamePath, GamePath[]>> {
  const out: Partial<Record<GamePath, GamePath[]>> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!isGamePath(k)) continue;
    const wins = Array.isArray(v)
      ? v.map(String).filter(isGamePath).filter((id) => id !== k)
      : [];
    out[k] = [...new Set(wins)];
  }
  return out;
}

function parseSpam(raw: unknown): Partial<Record<GamePath, string>> {
  const out: Partial<Record<GamePath, string>> = {};
  const now = Date.now();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!isGamePath(k)) continue;
    const ts = Date.parse(String(v ?? ""));
    if (!Number.isFinite(ts) || ts <= now) continue;
    out[k] = new Date(ts).toISOString();
  }
  return out;
}

function snapshotFromStored(
  st: StoredFarm,
  game: GamePath | null,
  extra: Partial<GameFarmSnapshot> = {},
): GameFarmSnapshot {
  const spamUntil = parseSpam(st.spamUntil);
  const paused = st.paused;
  const gid = game && isGamePath(game) ? game : null;
  const spam = Boolean(gid && spamUntil[gid]);
  const isPaused = Boolean(gid && paused[gid]);
  const wins = gid ? (paused[gid] ?? []) : [];
  let reason: GameFarmReason = extra.reason ?? "ok";
  if (spam) reason = "spam";
  else if (isPaused) reason = "paused";
  return {
    coins: extra.coins ?? null,
    paid: extra.paid ?? 0,
    canPay: extra.canPay ?? (!spam && !isPaused),
    reason,
    justPaused: extra.justPaused ?? false,
    game: gid,
    have: wins.length,
    need: FARM_UNIQUE_WINS_NEED,
    paused,
    spamUntil,
    lastGame: st.lastGame,
    streak: st.streak,
  };
}

function readGuest(): StoredFarm {
  if (typeof window === "undefined") return { ...EMPTY_STORED, paused: {}, spamUntil: {}, lastPayAt: {}, fastStreak: {} };
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return { ...EMPTY_STORED, paused: {}, spamUntil: {}, lastPayAt: {}, fastStreak: {} };
    const obj = JSON.parse(raw) as Partial<StoredFarm>;
    const lastGame = isGamePath(obj.lastGame ?? "") ? obj.lastGame! : null;
    return {
      lastGame,
      streak: Math.max(0, Math.floor(Number(obj.streak) || 0)),
      paused: parsePaused(obj.paused),
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
    return { ...EMPTY_STORED, paused: {}, spamUntil: {}, lastPayAt: {}, fastStreak: {} };
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

function parseSnap(raw: unknown, fallbackGame: GamePath | null): GameFarmSnapshot {
  if (!raw || typeof raw !== "object") return emptySnap(fallbackGame);
  const obj = raw as Record<string, unknown>;
  const game = isGamePath(String(obj.game ?? ""))
    ? (obj.game as GamePath)
    : fallbackGame;
  const reasonRaw = String(obj.reason ?? "ok");
  const reason: GameFarmReason =
    reasonRaw === "paused" || reasonRaw === "spam" ? reasonRaw : "ok";
  const coins =
    typeof obj.coins === "number" && Number.isFinite(obj.coins)
      ? obj.coins
      : obj.coins == null
        ? null
        : Number(obj.coins) || null;
  return {
    coins,
    paid: Math.max(0, Math.floor(Number(obj.paid) || 0)),
    canPay: obj.canPay !== false && reason === "ok",
    reason,
    justPaused: Boolean(obj.justPaused),
    game,
    have: Math.max(0, Math.floor(Number(obj.have) || 0)),
    need: Math.max(1, Math.floor(Number(obj.need) || FARM_UNIQUE_WINS_NEED)),
    paused: parsePaused(obj.paused),
    spamUntil: parseSpam(obj.spamUntil),
    lastGame: isGamePath(String(obj.lastGame ?? ""))
      ? (obj.lastGame as GamePath)
      : null,
    streak: Math.max(0, Math.floor(Number(obj.streak) || 0)),
  };
}

function guestNoteRun(game: GamePath, won: boolean): GameFarmSnapshot {
  const st = readGuest();
  const paused = { ...st.paused };
  if (won) {
    for (const [pausedId, wins] of Object.entries(paused) as [GamePath, GamePath[]][]) {
      if (pausedId === game) continue;
      const next = [...new Set([...(wins ?? []), game])];
      if (next.length >= FARM_UNIQUE_WINS_NEED) delete paused[pausedId];
      else paused[pausedId] = next;
    }
  }
  const streak = st.lastGame === game ? st.streak + 1 : 1;
  let justPaused = false;
  if (streak >= FARM_STREAK_PAUSE && !paused[game]) {
    paused[game] = [];
    justPaused = true;
  }
  const next: StoredFarm = { ...st, lastGame: game, streak, paused };
  writeGuest(next);
  return snapshotFromStored(next, game, { justPaused });
}

function guestFlagSpam(game: GamePath): GameFarmSnapshot {
  const st = readGuest();
  const until = new Date(Date.now() + FARM_SPAM_LOCK_MS).toISOString();
  const next: StoredFarm = {
    ...st,
    spamUntil: { ...st.spamUntil, [game]: until },
  };
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
  const fast = Date.now() - last < 800 ? (st.fastStreak[game] ?? 0) + 1 : 0;
  if (fast >= 4) {
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
  if (!signedIn()) return snapshotFromStored(readGuest(), game);
  const { data, error } = await supabase.rpc("get_game_farm", {
    p_game_id: game,
  });
  if (error) {
    console.warn("get_game_farm failed", error.message);
    if (isNotAuthenticatedError(rpcErrorText(error))) emitSessionInvalid();
    return emptySnap(game);
  }
  return parseSnap(data, game);
}

export async function noteGameFarmRun(
  game: GamePath,
  won: boolean,
): Promise<GameFarmSnapshot> {
  if (!signedIn()) return guestNoteRun(game, won);
  const { data, error } = await supabase.rpc("note_game_run", {
    p_game_id: game,
    p_won: won,
  });
  if (error) {
    console.warn("note_game_run failed", error.message);
    if (isNotAuthenticatedError(rpcErrorText(error))) emitSessionInvalid();
    return emptySnap(game);
  }
  return parseSnap(data, game);
}

export async function flagGameSpam(game: GamePath): Promise<GameFarmSnapshot> {
  const snap = !signedIn()
    ? guestFlagSpam(game)
    : await (async () => {
        const { data, error } = await supabase.rpc("flag_game_spam", {
          p_game_id: game,
        });
        if (error) {
          console.warn("flag_game_spam failed", error.message);
          if (isNotAuthenticatedError(rpcErrorText(error))) emitSessionInvalid();
          return guestFlagSpam(game);
        }
        return parseSnap(data, game);
      })();
  emitGameFarm(snap);
  return snap;
}

export async function awardGameCoins(
  amount: number,
  game: GamePath,
): Promise<GameFarmSnapshot> {
  const rounded = Math.round(amount);
  if (!Number.isFinite(rounded) || rounded < 1) {
    return { ...emptySnap(game), coins: loadGuestWallet().coins };
  }
  if (!signedIn()) return guestTryPay(game, rounded);

  const { data, error } = await supabase.rpc("award_game_coins", {
    p_amount: rounded,
    p_game_id: game,
  });
  if (error) {
    console.warn("award_game_coins failed", error.message);
    if (isNotAuthenticatedError(rpcErrorText(error))) emitSessionInvalid();
    return emptySnap(game);
  }
  return parseSnap(data, game);
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
  const out = new Set<GamePath>();
  for (const id of GAME_PATHS) {
    if (spamUnlockMs(snap, id) > 0 || snap.paused[id]) out.add(id);
  }
  return [...out];
}

export function emitGameFarm(snap: GameFarmSnapshot) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("monkeycards:game-farm", { detail: snap }),
  );
}
