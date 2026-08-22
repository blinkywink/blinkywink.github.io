/**
 * Pre-release audit + live smoke test for all client RPCs and core flows.
 *
 *   npx tsx scripts/pre-release-smoke-test.ts
 *
 * Creates ephemeral test accounts, exercises marketplace/trades/exchanges/packs/etc,
 * then deletes the test accounts. Requires .env.local with VITE_SUPABASE_* + SUPABASE_DB_URL.
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type Result = { name: string; ok: boolean; detail?: string };

const ROOT = resolve(import.meta.dirname, "..");
const ts = Date.now();
const USER_A = `smoke${ts}a`;
const USER_B = `smoke${ts}b`;
const PASS = `SmokeTest!${ts}`;

function loadEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  const path = resolve(ROOT, ".env.local");
  if (!existsSync(path)) throw new Error(".env.local missing");
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 1) continue;
    out[t.slice(0, i)] = t.slice(i + 1).trim();
  }
  return out;
}

function collectClientRpcs(): string[] {
  const names = new Set<string>();
  const walk = (dir: string) => {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      const p = resolve(dir, ent.name);
      if (ent.isDirectory()) {
        if (ent.name === "node_modules" || ent.name === "dist") continue;
        walk(p);
      } else if (/\.(ts|tsx)$/.test(ent.name)) {
        const src = readFileSync(p, "utf8");
        for (const m of src.matchAll(/\.rpc\(\s*["']([^"']+)["']/g)) {
          names.add(m[1]!);
        }
      }
    }
  };
  walk(resolve(ROOT, "src"));
  names.add("username_signup");
  names.add("username_signin");
  return [...names].sort();
}

function makeClient(
  url: string,
  key: string,
  token?: string,
): SupabaseClient {
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (token) headers.set("x-bloon-session", token);
        else headers.delete("x-bloon-session");
        return fetch(input, { ...init, headers });
      },
    },
  });
}

async function signUp(
  sb: SupabaseClient,
  username: string,
): Promise<{ token: string; userId: string }> {
  const { data, error } = await sb.rpc("username_signup", {
    p_username: username,
    p_password: PASS,
  });
  if (error) throw new Error(`signup ${username}: ${error.message}`);
  const raw = data as {
    access_token?: string;
    user_id?: string;
  } | null;
  if (!raw?.access_token || !raw.user_id) {
    throw new Error(`signup ${username}: bad payload`);
  }
  return { token: raw.access_token, userId: raw.user_id };
}

async function rpcOk(
  sb: SupabaseClient,
  name: string,
  args: Record<string, unknown> = {},
): Promise<unknown> {
  const { data, error } = await sb.rpc(name as never, args as never);
  if (error) throw new Error(`${name}: ${error.message}`);
  return data;
}

async function ensureDeleteHelper(pgClient: pg.Client): Promise<void> {
  const sqlPath = resolve(ROOT, "supabase/delete_accounts.sql");
  const sql = readFileSync(sqlPath, "utf8");
  await pgClient.query(sql);
}

async function auditRpcs(
  pgClient: pg.Client,
  clientRpcs: string[],
): Promise<Result[]> {
  const results: Result[] = [];
  for (const fn of clientRpcs) {
    const r = await pgClient.query(
      `select pg_get_functiondef(p.oid) d
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = $1 limit 1`,
      [fn],
    );
    if (!r.rows[0]) {
      results.push({ name: `rpc:${fn}`, ok: false, detail: "NOT FOUND on live DB" });
      continue;
    }
    const d = r.rows[0].d as string;
    const hasSession = d.includes("current_account_id()");
    const usesAuthUid = /auth\.uid\(\)/.test(d);
    const brokenAuth = usesAuthUid && !hasSession;
    const g = await pgClient.query(
      `select bool_or(grantee = 'anon') has_anon
       from information_schema.routine_privileges
       where routine_schema = 'public' and routine_name = $1
         and privilege_type = 'EXECUTE'`,
      [fn],
    );
    const hasAnon = Boolean(g.rows[0]?.has_anon);
    const ok = !brokenAuth && hasAnon;
    const parts: string[] = [];
    if (brokenAuth) parts.push("uses auth.uid() without session");
    if (!hasAnon) parts.push("missing anon EXECUTE");
    if (!hasSession && !brokenAuth) parts.push("read/other (no session ref)");
    else if (hasSession) parts.push("session auth OK");
    results.push({
      name: `rpc:${fn}`,
      ok,
      detail: parts.join("; "),
    });
  }

  // Any SECURITY DEFINER public functions that gate on auth.uid only
  const all = await pgClient.query(`
    select p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and pg_get_functiondef(p.oid) ~ 'auth\\.uid\\(\\)'
      and pg_get_functiondef(p.oid) !~ 'current_account_id\\(\\)'
    order by 1
  `);
  if (all.rows.length) {
    results.push({
      name: "audit:auth.uid-only-definer-funcs",
      ok: false,
      detail: all.rows.map((x) => x.proname).join(", "),
    });
  } else {
    results.push({
      name: "audit:auth.uid-only-definer-funcs",
      ok: true,
      detail: "none",
    });
  }
  return results;
}

async function smokeFlows(
  url: string,
  key: string,
  pgClient: pg.Client,
): Promise<Result[]> {
  const results: Result[] = [];
  const anon = makeClient(url, key);

  let tokenA = "";
  let tokenB = "";
  let userIdA = "";
  let userIdB = "";

  const push = (name: string, ok: boolean, detail?: string) => {
    results.push({ name, ok, detail });
    const mark = ok ? "PASS" : "FAIL";
    console.log(`  [${mark}] ${name}${detail ? ` — ${detail}` : ""}`);
  };

  try {
    ({ token: tokenA, userId: userIdA } = await signUp(anon, USER_A));
    push("auth:signup A", true);

    ({ token: tokenB, userId: userIdB } = await signUp(anon, USER_B));
    push("auth:signup B", true);

    const sbA = makeClient(url, key, tokenA);
    const sbB = makeClient(url, key, tokenB);

    // Profile read (table)
    const prof = await sbA.from("profiles").select("*").eq("id", userIdA).maybeSingle();
    push("table:profiles read", !prof.error && !!prof.data, prof.error?.message);

    const pub = await rpcOk(sbA, "get_profile_by_username", {
      p_username: USER_A,
    });
    push("profile:public lookup", Array.isArray(pub) && pub.length === 1);

    // Coins
    const coinsAfter = await rpcOk(sbA, "award_coins", { p_amount: 10_000 });
    push("economy:award_coins", Number(coinsAfter) >= 10_000, String(coinsAfter));

    const spent = await rpcOk(sbA, "spend_coins", { p_amount: 1000, p_shop: true });
    push("economy:spend_coins", Number(spent) === Number(coinsAfter) - 1000, String(spent));

    // Pack / collection (the bug we fixed)
    const cardA = "dart-monkey-000";
    const cardB = "dart-monkey-11";
    const cardC = "dart-monkey-12";
    const awarded = (await rpcOk(sbA, "award_cards", {
      p_card_ids: [cardA, cardB, cardC],
    })) as string[];
    push("packs:award_cards", awarded.includes(cardA), awarded.join(","));

    const ids = (await rpcOk(sbA, "get_player_cards", {
      p_user_id: userIdA,
    })) as string[];
    push(
      "collection:get_player_cards persists",
      ids.includes(cardA) && ids.includes(cardB),
      `${ids.length} cards`,
    );

    // Re-fetch after brief wait (simulates refresh)
    await new Promise((r) => setTimeout(r, 300));
    const { data: ownedRows, error: ownedErr } = await sbA
      .from("owned_cards")
      .select("card_id")
      .eq("user_id", userIdA);
    push(
      "table:owned_cards read",
      !ownedErr && (ownedRows?.length ?? 0) >= 3,
      ownedErr?.message ?? `${ownedRows?.length} rows`,
    );

    // Marketplace list + cancel
    const listingId = (await rpcOk(sbA, "list_card_for_sale", {
      p_card_id: cardB,
      p_price: 500,
    })) as string;
    push("market:list_card_for_sale", typeof listingId === "string" && listingId.length > 8);

    const { data: listings, error: listErr } = await sbA
      .from("marketplace_listings")
      .select("id,status")
      .eq("seller_id", userIdA)
      .eq("status", "active");
    push(
      "table:marketplace_listings read",
      !listErr && (listings?.length ?? 0) >= 1,
      listErr?.message,
    );

    await rpcOk(sbB, "award_coins", { p_amount: 5000 });
    await rpcOk(sbB, "spend_coins", { p_amount: 5000, p_shop: true });
    const offerId = (await rpcOk(sbB, "make_listing_offer", {
      p_listing_id: listingId,
      p_offer_price: 400,
    })) as string;
    push("market:make_listing_offer", typeof offerId === "string");

    const inbox = await rpcOk(sbA, "get_market_offer_inbox");
    push("market:get_market_offer_inbox", inbox != null);

    await rpcOk(sbA, "respond_listing_offer", {
      p_offer_id: offerId,
      p_accept: false,
    });
    push("market:respond_listing_offer decline", true);

    await rpcOk(sbA, "cancel_listing", { p_listing_id: listingId });
    push("market:cancel_listing", true);

    // Full buy flow
    const listing2 = (await rpcOk(sbA, "list_card_for_sale", {
      p_card_id: cardC,
      p_price: 250,
    })) as string;
    const balBefore = (await rpcOk(sbB, "buy_listing", {
      p_listing_id: listing2,
    })) as number;
    push("market:buy_listing", Number.isFinite(balBefore));

    const notices = await rpcOk(sbA, "get_market_sale_notices");
    push("market:get_market_sale_notices", notices != null);

    // Trades
    const tradeId = (await rpcOk(sbB, "request_trade", {
      p_username: USER_A,
    })) as string;
    push("trade:request_trade", typeof tradeId === "string");

    await rpcOk(sbA, "respond_trade", { p_trade_id: tradeId, p_accept: true });
    push("trade:respond_trade accept", true);

    await rpcOk(sbA, "set_trade_offer", {
      p_trade_id: tradeId,
      p_card_ids: [cardA],
      p_cash: 0,
    });
    await rpcOk(sbB, "set_trade_offer", {
      p_trade_id: tradeId,
      p_card_ids: [],
      p_cash: 100,
    });
    await rpcOk(sbA, "set_trade_ready", { p_trade_id: tradeId, p_ready: true });
    await rpcOk(sbB, "set_trade_ready", { p_trade_id: tradeId, p_ready: false });
    push("trade:set_trade_offer + set_trade_ready", true);

    const trade = await rpcOk(sbA, "get_trade", { p_trade_id: tradeId });
    push("trade:get_trade", trade != null);

    await rpcOk(sbA, "cancel_trade", { p_trade_id: tradeId });
    push("trade:cancel_trade", true);

    const tradeInbox = await rpcOk(sbA, "get_trade_inbox");
    push("trade:get_trade_inbox", tradeInbox != null);

    // Exchanges require both players to own the same card
    await rpcOk(sbB, "award_cards", { p_card_ids: [cardA] });
    const exCard = cardA;
    const aCards = (await rpcOk(sbA, "get_player_cards", {
      p_user_id: userIdA,
    })) as string[];
    const bCards = (await rpcOk(sbB, "get_player_cards", {
      p_user_id: userIdB,
    })) as string[];
    push(
      "exchange:both own card",
      aCards.includes(exCard) && bCards.includes(exCard),
      `A:${aCards.includes(exCard)} B:${bCards.includes(exCard)}`,
    );

    const exId = (await rpcOk(sbB, "request_exchange", {
      p_username: USER_A,
      p_card_id: exCard,
    })) as string;
    push("exchange:request_exchange", typeof exId === "string");

    await rpcOk(sbA, "respond_exchange", {
      p_exchange_id: exId,
      p_accept: true,
      p_price: 50,
    });
    push("exchange:respond_exchange", true);

    await rpcOk(sbB, "cancel_exchange", { p_exchange_id: exId });
    push("exchange:cancel_exchange", true);

    const exInbox = await rpcOk(sbA, "get_exchange_inbox");
    push("exchange:get_exchange_inbox", exInbox != null);

    // Shop direct
    const shop = await rpcOk(sbA, "get_shop_direct_listings");
    push("shop:get_shop_direct_listings", Array.isArray(shop) && shop.length > 0);

    const signIn = await anon.rpc("username_signin", {
      p_username: USER_A,
      p_password: PASS,
    });
    push(
      "auth:signin A",
      !signIn.error && !!(signIn.data as { access_token?: string })?.access_token,
      signIn.error?.message,
    );

    const copies = await rpcOk(sbA, "get_player_card_copies", {
      p_user_id: userIdA,
    });
    push("collection:get_player_card_copies", copies != null);

    const listForOffers = (await rpcOk(sbA, "list_card_for_sale", {
      p_card_id: cardB,
      p_price: 1000,
    })) as string;
    const offers = await rpcOk(sbA, "get_listing_offers", {
      p_listing_id: listForOffers,
    });
    push("market:get_listing_offers", Array.isArray(offers));
    await rpcOk(sbA, "cancel_listing", { p_listing_id: listForOffers });

    const noticeRows = await rpcOk(sbA, "get_market_sale_notices");
    if (Array.isArray(noticeRows) && noticeRows.length > 0) {
      const ids = noticeRows
        .map((n) => (n as { id?: string }).id)
        .filter(Boolean) as string[];
      if (ids.length) {
        await rpcOk(sbA, "ack_market_sale_notices", { p_ids: ids.slice(0, 5) });
      }
    }
    push("market:ack_market_sale_notices", true);

    await rpcOk(sbA, "award_coins", { p_amount: 10_000 });
    await rpcOk(sbA, "award_coins", { p_amount: 10_000 });
    const heroBuy = (await rpcOk(sbA, "buy_hero", { p_hero_id: "quincy" })) as {
      equipped_hero_id?: string | null;
    };
    push("heroes:buy_hero", heroBuy != null);
    await rpcOk(sbA, "equip_hero", { p_hero_id: "quincy" });
    push("heroes:equip_hero", true);
    const clear = await rpcOk(sbA, "record_hero_clear");
    push("heroes:record_hero_clear", clear != null);

    const slots = (await rpcOk(sbA, "buy_showcase_slot")) as number;
    push("profile:buy_showcase_slot", Number.isFinite(slots));
    await rpcOk(sbA, "set_profile_showcase", { p_card_ids: [cardA] });
    push("profile:set_profile_showcase", true);

    await rpcOk(sbA, "award_coins", { p_amount: 10_000 });
    await rpcOk(sbA, "award_coins", { p_amount: 10_000 });
    await rpcOk(sbA, "award_coins", { p_amount: 10_000 });
    await rpcOk(sbA, "set_profile_accent", { p_color: "#FF5500" });
    push("profile:set_profile_accent", true);

    const shopRow = (shop as { slot: number; version: number; price: number }[])[0];
    if (shopRow) {
      await rpcOk(sbA, "award_coins", { p_amount: 10_000 });
      const direct = await rpcOk(sbA, "buy_shop_direct_card", {
        p_slot: shopRow.slot,
        p_version: shopRow.version,
      });
      push("shop:buy_shop_direct_card", direct != null);
    } else {
      push("shop:buy_shop_direct_card", false, "no listings");
    }

    await rpcOk(sbA, "award_cards", { p_card_ids: ["dart-monkey-paragon"] });
    const fed = await rpcOk(sbA, "feed_paragons_from_cards", {
      p_card_ids: ["dart-monkey-paragon"],
    });
    push("paragons:feed_paragons_from_cards", Array.isArray(fed));

    // Profile cosmetics (may fail if card not owned — use cardA)
    await rpcOk(sbA, "set_profile_avatar", {
      p_card_id: cardA,
      p_zoom: 1.25,
      p_x: 0.5,
      p_y: 0.38,
    });
    push("profile:set_profile_avatar", true);

    // Paragons read
    const paragons = await rpcOk(sbA, "get_player_paragons", {
      p_user_id: userIdA,
    });
    push("paragons:get_player_paragons", Array.isArray(paragons));

    // Bloon Hero
    await rpcOk(sbA, "set_bloonhero_favorite", {
      p_md5: "smoke-test-md5",
      p_hit: {},
      p_on: true,
    });
    const favs = await rpcOk(sbA, "get_bloonhero_favorites");
    push("bloonhero:favorites", favs != null);

    await rpcOk(sbA, "record_bloonhero_play", {
      p_md5: "smoke-test-md5",
      p_chart_id: 1,
      p_song_name: "Smoke Test Song",
      p_artist: "Smoke",
    });
    const recent = await rpcOk(sbA, "get_bloonhero_recent_plays", {
      p_limit: 5,
    });
    push("bloonhero:recent plays", Array.isArray(recent));

    // Game scores
    const score = await rpcOk(sbA, "submit_game_score", {
      p_game_id: "bananacatch",
      p_score: 42,
    });
    push("arcade:submit_game_score", score != null);

    // Daily claims — ok if already claimed today
    const dailyCash = await sbA.rpc("claim_daily_cash");
    push(
      "daily:claim_daily_cash",
      !dailyCash.error || /already|claimed/i.test(dailyCash.error.message),
      dailyCash.error?.message ?? `coins=${(dailyCash.data as { coins?: number })?.coins}`,
    );

    const dailyCard = await sbA.rpc("claim_daily_card");
    push(
      "daily:claim_daily_card",
      !dailyCard.error || /already|claimed/i.test(dailyCard.error.message),
      dailyCard.error?.message ?? "ok",
    );

    const bloonle = await rpcOk(sbA, "claim_bloonle_daily", { p_guess_count: 3 });
    push("daily:claim_bloonle_daily", bloonle != null);
  } catch (e) {
    push("smoke:uncaught", false, e instanceof Error ? e.message : String(e));
  } finally {
    // Cleanup test accounts
    try {
      const del = await pgClient.query(
        "select public.delete_accounts_by_username($1::text[]) as result",
        [[USER_A, USER_B]],
      );
      push(
        "cleanup:delete test accounts",
        true,
        JSON.stringify(del.rows[0]?.result),
      );
    } catch (e) {
      push(
        "cleanup:delete test accounts",
        false,
        e instanceof Error ? e.message : String(e),
      );
    }
  }

  return results;
}

async function main(): Promise<void> {
  const env = loadEnv();
  const url = env.VITE_SUPABASE_URL;
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const dbUrl = env.SUPABASE_DB_URL;
  if (!url || !key || !dbUrl) {
    throw new Error("Need VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, SUPABASE_DB_URL");
  }

  const clientRpcs = collectClientRpcs();
  console.log(`\n=== PRE-RELEASE SMOKE TEST ===`);
  console.log(`Client RPCs in src/: ${clientRpcs.length}\n`);

  const pgClient = new pg.Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  });
  await pgClient.connect();
  await ensureDeleteHelper(pgClient);

  // Remove any leftover smoke accounts from a prior failed run
  await pgClient.query(
    `select public.delete_accounts_by_username(
      array(select username from public.accounts where username like 'smoke%')
    )`,
  );

  console.log("--- RPC audit (live DB) ---");
  const audit = await auditRpcs(pgClient, clientRpcs);
  for (const r of audit) {
    const mark = r.ok ? "PASS" : "FAIL";
    console.log(`  [${mark}] ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
  }

  console.log("\n--- Live flow smoke test ---");
  const flows = await smokeFlows(url, key, pgClient);
  await pgClient.end();

  const all = [...audit, ...flows];
  const failed = all.filter((r) => !r.ok);

  console.log("\n=== SUMMARY ===");
  console.log(`Total checks: ${all.length}`);
  console.log(`Passed: ${all.length - failed.length}`);
  console.log(`Failed: ${failed.length}`);

  if (failed.length) {
    console.log("\nFailures:");
    for (const f of failed) {
      console.log(`  - ${f.name}: ${f.detail ?? "failed"}`);
    }
    process.exit(1);
  }

  console.log("\nAll checks passed.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
