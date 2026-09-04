-- Limited shop deals get one art seed for every client, and the buyer
-- receives that same seed. Safe to re-run.

alter table public.shop_direct_slots
  add column if not exists visual_seed bigint;

alter table public.shop_direct_slots
  alter column visual_seed set default public._new_visual_seed();

update public.shop_direct_slots
set visual_seed = public._new_visual_seed()
where visual_seed is null;

alter table public.shop_direct_slots
  alter column visual_seed set not null;

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

    -- Sold slots restock 4h after purchase. Unsold deals rotate after 24h.
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
