import { supabaseConfigured, supabaseUrl, supabasePublishableKey } from "./supabase";

/** True when running inside the Tauri desktop shell (same web app code). */
export function isDesktopShell(): boolean {
  if (typeof window === "undefined") return false;
  return (
    "__TAURI_INTERNALS__" in window ||
    Boolean(import.meta.env.TAURI_ENV_PLATFORM)
  );
}

/**
 * Desktop must reach Supabase before play (no offline / local-only mode).
 * Returns true, or an error message string.
 */
export async function assertOnlineBackend(
  timeoutMs = 8000,
): Promise<true | string> {
  if (!navigator.onLine) {
    return "No internet connection.";
  }
  if (!supabaseConfigured || !supabaseUrl || !supabasePublishableKey) {
    return "Missing server config.";
  }

  try {
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(`${supabaseUrl}/auth/v1/health`, {
      method: "GET",
      signal: ctrl.signal,
      headers: {
        apikey: supabasePublishableKey,
        Authorization: `Bearer ${supabasePublishableKey}`,
      },
    });
    window.clearTimeout(timer);
    if (!res.ok) return "Game servers are unreachable right now.";
    return true;
  } catch {
    return "Could not reach the game servers. Check your internet and try again.";
  }
}

export function offlineGateHtml(message: string): string {
  return `
    <div style="min-height:100dvh;display:grid;place-items:center;padding:2rem;font-family:system-ui,sans-serif;background:#0c0c10;color:#f0f0f4;text-align:center">
      <div style="max-width:28rem">
        <h1 style="font-size:1.4rem;margin:0 0 0.75rem">Internet required</h1>
        <p style="margin:0 0 1rem;line-height:1.5;color:rgba(240,240,244,0.75)">${message}</p>
        <button type="button" id="desktop-online-retry" style="appearance:none;border:0;border-radius:999px;padding:0.65rem 1.2rem;font-weight:700;cursor:pointer;background:#f0c84a;color:#1a1408">
          Retry
        </button>
      </div>
    </div>
  `;
}
