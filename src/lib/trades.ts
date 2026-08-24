import { getAccessToken, supabase } from "./supabase";
import { loadAppSession } from "../auth/session";
import { cached, cacheInvalidate, CacheTtl } from "./cache";

export type TradeInboxItem = {
  id: string;
  partnerId: string;
  partnerUsername: string;
  status: string;
  createdAt: string;
};

export type TradeInbox = {
  incoming: TradeInboxItem[];
  outgoing: TradeInboxItem[];
  active: TradeInboxItem[];
};

export type TradeState = {
  id: string;
  status: string;
  requesterId: string;
  recipientId: string;
  requesterUsername: string;
  recipientUsername: string;
  requesterReady: boolean;
  recipientReady: boolean;
  myOffer: string[];
  theirOffer: string[];
  updatedAt: string;
  createdAt: string;
};

function requireSession() {
  const app = loadAppSession();
  if (!getAccessToken() || !app) {
    throw new Error("Sign in to trade.");
  }
  return app;
}

function asInboxItems(raw: unknown): TradeInboxItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: String(r.id),
      partnerId: String(r.partnerId ?? ""),
      partnerUsername: String(r.partnerUsername ?? "Player"),
      status: String(r.status ?? ""),
      createdAt: String(r.createdAt ?? ""),
    };
  });
}

function asTradeState(raw: unknown): TradeState {
  const r = (raw ?? {}) as Record<string, unknown>;
  const myOffer = Array.isArray(r.myOffer)
    ? r.myOffer.map(String)
    : [];
  const theirOffer = Array.isArray(r.theirOffer)
    ? r.theirOffer.map(String)
    : [];
  return {
    id: String(r.id),
    status: String(r.status ?? ""),
    requesterId: String(r.requesterId ?? ""),
    recipientId: String(r.recipientId ?? ""),
    requesterUsername: String(r.requesterUsername ?? "Player"),
    recipientUsername: String(r.recipientUsername ?? "Player"),
    requesterReady: Boolean(r.requesterReady),
    recipientReady: Boolean(r.recipientReady),
    myOffer,
    theirOffer,
    updatedAt: String(r.updatedAt ?? ""),
    createdAt: String(r.createdAt ?? ""),
  };
}

export async function requestTrade(username: string): Promise<string> {
  requireSession();
  const { data, error } = await supabase.rpc("request_trade", {
    p_username: username.trim(),
  });
  if (error) throw new Error(error.message);
  cacheInvalidate("trade:inbox");
  return String(data);
}

export async function respondTrade(
  tradeId: string,
  accept: boolean,
): Promise<"active" | "declined"> {
  requireSession();
  const { data, error } = await supabase.rpc("respond_trade", {
    p_trade_id: tradeId,
    p_accept: accept,
  });
  if (error) throw new Error(error.message);
  cacheInvalidate("trade:inbox");
  return data === "active" ? "active" : "declined";
}

export async function cancelTrade(tradeId: string): Promise<void> {
  requireSession();
  const { error } = await supabase.rpc("cancel_trade", {
    p_trade_id: tradeId,
  });
  if (error) throw new Error(error.message);
  cacheInvalidate("trade:inbox");
}

export async function fetchTradeInbox(
  opts?: { force?: boolean },
): Promise<TradeInbox> {
  requireSession();
  return cached(
    "trade:inbox",
    CacheTtl.inbox,
    async () => {
      const { data, error } = await supabase.rpc("get_trade_inbox");
      if (error) throw new Error(error.message);
      const raw = (data ?? {}) as Record<string, unknown>;
      return {
        incoming: asInboxItems(raw.incoming),
        outgoing: asInboxItems(raw.outgoing),
        active: asInboxItems(raw.active),
      };
    },
    opts,
  );
}

export async function fetchTrade(tradeId: string): Promise<TradeState> {
  requireSession();
  const { data, error } = await supabase.rpc("get_trade", {
    p_trade_id: tradeId,
  });
  if (error) throw new Error(error.message);
  return asTradeState(data);
}

export async function setTradeOffer(
  tradeId: string,
  cardIds: string[],
): Promise<void> {
  requireSession();
  const { error } = await supabase.rpc("set_trade_offer", {
    p_trade_id: tradeId,
    p_card_ids: cardIds,
    p_cash: 0,
  });
  if (error) throw new Error(error.message);
}

export async function setTradeReady(
  tradeId: string,
  ready: boolean,
): Promise<TradeState> {
  requireSession();
  const { data, error } = await supabase.rpc("set_trade_ready", {
    p_trade_id: tradeId,
    p_ready: ready,
  });
  if (error) throw new Error(error.message);
  const next = asTradeState(data);
  cacheInvalidate("trade:inbox");
  return next;
}

function findChannel(topicSuffix: string) {
  return supabase
    .getChannels()
    .find(
      (c) =>
        c.topic === topicSuffix ||
        c.topic.endsWith(`:${topicSuffix}`) ||
        c.topic.endsWith(topicSuffix),
    );
}

async function broadcastPing(channelName: string): Promise<void> {
  const existing = findChannel(channelName);
  if (existing) {
    await existing.send({
      type: "broadcast",
      event: "ping",
      payload: { t: Date.now() },
    });
    return;
  }

  const channel = supabase.channel(channelName);
  await new Promise<void>((resolve) => {
    const timer = window.setTimeout(() => {
      void supabase.removeChannel(channel);
      resolve();
    }, 4000);
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        window.clearTimeout(timer);
        void channel
          .send({
            type: "broadcast",
            event: "ping",
            payload: { t: Date.now() },
          })
          .finally(() => {
            void supabase.removeChannel(channel);
            resolve();
          });
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        window.clearTimeout(timer);
        void supabase.removeChannel(channel);
        resolve();
      }
    });
  });
}

/** Live poke - Realtime broadcast (no Supabase Auth required). */
export function subscribeInboxChannel(
  userId: string,
  onPing: () => void,
): () => void {
  const channel = supabase.channel(`inbox:${userId}`);
  channel.on("broadcast", { event: "ping" }, () => onPing()).subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

export async function pingInbox(userId: string): Promise<void> {
  await broadcastPing(`inbox:${userId}`);
}

export function subscribeTradeChannel(
  tradeId: string,
  onPing: () => void,
): () => void {
  const channel = supabase.channel(`trade:${tradeId}`);
  channel.on("broadcast", { event: "ping" }, () => onPing()).subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

export async function pingTrade(tradeId: string): Promise<void> {
  await broadcastPing(`trade:${tradeId}`);
}
