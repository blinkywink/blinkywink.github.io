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
import { isValidUsername, normalizeUsername } from "./username";
import {
  clearAppSession,
  loadAppSession,
  saveAppSession,
  type AppSession,
} from "./session";

const GUEST_ID = "guest";

function profileFromGuest(coins: number): Profile {
  const now = new Date().toISOString();
  return {
    id: GUEST_ID,
    username: "Guest",
    coins,
    coins_earned: coins,
    monkey_money: 0,
    last_daily_claim: null,
    avatar_card_id: null,
    avatar_zoom: 1.35,
    avatar_x: 0.5,
    avatar_y: 0.42,
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
  claimDailyCash: () => Promise<{ error: string | null; amount?: number }>;
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
  return {
    ...data,
    last_daily_claim: data.last_daily_claim
      ? String(data.last_daily_claim).slice(0, 10)
      : null,
    avatar_card_id: data.avatar_card_id ?? null,
    avatar_zoom: Number(data.avatar_zoom ?? 1.35),
    avatar_x: Number(data.avatar_x ?? 0.5),
    avatar_y: Number(data.avatar_y ?? 0.42),
  };
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
    return "Username must be 3–24 characters (letters, numbers, underscores).";
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
    setProfile(await fetchProfile(userId));
  }, [session?.userId]);

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
      setProfile(await fetchProfile(userId));
    })();

    return () => {
      cancelled = true;
    };
  }, [ready, session?.userId]);

  const signUp = useCallback(
    async (input: { username: string; password: string }) => {
      const username = normalizeUsername(input.username);
      if (!isValidUsername(username)) {
        return {
          error:
            "Username must be 3–24 characters (letters, numbers, underscores).",
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

  const claimDailyCash = useCallback(async () => {
    if (!session?.userId) {
      return { error: "Sign in to claim daily Cash." };
    }
    const { data, error } = await supabase.rpc("claim_daily_cash");
    if (error) {
      if (error.message.includes("ALREADY_CLAIMED")) {
        return { error: "Already claimed today. Come back tomorrow." };
      }
      return { error: error.message };
    }
    const raw = data as {
      amount?: number;
      coins?: number;
      last_daily_claim?: string;
    } | null;
    if (raw?.coins == null) {
      return { error: "Claim failed." };
    }
    setProfile((prev) =>
      prev
        ? {
            ...prev,
            coins: Number(raw.coins),
            coins_earned: (prev.coins_earned ?? 0) + (Number(raw.amount) || 0),
            last_daily_claim: String(raw.last_daily_claim ?? utcToday()).slice(
              0,
              10,
            ),
          }
        : prev,
    );
    return { error: null, amount: Number(raw.amount) || 500 };
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
      claimDailyCash,
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
      claimDailyCash,
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
