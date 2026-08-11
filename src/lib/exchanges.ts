import { getAccessToken, supabase } from "./supabase";
import { loadAppSession } from "../auth/session";
import { cached, cacheInvalidate, CacheTtl } from "./cache";

export type ExchangeInboxItem = {
  id: string;
  partnerId: string;
  partnerUsername: string;
  status: string;
  cardId: string;
  price: number;
  theirDegree: number;
  myDegree: number;
  createdAt: string;
};

export type ExchangeInbox = {
  incoming: ExchangeInboxItem[];
  outgoing: ExchangeInboxItem[];
};

function requireSession() {
  const app = loadAppSession();
  if (!getAccessToken() || !app) {
    throw new Error("Sign in to exchange cards.");
  }
  return app;
}

function asItems(raw: unknown): ExchangeInboxItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: String(r.id),
      partnerId: String(r.partnerId ?? ""),
      partnerUsername: String(r.partnerUsername ?? "Player"),
      status: String(r.status ?? ""),
      cardId: String(r.cardId ?? ""),
      price: Math.max(0, Number(r.price) || 0),
      theirDegree: Math.max(1, Number(r.theirDegree) || 1),
      myDegree: Math.max(1, Number(r.myDegree) || 1),
      createdAt: String(r.createdAt ?? ""),
    };
  });
}

export async function requestExchange(
  username: string,
  cardId: string,
): Promise<string> {
  requireSession();
  const { data, error } = await supabase.rpc("request_exchange", {
    p_username: username.trim(),
    p_card_id: cardId.trim(),
  });
  if (error) throw new Error(error.message);
  cacheInvalidate("exchange:inbox");
  cacheInvalidate("trade:inbox");
  return String(data);
}

export async function respondExchange(
  exchangeId: string,
  accept: boolean,
  price = 0,
): Promise<"completed" | "declined"> {
  requireSession();
  const { data, error } = await supabase.rpc("respond_exchange", {
    p_exchange_id: exchangeId,
    p_accept: accept,
    p_price: Math.max(0, Math.floor(price)),
  });
  if (error) throw new Error(error.message);
  cacheInvalidate("exchange:inbox");
  cacheInvalidate("trade:inbox");
  return data === "completed" ? "completed" : "declined";
}

export async function cancelExchange(exchangeId: string): Promise<void> {
  requireSession();
  const { error } = await supabase.rpc("cancel_exchange", {
    p_exchange_id: exchangeId,
  });
  if (error) throw new Error(error.message);
  cacheInvalidate("exchange:inbox");
  cacheInvalidate("trade:inbox");
}

export async function fetchExchangeInbox(
  opts?: { force?: boolean },
): Promise<ExchangeInbox> {
  requireSession();
  return cached(
    "exchange:inbox",
    CacheTtl.inbox,
    async () => {
      const { data, error } = await supabase.rpc("get_exchange_inbox");
      if (error) throw new Error(error.message);
      const raw = (data ?? {}) as Record<string, unknown>;
      return {
        incoming: asItems(raw.incoming),
        outgoing: asItems(raw.outgoing),
      };
    },
    opts,
  );
}
