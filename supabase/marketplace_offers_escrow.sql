-- Marketplace counter-offers — escrow Cash on offer, verify transfer on accept.
-- Safe to re-run. Apply to production after the original marketplace_offers.sql.

alter table public.marketplace_offers
  add column if not exists funds_held boolean not null default false;

-- Refund Cash held on pending offers for a listing (sold / cancelled / other accept).
create or replace function public._refund_pending_listing_offers(
  p_listing_id uuid,
  p_except uuid default null
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  r record;
begin
  perform set_config('bloon.allow_coin_update', 'on', true);

  for r in
    select id, buyer_id, offer_price, funds_held
    from public.marketplace_offers
    where listing_id = p_listing_id
      and status = 'pending'
      and (p_except is null or id <> p_except)
    for update
  loop
    if r.funds_held then
      update public.profiles
      set coins = coins + r.offer_price
      where id = r.buyer_id;
    end if;

    update public.marketplace_offers
    set status = 'declined',
        funds_held = false,
        updated_at = now()
    where id = r.id;
  end loop;
end;
$$;

-- Back-compat name used by older snippets
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
  perform public._refund_pending_listing_offers(p_listing_id, p_except);
end;
$$;

-- Debit buyer and verify the balance actually moved (guards silent coin protect).
create or replace function public._debit_coins_verified(
  p_user_id uuid,
  p_amount integer
)
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  before_bal integer;
  after_bal integer;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Invalid debit amount';
  end if;

  perform set_config('bloon.allow_coin_update', 'on', true);

  select coins into before_bal
  from public.profiles
  where id = p_user_id
  for update;

  if before_bal is null then
    raise exception 'Buyer profile not found';
  end if;
  if before_bal < p_amount then
    raise exception 'Buyer no longer has enough Cash';
  end if;

  update public.profiles
  set coins = coins - p_amount
  where id = p_user_id
  returning coins into after_bal;

  if after_bal is distinct from (before_bal - p_amount) then
    raise exception 'Failed to debit Cash (transfer blocked)';
  end if;

  return after_bal;
end;
$$;

create or replace function public._credit_coins_verified(
  p_user_id uuid,
  p_amount integer
)
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  before_bal integer;
  after_bal integer;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Invalid credit amount';
  end if;

  perform set_config('bloon.allow_coin_update', 'on', true);

  select coins into before_bal
  from public.profiles
  where id = p_user_id
  for update;

  if before_bal is null then
    raise exception 'Seller profile not found';
  end if;

  update public.profiles
  set coins = coins + p_amount
  where id = p_user_id
  returning coins into after_bal;

  if after_bal is distinct from (before_bal + p_amount) then
    raise exception 'Failed to credit Cash (transfer blocked)';
  end if;

  return after_bal;
end;
$$;

-- Buyer makes a lower Cash offer — Cash is held immediately.
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
  old record;
begin
  if buyer is null then
    raise exception 'Not authenticated';
  end if;
  if p_listing_id is null then
    raise exception 'Missing listing';
  end if;
  if p_offer_price is null or p_offer_price < 10 or p_offer_price > 1000000 then
    raise exception 'Offer must be between 10 and 1,000,000';
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

  -- Replace any existing pending offer from this buyer (refund held Cash first).
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

  -- Hold Cash now so accept can't leave a half-applied sale.
  perform public._debit_coins_verified(buyer, p_offer_price);

  insert into public.marketplace_offers (
    listing_id, buyer_id, offer_price, status, funds_held
  )
  values (listing.id, buyer, p_offer_price, 'pending', true)
  returning id into offer_id;

  return offer_id;
end;
$$;

-- Seller accepts/declines, or buyer cancels. Accept returns buyer's Cash balance.
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
    -- Refund held Cash if listing died under the offer.
    if offer.funds_held then
      perform public._credit_coins_verified(offer.buyer_id, offer.offer_price);
    end if;
    update public.marketplace_offers
    set status = 'declined', funds_held = false, updated_at = now()
    where id = offer.id;
    raise exception 'Listing is not active';
  end if;

  -- Buyer can only cancel.
  if offer.buyer_id = uid then
    if p_accept then
      raise exception 'Buyers cannot accept their own offer';
    end if;
    if offer.funds_held then
      buyer_balance := public._credit_coins_verified(offer.buyer_id, offer.offer_price);
    else
      select coins into buyer_balance from public.profiles where id = offer.buyer_id;
    end if;
    update public.marketplace_offers
    set status = 'cancelled', funds_held = false, updated_at = now()
    where id = offer.id;
    return buyer_balance;
  end if;

  if listing.seller_id <> uid then
    raise exception 'Not your listing';
  end if;

  if not p_accept then
    if offer.funds_held then
      perform public._credit_coins_verified(offer.buyer_id, offer.offer_price);
    end if;
    update public.marketplace_offers
    set status = 'declined', funds_held = false, updated_at = now()
    where id = offer.id;
    return null;
  end if;

  -- Accept → sale at offer price
  if exists (
    select 1
    from public.owned_cards
    where user_id = offer.buyer_id and card_id = listing.card_id
  ) then
    if offer.funds_held then
      perform public._credit_coins_verified(offer.buyer_id, offer.offer_price);
    end if;
    update public.marketplace_offers
    set status = 'declined', funds_held = false, updated_at = now()
    where id = offer.id;
    raise exception 'Buyer already owns this card';
  end if;

  if offer.funds_held then
    -- Cash already held from make_listing_offer
    select coins into buyer_balance
    from public.profiles
    where id = offer.buyer_id;
  else
    -- Legacy pending offers (pre-escrow): debit now with verification
    buyer_balance := public._debit_coins_verified(offer.buyer_id, offer.offer_price);
  end if;

  perform public._credit_coins_verified(listing.seller_id, offer.offer_price);

  insert into public.owned_cards (user_id, card_id)
  values (offer.buyer_id, listing.card_id);

  if not exists (
    select 1
    from public.owned_cards
    where user_id = offer.buyer_id and card_id = listing.card_id
  ) then
    raise exception 'Failed to transfer card to buyer';
  end if;

  update public.marketplace_listings
  set status = 'sold'
  where id = listing.id;

  update public.marketplace_offers
  set status = 'accepted', funds_held = false, updated_at = now()
  where id = offer.id;

  perform public._refund_pending_listing_offers(listing.id, offer.id);

  return buyer_balance;
end;
$$;

-- Cancel listing: return card to seller + refund pending offer Cash.
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

  perform public._refund_pending_listing_offers(listing.id, null);

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

  insert into public.owned_cards (user_id, card_id)
  values (buyer, listing.card_id);

  if not exists (
    select 1
    from public.owned_cards
    where user_id = buyer and card_id = listing.card_id
  ) then
    raise exception 'Failed to transfer card to buyer';
  end if;

  update public.marketplace_listings
  set status = 'sold'
  where id = listing.id;

  perform public._refund_pending_listing_offers(listing.id, null);

  return buyer_balance;
end;
$$;

revoke all on function public._refund_pending_listing_offers(uuid, uuid) from public;
revoke all on function public._decline_pending_listing_offers(uuid, uuid) from public;
revoke all on function public._debit_coins_verified(uuid, integer) from public;
revoke all on function public._credit_coins_verified(uuid, integer) from public;
revoke all on function public.make_listing_offer(uuid, integer) from public;
revoke all on function public.respond_listing_offer(uuid, boolean) from public;
revoke all on function public.cancel_listing(uuid) from public;
revoke all on function public.buy_listing(uuid) from public;

grant execute on function public.make_listing_offer(uuid, integer) to anon, authenticated;
grant execute on function public.respond_listing_offer(uuid, boolean) to anon, authenticated;
grant execute on function public.cancel_listing(uuid) to anon, authenticated;
grant execute on function public.buy_listing(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- One-time repair for half-applied accepts (sold listing, buyer never paid /
-- never received card). Give the accepted buyer the card; do NOT double-pay
-- the seller. Safe if already correct (insert on conflict / skip).
-- ---------------------------------------------------------------------------
-- insert into public.owned_cards (user_id, card_id)
-- select o.buyer_id, l.card_id
-- from public.marketplace_offers o
-- join public.marketplace_listings l on l.id = o.listing_id
-- where o.status = 'accepted'
--   and l.status = 'sold'
--   and not exists (
--     select 1 from public.owned_cards oc
--     where oc.user_id = o.buyer_id and oc.card_id = l.card_id
--   )
-- on conflict do nothing;
