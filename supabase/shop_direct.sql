-- Shared shop shelf: 4 direct-sale T4/T5 cards. Global stock - buy empties the
-- slot for 2 hours, then restocks a random deal.
-- Safe to re-run. Then run shop_card_pool_seed.sql.

create table if not exists public.shop_card_pool (
  card_id text primary key,
  tier smallint not null,
  constraint shop_card_pool_tier_ok check (tier in (4, 5)),
  constraint shop_card_pool_card_id_len check (
    char_length(card_id) between 3 and 80
  )
);

create index if not exists shop_card_pool_tier_idx
  on public.shop_card_pool (tier);

alter table public.shop_card_pool enable row level security;

drop policy if exists "Anyone can read shop card pool" on public.shop_card_pool;
create policy "Anyone can read shop card pool"
  on public.shop_card_pool
  for select
  using (true);

create table if not exists public.shop_direct_slots (
  slot smallint primary key,
  card_id text not null,
  tier smallint not null,
  price integer not null,
  version bigint not null default 1,
  updated_at timestamptz not null default now(),
  available_at timestamptz not null default now(),
  constraint shop_direct_slots_slot_ok check (slot between 1 and 4),
  constraint shop_direct_slots_tier_ok check (tier in (4, 5)),
  constraint shop_direct_slots_price_ok check (price >= 0 and price <= 25000)
);

alter table public.shop_direct_slots enable row level security;

alter table public.shop_direct_slots
  add column if not exists visual_seed bigint;

drop policy if exists "Anyone can read shop direct slots" on public.shop_direct_slots;
create policy "Anyone can read shop direct slots"
  on public.shop_direct_slots
  for select
  using (true);

create or replace function public.shop_direct_price(p_tier smallint)
returns integer
language plpgsql
volatile
set search_path = public
as $$
declare
  r double precision := random();
  lo integer;
  hi integer;
begin
  if p_tier = 4 then
    if r < 0.10 then
      lo := 1984;
      hi := 2479;
    elsif r < 0.38 then
      lo := 2483;
      hi := 3491;
    else
      lo := 3517;
      hi := 5186;
    end if;
  elsif p_tier = 5 then
    if r < 0.04 then
      lo := 3821;
      hi := 4894;
    elsif r < 0.16 then
      lo := 5126;
      hi := 8873;
    elsif r < 0.42 then
      lo := 9014;
      hi := 12887;
    else
      lo := 13108;
      hi := 16742;
    end if;
  else
    return null;
  end if;
  return lo + floor(random() * (hi - lo + 1))::integer;
end;
$$;

-- Pick a random pool card: 60% T4 / 40% T5. Prefer not currently shelved.
create or replace function public._shop_pick_direct_card(p_exclude text[] default '{}')
returns table (card_id text, tier smallint, price integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  want_tier smallint;
  picked_id text;
  picked_tier smallint;
begin
  want_tier := case when random() < 0.60 then 4 else 5 end;

  select p.card_id, p.tier
    into picked_id, picked_tier
  from public.shop_card_pool p
  where p.tier = want_tier
    and not (p.card_id = any (coalesce(p_exclude, '{}')))
  order by random()
  limit 1;

  if picked_id is null then
    -- Fallback: other tier, still avoid excludes.
    select p.card_id, p.tier
      into picked_id, picked_tier
    from public.shop_card_pool p
    where not (p.card_id = any (coalesce(p_exclude, '{}')))
    order by random()
    limit 1;
  end if;

  if picked_id is null then
    -- Last resort: any card of the wanted tier.
    select p.card_id, p.tier
      into picked_id, picked_tier
    from public.shop_card_pool p
    where p.tier = want_tier
    order by random()
    limit 1;
  end if;

  if picked_id is null then
    raise exception 'Shop card pool is empty - run shop_card_pool_seed.sql';
  end if;

  card_id := picked_id;
  tier := picked_tier;
  price := public.shop_direct_price(picked_tier);
  return next;
end;
$$;

create or replace function public._shop_ensure_direct_slots()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s smallint;
  excluded text[];
  pick record;
  listing public.shop_direct_slots%rowtype;
begin
  for s in 1..4 loop
    select * into listing
    from public.shop_direct_slots
    where slot = s
    for update;

    if not found then
      select coalesce(array_agg(card_id) filter (where card_id <> ''), '{}')
        into excluded
      from public.shop_direct_slots;

      select * into pick
      from public._shop_pick_direct_card(excluded);

      insert into public.shop_direct_slots (
        slot, card_id, tier, price, available_at, visual_seed
      )
      values (
        s,
        pick.card_id,
        pick.tier,
        pick.price,
        now(),
        public._new_visual_seed()
      );
      continue;
    end if;

    -- Sold slots restock 2h after purchase. Unsold deals rotate after 24h.
    if (
         ((listing.price = 0 or listing.card_id = '')
          and listing.available_at <= now())
         or (listing.price > 0
             and listing.card_id <> ''
             and listing.available_at <= now() - interval '24 hours')
       ) then
      select coalesce(array_agg(card_id) filter (where card_id <> ''), '{}')
        into excluded
      from public.shop_direct_slots
      where slot <> s;

      select * into pick
      from public._shop_pick_direct_card(excluded);

      update public.shop_direct_slots
      set
        card_id = pick.card_id,
        tier = pick.tier,
        price = pick.price,
        visual_seed = public._new_visual_seed(),
        version = listing.version + 1,
        updated_at = now(),
        available_at = now()
      where slot = s;
    end if;
  end loop;
end;
$$;

create or replace function public.get_shop_direct_listings()
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._shop_ensure_direct_slots();

  return coalesce(
    (
      select json_agg(
        json_build_object(
          'slot', s.slot,
          'cardId', s.card_id,
          'tier', s.tier,
          'price', s.price,
          'version', s.version,
          'visualSeed', s.visual_seed,
          'updatedAt', s.updated_at,
          'availableAt', s.available_at
        )
        order by s.slot
      )
      from public.shop_direct_slots s
    ),
    '[]'::json
  );
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
  new_balance integer;
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
  set coins = coins - listing.price
  where id = uid
    and coins >= listing.price
  returning coins into new_balance;

  if new_balance is null then
    raise exception 'Insufficient Cash';
  end if;

  insert into public.owned_cards (user_id, card_id, visual_seed)
  values (
    uid,
    listing.card_id,
    coalesce(listing.visual_seed, public._new_visual_seed())
  );

  update public.shop_direct_slots
  set
    price = 0,
    version = listing.version + 1,
    updated_at = now(),
    available_at = now() + interval '2 hours'
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

revoke all on function public.shop_direct_price(smallint) from public;
revoke all on function public._shop_pick_direct_card(text[]) from public;
revoke all on function public._shop_ensure_direct_slots() from public;

revoke all on function public.get_shop_direct_listings() from public;
grant execute on function public.get_shop_direct_listings() to anon, authenticated;

revoke all on function public.buy_shop_direct_card(integer, bigint) from public;
grant execute on function public.buy_shop_direct_card(integer, bigint) to anon, authenticated;
