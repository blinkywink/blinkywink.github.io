import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { loadAppSession } from "../auth/session";

const url = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !publishableKey) {
  throw new Error(
    "Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY. Copy .env.example to .env.local.",
  );
}

/** Opaque session token → sent as x-bloon-session (not a JWT). */
let sessionToken: string | null = loadAppSession()?.accessToken ?? null;

export function setAccessToken(token: string | null) {
  sessionToken = token;
}

export function getAccessToken(): string | null {
  return sessionToken;
}

export const supabase = createClient<Database>(url, publishableKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
  global: {
    fetch: (input, init) => {
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
