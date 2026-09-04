/** App session for custom username auth (not Supabase email Auth). */

export type AppSession = {
  accessToken: string;
  userId: string;
  username: string;
  expiresAt: number;
};

const LEGACY_KEY = "bloon-arcade:app-session";
export const SESSION_INVALID_EVENT = "bloon-arcade:session-invalid";

function apiHost(): string {
  const raw = String(import.meta.env.VITE_SUPABASE_URL ?? "").trim();
  try {
    return new URL(raw).host || "api";
  } catch {
    return raw.replace(/[^\w.-]+/g, "") || "api";
  }
}

function storageKey(): string {
  return `${LEGACY_KEY}:${apiHost()}`;
}

function parseSession(raw: string | null): AppSession | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as AppSession;
    if (
      !parsed?.accessToken ||
      !parsed?.userId ||
      !parsed?.username ||
      !parsed?.expiresAt
    ) {
      return null;
    }
    if (parsed.expiresAt * 1000 < Date.now() + 30_000) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function loadAppSession(): AppSession | null {
  try {
    const current = parseSession(localStorage.getItem(storageKey()));
    if (current) return current;
    // Old builds stored one token for every API host. Keep it only until
    // the next save so a leftover cloud login can't silently fail RPCs.
    return parseSession(localStorage.getItem(LEGACY_KEY));
  } catch {
    return null;
  }
}

export function saveAppSession(session: AppSession) {
  localStorage.setItem(storageKey(), JSON.stringify(session));
  localStorage.removeItem(LEGACY_KEY);
}

export function clearAppSession() {
  try {
    localStorage.removeItem(storageKey());
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* ignore */
  }
}

export function isNotAuthenticatedError(raw: string | undefined | null): boolean {
  return /not authenticated/i.test(String(raw ?? ""));
}

export function rpcErrorText(error: {
  message?: string;
  details?: string | null;
  hint?: string | null;
  code?: string;
} | null | undefined): string {
  if (!error) return "";
  return [error.message, error.details, error.hint, error.code]
    .filter(Boolean)
    .join(" ");
}

/** User-visible RPC text. Maps leftover/stale logins off the raw Postgres error. */
export function userFacingRpcError(
  error: {
    message?: string;
    details?: string | null;
    hint?: string | null;
    code?: string;
  } | null | undefined,
  unauthenticated = "Sign in again.",
): string {
  const raw = rpcErrorText(error);
  if (isNotAuthenticatedError(raw)) return unauthenticated;
  const cleaned = String(error?.message ?? raw)
    .replace(/^PGRST\d+:\s*/i, "")
    .trim();
  return cleaned || "Request failed.";
}

/** Drop a stale/foreign-API login so the user can sign in again. */
export function emitSessionInvalid(): void {
  clearAppSession();
  try {
    window.dispatchEvent(new Event(SESSION_INVALID_EVENT));
  } catch {
    /* ignore */
  }
}
