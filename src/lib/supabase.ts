import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { loadAppSession } from "../auth/session";

/** Repair env typos / minify mangling: `https:/host` → `https://host`. */
function normalizeSupabaseUrl(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  let u = raw.trim().replace(/^["']|["']$/g, "");
  if (!u) return undefined;
  // Common copy/paste or minify bug: only one slash after https:
  u = u.replace(/^(https?:)\/(?!\/)/i, "$1//");
  if (!/^https?:\/\//i.test(u)) {
    u = `https://${u.replace(/^\/+/, "")}`;
  }
  return u.replace(/\/+$/, "");
}

const url = normalizeSupabaseUrl(
  import.meta.env.VITE_SUPABASE_URL as string | undefined,
);
const publishableKey = (
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined
)
  ?.trim()
  .replace(/^["']|["']$/g, "");

/** False when Vercel/local env is missing VITE_SUPABASE_* — app stays guest-only. */
export const supabaseConfigured = Boolean(url && publishableKey);

/** Normalized project URL (for health checks / desktop online gate). */
export const supabaseUrl = url ?? null;
export const supabasePublishableKey = publishableKey ?? null;

/** Opaque session token → sent as x-bloon-session (not a JWT). */
let sessionToken: string | null = loadAppSession()?.accessToken ?? null;

export function setAccessToken(token: string | null) {
  sessionToken = token;
}

export function getAccessToken(): string | null {
  return sessionToken;
}

function makeClient(): SupabaseClient<Database> {
  // Placeholder keeps module import from killing the whole page when env is missing.
  const safeUrl = url || "https://example.supabase.co";
  const safeKey = publishableKey || "public-anon-key";

  return createClient<Database>(safeUrl, safeKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: (input, init) => {
        if (!supabaseConfigured) {
          return Promise.reject(
            new Error(
              "Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.",
            ),
          );
        }
        const headers = new Headers(init?.headers);
        if (sessionToken) {
          headers.set("x-bloon-session", sessionToken);
        } else {
          headers.delete("x-bloon-session");
        }
        return fetch(input, { ...init, headers });
      },
    },
  });
}

export const supabase = makeClient();
