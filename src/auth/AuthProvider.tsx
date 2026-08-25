import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Profile } from "../lib/database.types";
import { setAccessToken, supabase } from "../lib/supabase";
import {
  loadGuestWallet,
  saveGuestWallet,
} from "../lib/guestWallet";
import { mergeGuestProgressIntoAccount } from "../lib/mergeGuestProgress";
import { subscribeRouteEnter } from "../lib/navigationRefresh";
import { reconcileSiteThemeWithAccount } from "../lib/siteTheme";
import {
  maybeAwardLevel20HeroBadge,
  maybeAwardOwnsAllHeroesBadge,
} from "../lib/profileBadges";
import { isValidUsername, normalizeUsername } from "./username";
import {
  clearAppSession,
  loadAppSession,
  saveAppSession,
  type AppSession,
} from "./session";
import { parseFreeCategoryCounts, refreshFreeCategoryPacks } from "../lib/freeCategoryPacks";

const GUEST_ID = "guest";

function profileFromGuest(coins: number): Profile {
  const now = new Date().toISOString();
  return {
    id: GUEST_ID,
    username: "Guest",
    coins,
    coins_earned: coins,
    shop_spent: 0,
    monkey_money: 0,
    last_daily_claim: null,
    last_daily_card_claim: null,
    last_bloonle_day: null,
    last_blowfree_day: null,
    avatar_card_id: null,
    avatar_zoom: 1.25,
    avatar_x: 0.5,
    avatar_y: 0.38,
    showcase_card_ids: [],
    showcase_slots: 0,
    accent_unlocked: false,
    accent_color: null,
    aura_unlocked: false,
    aura_card_id: null,
    owned_hero_ids: [],
    equipped_hero_id: null,
    hero_levels: {},
    hero_clear_progress: {},
    created_at: now,
    updated_at: now,
  };
}

function loadGuestProfile(): Profile {
  const w = loadGuestWallet();
  return profileFromGuest(w.coins);
}

type AuthUser = { id: string; username: string };

type AuthContextValue = {
  ready: boolean;
  session: AppSession | null;
  user: AuthUser | null;
  profile: Profile | null;
  isGuest: boolean;
  displayName: string;
  refreshProfile: () => Promise<void>;
  setCoinBalance: (coins: number) => void;
  /** True when signed in and daily Cash has not been claimed today (UTC). */
  dailyClaimAvailable: boolean;
  /** True when signed in and daily card has not been claimed today (UTC). */
  dailyCardClaimAvailable: boolean;
  claimDailyCash: () => Promise<{
    error: string | null;
    amount?: number;
    coins?: number;
    already?: boolean;
  }>;
  claimDailyCard: () => Promise<{ error: string | null; already?: boolean }>;
  signUp: (input: {
    username: string;
    password: string;
  }) => Promise<{ error: string | null }>;
  signIn: (input: {
    username: string;
    password: string;
  }) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
};

export function utcToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function parseRpcJson<T extends Record<string, unknown>>(data: unknown): T | null {
  if (data == null) return null;
  if (typeof data === "string") {
    try {
      return JSON.parse(data) as T;
    } catch {
      return null;
    }
  }
  if (typeof data === "object" && !Array.isArray(data)) {
    return data as T;
  }
  return null;
}

/** PostgREST sometimes puts the exception text in details/hint, not message. */
function rpcErrorText(error: {
  message?: string;
  details?: string | null;
  hint?: string | null;
  code?: string;
}): string {
  return [error.message, error.details, error.hint, error.code]
    .filter(Boolean)
    .join(" ");
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.warn("Failed to load profile", error.message);
    return null;
  }
  if (!data) return null;
  const profile: Profile = {
    ...data,
    last_daily_claim: data.last_daily_claim
      ? String(data.last_daily_claim).slice(0, 10)
      : null,
    last_daily_card_claim: data.last_daily_card_claim
      ? String(data.last_daily_card_claim).slice(0, 10)
      : null,
    last_bloonle_day: data.last_bloonle_day
      ? String(data.last_bloonle_day).slice(0, 10)
      : null,
    last_blowfree_day: data.last_blowfree_day
      ? String(data.last_blowfree_day).slice(0, 10)
      : null,
    avatar_card_id: data.avatar_card_id ?? null,
    avatar_zoom: Number(data.avatar_zoom ?? 1.25),
    avatar_x: Number(data.avatar_x ?? 0.5),
    avatar_y: Number(data.avatar_y ?? 0.38),
    showcase_card_ids: Array.isArray(data.showcase_card_ids)
      ? data.showcase_card_ids.map(String)
      : [],
    site_themes_unlocked: Array.isArray(data.site_themes_unlocked)
      ? data.site_themes_unlocked.map(String)
      : [],
    owned_hero_ids: Array.isArray(data.owned_hero_ids)
      ? data.owned_hero_ids.map(String)
      : [],
    equipped_hero_id: data.equipped_hero_id
      ? String(data.equipped_hero_id)
      : null,
    hero_levels:
      data.hero_levels &&
      typeof data.hero_levels === "object" &&
      !Array.isArray(data.hero_levels)
        ? (data.hero_levels as Record<string, number>)
        : {},
    hero_clear_progress:
      data.hero_clear_progress &&
      typeof data.hero_clear_progress === "object" &&
      !Array.isArray(data.hero_clear_progress)
        ? (data.hero_clear_progress as Record<string, number>)
        : {},
    free_category_packs: parseFreeCategoryCounts(
      (data as { free_category_packs?: unknown }).free_category_packs,
    ),
  };

  // Free pack balances are owned by grant/consume/get RPCs.
  // Do not overwrite the in-memory cache from a profile select - that race
  // (hero clear refresh right after a grant) was wiping fresh credits.
  return profile;
}

