/** App session for custom username auth (not Supabase email Auth). */

export type AppSession = {
  accessToken: string;
  userId: string;
  username: string;
  expiresAt: number;
};

const STORAGE_KEY = "bloon-arcade:app-session";

export function loadAppSession(): AppSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
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
      clearAppSession();
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveAppSession(session: AppSession) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearAppSession() {
  localStorage.removeItem(STORAGE_KEY);
}
