-- Shop spend: one spend_coins RPC (bigint Cash), no 1-arg overload.
-- Safe to re-run. Apply on the N100; do not replay all of supabase/*.sql.

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
  excluded text[];
  pick record;
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

  select coalesce(array_agg(card_id), '{}') into excluded
  from public.shop_direct_slots
  where slot <> p_slot;

  excluded := array_append(excluded, listing.card_id);

  select * into pick
  from public._shop_pick_direct_card(excluded);

  update public.shop_direct_slots
  set
    card_id = pick.card_id,
    tier = pick.tier,
    price = pick.price,
    version = listing.version + 1,
    updated_at = now()
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

revoke all on function public.spend_coins(integer, boolean) from public;
revoke all on function public.buy_shop_direct_card(integer, bigint) from public;
revoke all on function public.buy_hero(text) from public;

grant execute on function public.spend_coins(integer, boolean) to anon, authenticated;
grant execute on function public.buy_shop_direct_card(integer, bigint) to anon, authenticated;
grant execute on function public.buy_hero(text) to anon, authenticated;

notify pgrst, 'reload schema';
notify pgrst, 'reload config';
