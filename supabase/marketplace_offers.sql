-- Marketplace counter-offers on listings
-- Safe to re-run

create table if not exists public.marketplace_offers (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.marketplace_listings (id) on delete cascade,
  buyer_id uuid not null,
  offer_price integer not null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketplace_offers_price_ok check (offer_price between 10 and 100000000),
  constraint marketplace_offers_status_ok check (
    status in ('pending', 'accepted', 'declined', 'cancelled')
  )
);

create index if not exists marketplace_offers_listing_status_idx
  on public.marketplace_offers (listing_id, status);

create index if not exists marketplace_offers_buyer_status_idx
  on public.marketplace_offers (buyer_id, status);

create unique index if not exists marketplace_offers_pending_buyer_listing_idx
  on public.marketplace_offers (listing_id, buyer_id)
  where status = 'pending';

alter table public.marketplace_offers enable row level security;

drop policy if exists "Offer parties can read" on public.marketplace_offers;
create policy "Offer parties can read"
  on public.marketplace_offers
  for select
  using (
    buyer_id = public.current_account_id()
    or exists (
      select 1
      from public.marketplace_listings l
      where l.id = listing_id
        and l.seller_id = public.current_account_id()
    )
  );

revoke all on table public.marketplace_offers from anon, authenticated;
grant select on table public.marketplace_offers to anon, authenticated;

-- Decline remaining pending offers for a listing (sold / cancelled / accepted).
create or replace function public._decline_pending_listing_offers(
  p_listing_id uuid,
  p_except uuid default null
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  update public.marketplace_offers
  set status = 'declined', updated_at = now()
  where listing_id = p_listing_id
    and status = 'pending'
    and (p_except is null or id <> p_except);
end;
$$;

-- Buyer makes a lower cash offer on an active listing.
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
  listing public.marketplace_listings%rowtype;
  offer_id uuid;
begin
  if buyer is null then
    raise exception 'Not authenticated';
  end if;
  if p_listing_id is null then
    raise exception 'Missing listing';
  end if;

  perform public._assert_shop_spend_unlocked(buyer);
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

  if exists (
    select 1
    from public.profiles
    where id = buyer and coins < p_offer_price
  ) then
    raise exception 'Not enough Cash for that offer';
  end if;

  update public.marketplace_offers
  set status = 'cancelled', updated_at = now()
  where listing_id = listing.id
    and buyer_id = buyer
    and status = 'pending';

  insert into public.marketplace_offers (listing_id, buyer_id, offer_price, status)
  values (listing.id, buyer, p_offer_price, 'pending')
  returning id into offer_id;

  return offer_id;
end;
$$;

-- Seller accepts/declines, or buyer cancels their pending offer.
-- Accept returns the buyer's new Cash balance; otherwise null.
create or replace function public.respond_listing_offer(
  p_offer_id uuid,
  p_accept boolean
)
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  uid uuid := public.current_account_id();
  offer public.marketplace_offers%rowtype;
  listing public.marketplace_listings%rowtype;
  buyer_balance integer;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;
  if p_offer_id is null then
    raise exception 'Missing offer';
  end if;

  select * into offer
  from public.marketplace_offers
  where id = p_offer_id
  for update;

  if not found then
    raise exception 'Offer not found';
  end if;
  if offer.status <> 'pending' then
    raise exception 'Offer is no longer pending';
  end if;

  select * into listing
  from public.marketplace_listings
  where id = offer.listing_id
  for update;

  if not found or listing.status <> 'active' then
    update public.marketplace_offers
    set status = 'declined', updated_at = now()
    where id = offer.id;
    raise exception 'Listing is not active';
  end if;

  -- Buyer can only cancel (decline path as self).
  if offer.buyer_id = uid then
    if p_accept then
      raise exception 'Buyers cannot accept their own offer';
    end if;
    update public.marketplace_offers
    set status = 'cancelled', updated_at = now()
    where id = offer.id;
    return null;
  end if;

  if listing.seller_id <> uid then
    raise exception 'Not your listing';
  end if;

  if not p_accept then
    update public.marketplace_offers
    set status = 'declined', updated_at = now()
    where id = offer.id;
    return null;
  end if;

  -- Accept → sale at offer price
  if exists (
    select 1
    from public.owned_cards
    where user_id = offer.buyer_id and card_id = listing.card_id
  ) then
    update public.marketplace_offers
    set status = 'declined', updated_at = now()
    where id = offer.id;
    raise exception 'Buyer already owns this card';
  end if;

  perform set_config('bloon.allow_coin_update', 'on', true);

  update public.profiles
  set coins = coins - offer.offer_price
  where id = offer.buyer_id and coins >= offer.offer_price
  returning coins into buyer_balance;

  if buyer_balance is null then
    raise exception 'Buyer no longer has enough Cash';
  end if;

  update public.profiles
  set coins = coins + offer.offer_price
  where id = listing.seller_id;

  insert into public.owned_cards (user_id, card_id)
  values (offer.buyer_id, listing.card_id)
  on conflict (user_id, card_id) do nothing;

  update public.marketplace_listings
  set status = 'sold'
  where id = listing.id;

  update public.marketplace_offers
  set status = 'accepted', updated_at = now()
  where id = offer.id;

  perform public._decline_pending_listing_offers(listing.id, offer.id);

  return buyer_balance;
end;
$$;

-- Inbox for market offers (seller incoming + buyer outgoing).
create or replace function public.get_market_offer_inbox()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  uid uuid := public.current_account_id();
  incoming jsonb;
  outgoing jsonb;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x."createdAt" desc), '[]'::jsonb)
  into incoming
  from (
    select
      o.id::text as id,
      l.id::text as "listingId",
      l.card_id as "cardId",
      l.price as "listingPrice",
      o.offer_price as "offerPrice",
      o.buyer_id::text as "partnerId",
      coalesce(p.username, 'Player') as "partnerUsername",
      o.created_at as "createdAt"
    from public.marketplace_offers o
    join public.marketplace_listings l on l.id = o.listing_id
    left join public.profiles p on p.id = o.buyer_id
    where o.status = 'pending'
      and l.status = 'active'
      and l.seller_id = uid
  ) x;

  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x."createdAt" desc), '[]'::jsonb)
  into outgoing
  from (
    select
      o.id::text as id,
      l.id::text as "listingId",
      l.card_id as "cardId",
      l.price as "listingPrice",
      o.offer_price as "offerPrice",
      l.seller_id::text as "partnerId",
      coalesce(p.username, 'Player') as "partnerUsername",
      o.created_at as "createdAt"
    from public.marketplace_offers o
    join public.marketplace_listings l on l.id = o.listing_id
    left join public.profiles p on p.id = l.seller_id
    where o.status = 'pending'
      and l.status = 'active'
      and o.buyer_id = uid
  ) x;

  return jsonb_build_object(
    'incoming', incoming,
    'outgoing', outgoing
  );