type RpcSession = {
  access_token: string;
  user_id: string;
  username: string;
  expires_at: number;
};

function mapRpcError(message: string | undefined): string {
  const m = message ?? "Auth failed.";
  if (m.includes("USERNAME_TAKEN")) return "That username is already taken.";
  if (m.includes("INVALID_USERNAME")) {
    return "Username must be 3-24 characters (letters, numbers, underscores).";
  }
  if (m.includes("INVALID_PASSWORD")) {
    return "Password must be at least 6 characters.";
  }
  if (m.includes("BAD_CREDENTIALS")) return "Wrong username or password.";
  return m;
}

function toAppSession(raw: RpcSession): AppSession {
  return {
    accessToken: raw.access_token,
    userId: raw.user_id,
    username: raw.username,
    expiresAt: Number(raw.expires_at),
  };
}

function applySession(session: AppSession | null) {
  if (session) {
    saveAppSession(session);
    setAccessToken(session.accessToken);
  } else {
    clearAppSession();
    setAccessToken(null);
  }
}

async function authRpc(
  fn: "username_signup" | "username_signin",
  username: string,
  password: string,
): Promise<{ session: AppSession | null; error: string | null }> {
  const { data, error } = await supabase.rpc(fn, {
    p_username: username,
    p_password: password,
  });

  if (error) {
    return { session: null, error: mapRpcError(error.message) };
  }

  const raw = data as RpcSession | null;
  if (!raw?.access_token || !raw.user_id) {
    return { session: null, error: "Auth failed." };
  }
  return { session: toAppSession(raw), error: null };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<AppSession | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  const refreshProfile = useCallback(async () => {
    const userId = session?.userId;
    if (!userId) {
      setProfile(loadGuestProfile());
      return;
    }
    const next = await fetchProfile(userId);
    if (next) {
      setProfile(next);
      await reconcileSiteThemeWithAccount(next.site_theme);
    }
  }, [session?.userId]);

  useEffect(() => {
    if (!profile || profile.id === GUEST_ID) return;
    void maybeAwardLevel20HeroBadge(profile.hero_levels);
    void maybeAwardOwnsAllHeroesBadge(profile.owned_hero_ids);
  }, [profile]);

  useEffect(() => {
    const existing = loadAppSession();
    if (existing) {
      setAccessToken(existing.accessToken);
      setSession(existing);
    } else {
      setAccessToken(null);
      setProfile(loadGuestProfile());
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;

    void (async () => {
      const userId = session?.userId;
      if (!userId) {
        if (!cancelled) setProfile(loadGuestProfile());
        return;
      }
      await mergeGuestProgressIntoAccount();
      if (cancelled) return;
      const loaded = await fetchProfile(userId);
      if (cancelled || !loaded) return;
      setProfile(loaded);
      await reconcileSiteThemeWithAccount(loaded.site_theme);
      if (!cancelled) void refreshFreeCategoryPacks(userId);
    })();

    return () => {
      cancelled = true;
    };
  }, [ready, session?.userId]);

  useEffect(() => {
    return subscribeRouteEnter((pathname) => {
      if (pathname === "/profile" || pathname === "/shop") {
        void refreshProfile();
      }
    });
  }, [refreshProfile]);

  const signUp = useCallback(
    async (input: { username: string; password: string }) => {
      const username = normalizeUsername(input.username);
      if (!isValidUsername(username)) {
        return {
          error:
            "Username must be 3-24 characters (letters, numbers, underscores).",
        };
      }
      if (input.password.length < 6) {
        return { error: "Password must be at least 6 characters." };
      }

      const { session: next, error } = await authRpc(
        "username_signup",
        username,
        input.password,
      );
      if (error || !next) return { error: error ?? "Sign up failed." };

      applySession(next);
      setSession(next);
      return { error: null };
    },
    [],
  );

  const signIn = useCallback(
    async (input: { username: string; password: string }) => {
      const username = normalizeUsername(input.username);
      if (!username) return { error: "Enter your username." };

      const { session: next, error } = await authRpc(
        "username_signin",
        username,
        input.password,
      );
      if (error || !next) return { error: error ?? "Sign in failed." };

      applySession(next);
      setSession(next);
      return { error: null };
    },
    [],
  );

  const signOut = useCallback(async () => {
    applySession(null);
    setSession(null);
    setProfile(loadGuestProfile());
  }, []);

  const setCoinBalance = useCallback(
    (coins: number) => {
      const nextCoins = Math.max(0, Math.floor(coins));
      setProfile((prev) => {
        const signedIn = Boolean(session?.userId);
        if (!signedIn) {
          saveGuestWallet({ coins: nextCoins });
          return profileFromGuest(nextCoins);
        }
        return prev ? { ...prev, coins: nextCoins } : prev;
      });
    },
    [session?.userId],
  );

  const isGuest = !session?.userId;
  const user = session
    ? { id: session.userId, username: session.username }
    : null;

  const dailyClaimAvailable = Boolean(
    !isGuest &&
      profile &&
      profile.id !== GUEST_ID &&
      profile.last_daily_claim !== utcToday(),
  );

  const dailyCardClaimAvailable = Boolean(
    !isGuest &&
      profile &&
      profile.id !== GUEST_ID &&
      profile.last_daily_card_claim !== utcToday(),
  );

  const claimDailyCash = useCallback(async () => {
    if (!session?.userId) {
      return { error: "Sign in to claim daily Cash." };
    }
    const { data, error } = await supabase.rpc("claim_daily_cash");
    if (error) {
      const msg = rpcErrorText(error);
      if (/ALREADY_CLAIMED/i.test(msg)) {
        // Server already paid today - sync local state so the button grays out.
        const fresh = await fetchProfile(session.userId);
        if (fresh) {
          setProfile(fresh);
          return { error: null, already: true, coins: fresh.coins };
        }
        setProfile((prev) =>
          prev ? { ...prev, last_daily_claim: utcToday() } : prev,
        );
        return { error: null, already: true };
      }
      if (/integer out of range/i.test(msg)) {
        return {
          error: "Cash is over the old 2.1B limit - ask an admin to run coins_bigint.sql.",
        };
      }
      return { error: msg || "Claim failed. Try again." };
    }
    const raw = parseRpcJson<{
      amount?: number;
      coins?: number | string;
      last_daily_claim?: string;
    }>(data);
    if (raw?.coins == null) {
      // Claim may have succeeded without a parseable payload - refresh.
      const fresh = await fetchProfile(session.userId);
      if (fresh?.last_daily_claim === utcToday()) {
        setProfile(fresh);
        return {
          error: null,
          already: true,
          coins: fresh.coins,
        };
      }
      return { error: "Claim failed. Try again." };
    }
    const day = String(raw.last_daily_claim ?? utcToday()).slice(0, 10);
    const coins = Number(raw.coins);
    const amount = Number(raw.amount) || 500;
    setProfile((prev) =>
      prev
        ? {
            ...prev,
            coins,
            coins_earned: (prev.coins_earned ?? 0) + amount,
            last_daily_claim: day,
          }
        : prev,
    );
    return {
      error: null,
      amount,
      coins,
    };
  }, [session?.userId]);

  const claimDailyCard = useCallback(async () => {
    if (!session?.userId) {
      return { error: "Sign in to claim the daily card." };
    }
    const { data, error } = await supabase.rpc("claim_daily_card");
    if (error) {
      const msg = rpcErrorText(error);
      if (/ALREADY_CLAIMED/i.test(msg)) {
        setProfile((prev) =>
          prev ? { ...prev, last_daily_card_claim: utcToday() } : prev,
        );
        return { error: null, already: true };
      }
      return { error: msg || "Claim failed. Try again." };
    }
    const raw = parseRpcJson<{ last_daily_card_claim?: string }>(data);
    const day = String(raw?.last_daily_card_claim ?? utcToday()).slice(0, 10);
    setProfile((prev) =>
      prev ? { ...prev, last_daily_card_claim: day } : prev,
    );
    return { error: null };
  }, [session?.userId]);

  const displayName = useMemo(() => {
    if (isGuest) return "Guest";
    if (profile?.username && profile.id !== GUEST_ID) return profile.username;
    return session?.username ?? "Player";
  }, [isGuest, profile, session]);

  const value = useMemo<AuthContextValue>(
    () => ({
      ready,
      session,
      user,
      profile,
      isGuest,
      displayName,
      refreshProfile,
      setCoinBalance,
      dailyClaimAvailable,
      dailyCardClaimAvailable,
      claimDailyCash,
      claimDailyCard,
      signUp,
      signIn,
      signOut,
    }),
    [
      ready,
      session,
      user,
      profile,
      isGuest,
      displayName,
      refreshProfile,
      setCoinBalance,
      dailyClaimAvailable,
      dailyCardClaimAvailable,
      claimDailyCash,
      claimDailyCard,
      signUp,
      signIn,
      signOut,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return ctx;
}
