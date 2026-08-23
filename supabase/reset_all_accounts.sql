-- Wipe gameplay progress for every account while keeping logins + Early Supporter badges.
-- End state per account: 5,000 Cash balance, 5,000 lifetime earned, empty collection,
-- default profile cosmetics, no marketplace/trades/exchanges/high scores.
--
-- DOES NOT RUN ON ITS OWN. Install this file, then call preview or execute explicitly.
--
-- Preview (safe):
--   select public.preview_reset_all_accounts();
--
-- Execute (destructive — only when you mean it):
--   select public.reset_all_accounts_to_fresh('RESET_ALL_ACCOUNTS');
--
-- Or use: npm run reset-accounts -- --dry-run
--         npm run reset-accounts -- --execute

create or replace function public.preview_reset_all_accounts()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
  account_count integer;
  badge_count integer;
  out json;
begin
  select count(*)::integer into account_count from public.accounts;
  select count(*)::integer into badge_count
  from public.profile_badges
  where badge_id = 'early_supporter';

  select json_build_object(
    'accounts', account_count,
    'early_supporter_badges_kept', badge_count,
    'marketplace_listings_deleted', (select count(*) from public.marketplace_listings),
    'marketplace_offers_deleted',
      (select count(*) from public.marketplace_offers o
       join public.marketplace_listings l on l.id = o.listing_id)
      + (select count(*) from public.marketplace_offers where buyer_id in (select id from public.accounts)),
    'marketplace_sale_notices_deleted', (select count(*) from public.marketplace_sale_notices),
    'trades_deleted', (select count(*) from public.trades),
    'trade_offers_deleted', (select count(*) from public.trade_offers),
    'card_exchanges_deleted', (select count(*) from public.card_exchanges),
    'owned_cards_deleted', (select count(*) from public.owned_cards),
    'paragon_rows_deleted', (select count(*) from public.paragon_progress),
    'game_high_scores_deleted', (select count(*) from public.game_high_scores),
    'bloonhero_favorites_deleted', (select count(*) from public.bloonhero_favorites),
    'bloonhero_recent_plays_deleted',
      (select count(*) from public.bloonhero_recent_plays),
    'other_badges_deleted',
      (select count(*) from public.profile_badges where badge_id <> 'early_supporter'),
    'app_sessions_invalidated', (select count(*) from public.app_sessions),
    'profiles_reset', account_count,
    'after_reset', json_build_object(
      'coins', 5000,
      'coins_earned', 5000,
      'monkey_money', 0,
      'shop_spent', 0
    ),
    'usernames', coalesce((
      select json_agg(a.username order by lower(a.username))
      from public.accounts a
    ), '[]'::json),
    'early_supporters', coalesce((
      select json_agg(p.username order by lower(p.username))
      from public.profile_badges b
      join public.profiles p on p.id = b.user_id
      where b.badge_id = 'early_supporter'
    ), '[]'::json)
  ) into out;

  return out;
end;
$$;

create or replace function public.reset_all_accounts_to_fresh(p_confirm text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
  deleted json;
  reset_count integer;
begin
  if p_confirm is distinct from 'RESET_ALL_ACCOUNTS' then
    raise exception
      'Refusing to run: pass p_confirm = RESET_ALL_ACCOUNTS (got %)',
      coalesce(p_confirm, '<null>');
  end if;

  -- Offers on any listing (active or not).
  delete from public.marketplace_offers o
  using public.marketplace_listings l
  where o.listing_id = l.id;

  delete from public.marketplace_offers
  where buyer_id in (select id from public.accounts);

  delete from public.marketplace_sale_notices;
  delete from public.marketplace_listings;
  delete from public.trade_offers;
  delete from public.trades;
  delete from public.card_exchanges;
  delete from public.owned_cards;
  delete from public.paragon_progress;
  delete from public.game_high_scores;
  delete from public.bloonhero_favorites;
  delete from public.bloonhero_recent_plays;

  -- Drop any future badge types; keep Early Supporter.
  delete from public.profile_badges
  where badge_id <> 'early_supporter';

  -- Force sign-in again after the wipe.
  delete from public.app_sessions;

  perform set_config('bloon.allow_coin_update', 'on', true);

  update public.profiles
  set
    coins = 5000,
    coins_earned = 5000,
    monkey_money = 0,
    shop_spent = 0,
    last_daily_claim = null,
    last_daily_card_claim = null,
    last_bloonle_day = null,
    last_blowfree_day = null,
    avatar_card_id = null,
    avatar_zoom = 1.35,
    avatar_x = 0.5,
    avatar_y = 0.42,
    showcase_card_ids = '{}'::text[],
    showcase_slots = 0,
    accent_unlocked = false,
    accent_color = null,
    aura_unlocked = false,
    aura_card_id = null,
    auto_pack_unlocked = false,
    owned_hero_ids = '{}'::text[],
    equipped_hero_id = null,
    hero_levels = '{}'::jsonb,
    hero_clear_progress = '{}'::jsonb,
    updated_at = now();

  get diagnostics reset_count = row_count;

  select json_build_object(
    'profiles_reset', reset_count,
    'early_supporter_badges_remaining', (
      select count(*) from public.profile_badges where badge_id = 'early_supporter'
    ),
    'owned_cards_remaining', (select count(*) from public.owned_cards),
    'accounts_remaining', (select count(*) from public.accounts)
  ) into deleted;

  return deleted;
end;
$$;

revoke all on function public.preview_reset_all_accounts() from public;
revoke all on function public.reset_all_accounts_to_fresh(text) from public;

-- Only postgres / service_role should call these (SQL editor, admin script).
grant execute on function public.preview_reset_all_accounts() to service_role;
grant execute on function public.reset_all_accounts_to_fresh(text) to service_role;
