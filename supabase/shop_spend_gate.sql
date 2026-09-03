-- Gate marketplace listing / buying until the account has spent 5k in the shop
-- (packs via spend_coins, direct shelf, hero unlocks/upgrades).
-- Safe to re-run. Grandfathers existing profiles so only new alts are locked.

alter table public.profiles
  add column if not exists shop_spent integer not null default 0
  check (shop_spent >= 0);

-- One-shot grandfather: existing accounts keep market access.
create table if not exists public._schema_patches (
  id text primary key,
  applied_at timestamptz not null default now()
);

alter table public._schema_patches enable row level security;
alter table public._schema_patches force row level security;
revoke all on table public._schema_patches from anon, authenticated, public;

with ins as (
  insert into public._schema_patches (id)
  values ('shop_spend_gate_v1')
  on conflict (id) do nothing
  returning id
)
update public.profiles p
set shop_spent = 5000
from ins
where p.shop_spent < 5000;

create or replace function public.protect_profile_coins()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_setting('bloon.allow_coin_update', true) = 'on' then
    new.updated_at := now();
    return new;
  end if;

  if new.coins is distinct from old.coins then
    new.coins := old.coins;
  end if;

  if new.monkey_money is distinct from old.monkey_money then
    new.monkey_money := old.monkey_money;
  end if;

  if new.coins_earned is distinct from old.coins_earned then
    new.coins_earned := old.coins_earned;
  end if;

  if new.shop_spent is distinct from old.shop_spent then
    new.shop_spent := old.shop_spent;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create or replace function public._assert_shop_spend_unlocked(p_uid uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  spent integer;
begin
  if p_uid is null then
    raise exception 'Not authenticated';
  end if;

  select shop_spent into spent
  from public.profiles
  where id = p_uid;

  if coalesce(spent, 0) < 5000 then
    raise exception
      'Spend 5,000 Cash in the shop before using the marketplace';
  end if;
end;
$$;

create or replace function public._bump_shop_spent(p_uid uuid, p_amount integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_uid is null or p_amount is null or p_amount < 1 then
    return;
  end if;

  perform set_config('bloon.allow_coin_update', 'on', true);

  update public.profiles
  set shop_spent = shop_spent + p_amount
  where id = p_uid;
end;
$$;

-- Pack shop (p_shop := true). Game continue costs use p_shop := false.
-- One function only: a leftover spend_coins(integer) overload makes PostgREST
-- return PGRST203 ("Could not choose the best candidate") on shop spends.
drop function if exists public.spend_coins(integer);
drop function if exists public.spend_coins(integer, boolean);

create or replace function public.spend_coins(
  p_amount integer,
  p_shop boolean default false
)
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  uid uuid := public.current_account_id();
  new_balance bigint;
begin
  if uid is null then
    uid := auth.uid();
  end if;
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  if p_amount is null or p_amount < 1 or p_amount > 100000 then
    raise exception 'Invalid coin amount';
  end if;

  perform set_config('bloon.allow_coin_update', 'on', true);

  if coalesce(p_shop, false) then
    update public.profiles
    set
      coins = coins - p_amount,
      shop_spent = shop_spent + p_amount
    where id = uid
      and coins >= p_amount
    returning coins into new_balance;
  else
    update public.profiles
    set coins = coins - p_amount
    where id = uid
      and coins >= p_amount
    returning coins into new_balance;
  end if;

  if new_balance is null then
    raise exception 'Insufficient coins';
  end if;

  return new_balance;
end;
$$;

-- Direct T4/T5 shelf: bump shop_spent alongside the debit.
create or replace function public.buy_shop_direct_card(
  p_slot integer,
  p_version bigint
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_account_id();
  listing public.shop_direct_slots%rowtype;
  new_balance bigint;
begin
  if uid is null then
    uid := auth.uid();
  end if;
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  if p_slot is null or p_slot < 1 or p_slot > 4 then
    raise exception 'Invalid slot';
  end if;

  perform public._shop_ensure_direct_slots();

  select * into listing
  from public.shop_direct_slots
  where slot = p_slot
  for update;

  if not found then
    raise exception 'Listing not found';
  end if;

  if listing.price <= 0
     or listing.available_at > now() then
    raise exception 'SOLD_OUT' using errcode = 'P0001';
  end if;

  if listing.version is distinct from p_version then
    raise exception 'SOLD_OUT' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.owned_cards
    where user_id = uid and card_id = listing.card_id
  ) then
    raise exception 'ALREADY_OWNED' using errcode = 'P0001';
  end if;

  perform set_config('bloon.allow_coin_update', 'on', true);

  update public.profiles
  set
    coins = coins - listing.price,
    shop_spent = shop_spent + listing.price
  where id = uid
    and coins >= listing.price
  returning coins into new_balance;

  if new_balance is null then
    raise exception 'Insufficient Cash';
  end if;

  insert into public.owned_cards (user_id, card_id)
  values (uid, listing.card_id);

  update public.shop_direct_slots
  set
    price = 0,
    version = listing.version + 1,
    updated_at = now(),
    available_at = now() + interval '4 hours'
  where slot = p_slot;

  return json_build_object(
    'ok', true,
    'boughtCardId', listing.card_id,
    'boughtTier', listing.tier,
    'price', listing.price,
    'coins', new_balance,
    'listings', public.get_shop_direct_listings()
  );
end;
$$;

-- Marketplace buy / offer: assert shop spend, then run the real body.
-- Full impls are embedded (rename-wrapping is fragile across Postgres arg forms).

create or replace function public._buy_listing_impl(p_listing_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  buyer uuid := public.current_account_id();
  listing public.marketplace_listings%rowtype;
  buyer_balance integer;
begin
  if buyer is null then
    raise exception 'Not authenticated';
  end if;
  if p_listing_id is null then
    raise exception 'Missing listing';
  end if;

  select * into listing
  from public.marketplace_listings
  where id = p_listing_id
  for update;

  if not found then
    raise exception 'Listing not found';
  end if;
  if listing.status <> 'active' then
    raise exception 'Listing is not active';
  end if;
  if listing.seller_id = buyer then
    raise exception 'You cannot buy your own listing';
  end if;

  if exists (
    select 1
    from public.owned_cards
    where user_id = buyer and card_id = listing.card_id
  ) then
    raise exception 'You already own this card';
  end if;

  buyer_balance := public._debit_coins_verified(buyer, listing.price);
  perform public._credit_coins_verified(listing.seller_id, listing.price);

  insert into public.owned_cards (user_id, card_id, visual_seed)
  values (
    buyer,
    listing.card_id,
    coalesce(listing.visual_seed, public._new_visual_seed())
  );

  if not exists (
    select 1
    from public.owned_cards
    where user_id = buyer and card_id = listing.card_id
  ) then
    raise exception 'Failed to transfer card to buyer';
  end if;

  if listing.card_id like '%-paragon' then
    perform public._give_listed_paragon(
      buyer,
      listing.card_id,
      listing.paragon_degree,
      listing.paragon_xp
    );
  end if;

  update public.marketplace_listings
  set status = 'sold'
  where id = listing.id;

  perform public._refund_pending_listing_offers(listing.id, null);
  perform public._record_listing_sale(
    listing.id,
    listing.seller_id,
    buyer,
    listing.card_id,
    listing.price
  );

  return buyer_balance;
end;
$$;

create or replace function public._make_listing_offer_impl(
  p_listing_id uuid,
  p_offer_price integer
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  buyer uuid := public.current_account_id();
  listing public.marketplace_listings%rowtype;
  offer_id uuid;
  old record;
begin
  if buyer is null then
    raise exception 'Not authenticated';
  end if;
  if p_listing_id is null then
    raise exception 'Missing listing';
  end if;
  if p_offer_price is null or p_offer_price < 10 or p_offer_price > 100000000 then
    raise exception 'Offer must be between 10 and 100,000,000';
  end if;

  select * into listing
  from public.marketplace_listings
  where id = p_listing_id
  for update;

  if not found then
    raise exception 'Listing not found';
  end if;
  if listing.status <> 'active' then
    raise exception 'Listing is not active';
  end if;
  if listing.seller_id = buyer then
    raise exception 'You cannot offer on your own listing';
  end if;
  if p_offer_price >= listing.price then
    raise exception 'Offer must be lower than the asking price';
  end if;

  if exists (
    select 1
    from public.owned_cards
    where user_id = buyer and card_id = listing.card_id
  ) then
    raise exception 'You already own this card';
  end if;

  for old in
    select id, offer_price, funds_held
    from public.marketplace_offers
    where listing_id = listing.id
      and buyer_id = buyer
      and status = 'pending'
    for update
  loop
    if old.funds_held then
      perform public._credit_coins_verified(buyer, old.offer_price);
    end if;
    update public.marketplace_offers
    set status = 'cancelled', funds_held = false, updated_at = now()
    where id = old.id;
  end loop;

  perform public._debit_coins_verified(buyer, p_offer_price);

  insert into public.marketplace_offers (
    listing_id, buyer_id, offer_price, status, funds_held
  )
  values (listing.id, buyer, p_offer_price, 'pending', true)
  returning id into offer_id;

  return offer_id;
end;
$$;

create or replace function public.buy_listing(p_listing_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  buyer uuid := public.current_account_id();
begin
  if buyer is null then
    buyer := auth.uid();
  end if;
  if buyer is null then
    raise exception 'Not authenticated';
  end if;

  perform public._assert_shop_spend_unlocked(buyer);
  return public._buy_listing_impl(p_listing_id);
end;
$$;

create or replace function public.make_listing_offer(
  p_listing_id uuid,
  p_offer_price integer
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  buyer uuid := public.current_account_id();
begin
  if buyer is null then
    buyer := auth.uid();
  end if;
  if buyer is null then
    raise exception 'Not authenticated';
  end if;

  perform public._assert_shop_spend_unlocked(buyer);
  return public._make_listing_offer_impl(p_listing_id, p_offer_price);
end;
$$;

create or replace function public.list_card_for_sale(
  p_card_id text,
  p_price integer
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  uid uuid := public.current_account_id();
  listing_id uuid;
  cleaned text;
  active_count integer;
  snap_degree integer;
  snap_xp integer;
  snap_seed bigint;
begin
  if uid is null then
    uid := auth.uid();
  end if;
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  perform public._assert_shop_spend_unlocked(uid);

  cleaned := trim(coalesce(p_card_id, ''));
  if char_length(cleaned) < 3 or char_length(cleaned) > 80 then
    raise exception 'Invalid card';
  end if;
  if p_price is null or p_price < 10 or p_price > 100000000 then
    raise exception 'Price must be between 10 and 100,000,000';
  end if;

  select count(*) into active_count
  from public.marketplace_listings
  where seller_id = uid and status = 'active';
  if active_count >= 40 then
    raise exception 'Too many active listings (max 40)';
  end if;

  if cleaned like '%-paragon' then
    select degree, xp into snap_degree, snap_xp
    from public.paragon_progress
    where user_id = uid and card_id = cleaned;
    snap_degree := coalesce(snap_degree, 1);
    snap_xp := coalesce(snap_xp, 0);
  end if;

  delete from public.owned_cards
  where user_id = uid and card_id = cleaned
  returning visual_seed into snap_seed;
  if not found then
    raise exception 'You do not own this card';
  end if;

  if cleaned like '%-paragon' then
    delete from public.paragon_progress
    where user_id = uid and card_id = cleaned;
  end if;

  begin
    insert into public.marketplace_listings (
      seller_id, card_id, price, status, paragon_degree, paragon_xp, visual_seed
    )
    values (
      uid,
      cleaned,
      p_price,
      'active',
      snap_degree,
      snap_xp,
      snap_seed
    )
    returning id into listing_id;
  exception
    when unique_violation then
      insert into public.owned_cards (user_id, card_id, visual_seed)
      values (uid, cleaned, coalesce(snap_seed, public._new_visual_seed()))
      on conflict (user_id, card_id) do nothing;
      if cleaned like '%-paragon' then
        perform public._give_listed_paragon(uid, cleaned, snap_degree, snap_xp);
      end if;
      raise exception 'Card is already listed';
  end;

  return listing_id;
end;
$$;

-- Hero shop unlock / level-up also counts toward the 5k.
create or replace function public.buy_hero(p_hero_id text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  uid uuid := public.current_account_id();
  hid text := lower(trim(coalesce(p_hero_id, '')));
  owned text[];
  levels jsonb;
  clears jsonb;
  new_balance bigint;
  cur_level integer;
  next_level integer;
  price integer;
  progress integer;
  needed integer;
  allowed text[] := array[
    'quincy','gwendolin','obyn-greenfoot',
    'benjamin','ezili','sauda','psi','silas'
  ];
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;
  if hid = '' or not (hid = any(allowed)) then
    raise exception 'Invalid hero';
  end if;

  select owned_hero_ids, hero_levels, hero_clear_progress, coins
    into owned, levels, clears, new_balance
  from public.profiles
  where id = uid
  for update;

  if not found then
    raise exception 'Profile not found';
  end if;

  if hid = any(coalesce(owned, '{}')) then
    cur_level := greatest(
      1,
      least(20, coalesce((levels ->> hid)::integer, 1))
    );
    if cur_level >= 20 then
      raise exception 'Hero max level';
    end if;
    next_level := cur_level + 1;
    needed := public.hero_clears_required(cur_level);
    progress := greatest(0, coalesce((clears ->> hid)::integer, 0));
    if progress < needed then
      raise exception 'Not enough clears';
    end if;
    price := public.hero_upgrade_cost(next_level, hid);

    if new_balance < price then
      raise exception 'Insufficient coins';
    end if;

    perform set_config('bloon.allow_coin_update', 'on', true);
    update public.profiles
    set
      coins = coins - price,
      shop_spent = shop_spent + price,
      hero_levels = coalesce(hero_levels, '{}'::jsonb) || jsonb_build_object(hid, next_level),
      hero_clear_progress = coalesce(hero_clear_progress, '{}'::jsonb) || jsonb_build_object(hid, 0),
      updated_at = now()
    where id = uid
    returning coins, owned_hero_ids, hero_levels, hero_clear_progress
      into new_balance, owned, levels, clears;
  else
    price := public.hero_upgrade_cost(1, hid);

    if new_balance < price then
      raise exception 'Insufficient coins';
    end if;

    perform set_config('bloon.allow_coin_update', 'on', true);
    update public.profiles
    set
      coins = coins - price,
      shop_spent = shop_spent + price,
      owned_hero_ids = array_append(coalesce(owned_hero_ids, '{}'), hid),
      hero_levels = coalesce(hero_levels, '{}'::jsonb) || jsonb_build_object(hid, 1),
      hero_clear_progress = coalesce(hero_clear_progress, '{}'::jsonb) || jsonb_build_object(hid, 0),
      equipped_hero_id = case
        when coalesce(cardinality(owned), 0) = 0 then hid
        else equipped_hero_id
      end,
      updated_at = now()
    where id = uid
    returning coins, owned_hero_ids, hero_levels, hero_clear_progress
      into new_balance, owned, levels, clears;
  end if;

  return json_build_object(
    'coins', new_balance,
    'owned_hero_ids', owned,
    'hero_levels', levels,
    'hero_clear_progress', clears,
    'equipped_hero_id', (
      select equipped_hero_id from public.profiles where id = uid
    )
  );
end;
$$;

revoke all on function public._assert_shop_spend_unlocked(uuid) from public;
revoke all on function public._bump_shop_spent(uuid, integer) from public;
revoke all on function public.buy_listing(uuid) from public;
revoke all on function public.make_listing_offer(uuid, integer) from public;
revoke all on function public.list_card_for_sale(text, integer) from public;
revoke all on function public.spend_coins(integer, boolean) from public;
revoke all on function public.buy_shop_direct_card(integer, bigint) from public;
revoke all on function public.buy_hero(text) from public;

grant execute on function public.buy_listing(uuid) to anon, authenticated;
grant execute on function public.make_listing_offer(uuid, integer) to anon, authenticated;
grant execute on function public.list_card_for_sale(text, integer) to anon, authenticated;
grant execute on function public.spend_coins(integer, boolean) to anon, authenticated;
grant execute on function public.buy_shop_direct_card(integer, bigint) to anon, authenticated;
grant execute on function public.buy_hero(text) to anon, authenticated;
