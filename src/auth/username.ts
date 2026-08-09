/** Synthetic email so Supabase Auth can store username+password accounts. */
const AUTH_EMAIL_DOMAIN = "users.bloonarcade.local";

export function normalizeUsername(raw: string): string {
  return raw.trim();
}

export function isValidUsername(username: string): boolean {
  return /^[a-zA-Z0-9_]{3,24}$/.test(username);
}

export function usernameToAuthEmail(username: string): string {
  return `${username.toLowerCase()}@${AUTH_EMAIL_DOMAIN}`;
}

export function displayNameFromUser(user: {
  user_metadata?: Record<string, unknown> | null;
  email?: string | null;
}): string | null {
  const meta = user.user_metadata?.username;
  if (typeof meta === "string" && meta.trim()) return meta.trim();

  const email = user.email;
  if (email?.endsWith(`@${AUTH_EMAIL_DOMAIN}`)) {
    return email.slice(0, -(AUTH_EMAIL_DOMAIN.length + 1));
  }
  return null;
}