end;
$$;

-- Pending offers on a listing (seller sees all; buyer sees own).
create or replace function public.get_listing_offers(p_listing_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  uid uuid := public.current_account_id();
  listing public.marketplace_listings%rowtype;
  result jsonb;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;
  if p_listing_id is null then
    raise exception 'Missing listing';
  end if;

  select * into listing
  from public.marketplace_listings
  where id = p_listing_id;

  if not found then
    raise exception 'Listing not found';
  end if;

  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x."createdAt" desc), '[]'::jsonb)
  into result
  from (
    select
      o.id::text as id,
      l.id::text as "listingId",
      l.card_id as "cardId",
      l.price as "listingPrice",
      o.offer_price as "offerPrice",
      o.buyer_id::text as "buyerId",
      coalesce(p.username, 'Player') as "buyerUsername",
      o.created_at as "createdAt",
      o.status as status
    from public.marketplace_offers o
    join public.marketplace_listings l on l.id = o.listing_id
    left join public.profiles p on p.id = o.buyer_id
    where o.listing_id = listing.id
      and o.status = 'pending'
      and (
        listing.seller_id = uid
        or o.buyer_id = uid
      )
  ) x;

  return result;
end;
$$;

-- Keep listing cancel/buy tidy by clearing pending offers.
create or replace function public.cancel_listing(p_listing_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  uid uuid := public.current_account_id();
  listing public.marketplace_listings%rowtype;
begin
  if uid is null then
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
  if listing.seller_id <> uid then
    raise exception 'Not your listing';
  end if;
  if listing.status <> 'active' then
    raise exception 'Listing is not active';
  end if;

  update public.marketplace_listings
  set status = 'cancelled'
  where id = listing.id;

  insert into public.owned_cards (user_id, card_id)
  values (uid, listing.card_id)
  on conflict (user_id, card_id) do nothing;

  perform public._decline_pending_listing_offers(listing.id, null);

  return true;
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
  listing public.marketplace_listings%rowtype;
  buyer_balance integer;
begin
  if buyer is null then
    raise exception 'Not authenticated';
  end if;
  if p_listing_id is null then
    raise exception 'Missing listing';
  end if;

  perform public._assert_shop_spend_unlocked(buyer);

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

  perform set_config('bloon.allow_coin_update', 'on', true);

  update public.profiles
  set coins = coins - listing.price
  where id = buyer and coins >= listing.price
  returning coins into buyer_balance;

  if buyer_balance is null then
    raise exception 'Not enough Cash';
  end if;

  update public.profiles
  set coins = coins + listing.price
  where id = listing.seller_id;

  insert into public.owned_cards (user_id, card_id)
  values (buyer, listing.card_id)
  on conflict (user_id, card_id) do nothing;

  update public.marketplace_listings
  set status = 'sold'
  where id = listing.id;

  perform public._decline_pending_listing_offers(listing.id, null);

  return buyer_balance;
end;
$$;

revoke all on function public._decline_pending_listing_offers(uuid, uuid) from public;
revoke all on function public.make_listing_offer(uuid, integer) from public;
revoke all on function public.respond_listing_offer(uuid, boolean) from public;
revoke all on function public.get_market_offer_inbox() from public;
revoke all on function public.get_listing_offers(uuid) from public;
revoke all on function public.cancel_listing(uuid) from public;
revoke all on function public.buy_listing(uuid) from public;

grant execute on function public.make_listing_offer(uuid, integer) to anon, authenticated;
grant execute on function public.respond_listing_offer(uuid, boolean) to anon, authenticated;
grant execute on function public.get_market_offer_inbox() to anon, authenticated;
grant execute on function public.get_listing_offers(uuid) to anon, authenticated;
grant execute on function public.cancel_listing(uuid) to anon, authenticated;
grant execute on function public.buy_listing(uuid) to anon, authenticated;
