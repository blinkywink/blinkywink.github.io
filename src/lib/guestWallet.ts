/** Guest wallet - persists without an account (cookie + localStorage). */

export type GuestWallet = {
  coins: number;
};

const COOKIE_KEY = "ba_guest";
const LS_KEY = "bloon-arcade:guest-wallet";
const MAX_AGE_DAYS = 400;

function clampNonNeg(n: unknown): number {
  const v = Math.floor(Number(n));
  if (!Number.isFinite(v) || v < 0) return 0;
  return v;
}

function parseWallet(raw: string | null | undefined): GuestWallet | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as Partial<GuestWallet>;
    return {
      coins: clampNonNeg(data.coins),
    };
  } catch {
    return null;
  }
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const parts = document.cookie.split("; ");
  for (const part of parts) {
    const i = part.indexOf("=");
    if (i === -1) continue;
    if (part.slice(0, i) === name) {
      return decodeURIComponent(part.slice(i + 1));
    }
  }
  return null;
}

function writeCookie(name: string, value: string) {
  if (typeof document === "undefined") return;
  const maxAge = MAX_AGE_DAYS * 24 * 60 * 60;
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; samesite=lax`;
}

export function emptyGuestWallet(): GuestWallet {
  return { coins: 0 };
}

export function loadGuestWallet(): GuestWallet {
  if (typeof window === "undefined") return emptyGuestWallet();
  const fromLs = parseWallet(window.localStorage.getItem(LS_KEY));
  if (fromLs) return fromLs;
  const fromCookie = parseWallet(readCookie(COOKIE_KEY));
  if (fromCookie) {
    saveGuestWallet(fromCookie);
    return fromCookie;
  }
  return emptyGuestWallet();
}

export function saveGuestWallet(wallet: GuestWallet): GuestWallet {
  const next: GuestWallet = {
    coins: clampNonNeg(wallet.coins),
  };
  if (typeof window !== "undefined") {
    const raw = JSON.stringify(next);
    try {
      window.localStorage.setItem(LS_KEY, raw);
    } catch {
      // private mode / quota
    }
    writeCookie(COOKIE_KEY, raw);
  }
  return next;
}

export function awardGuestCoins(amount: number): number {
  const n = Math.round(amount);
  if (!Number.isFinite(n) || n < 1) {
    return loadGuestWallet().coins;
  }
  const cur = loadGuestWallet();
  return saveGuestWallet({ coins: cur.coins + n }).coins;
}

/** Returns new balance, or null if not enough coins. */
export function spendGuestCoins(amount: number): number | null {
  const n = Math.round(amount);
  if (!Number.isFinite(n) || n < 1) return null;
  const cur = loadGuestWallet();
  if (cur.coins < n) return null;
  return saveGuestWallet({ coins: cur.coins - n }).coins;
}
