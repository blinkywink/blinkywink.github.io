-- Seller sale notifications. Apply after marketplace_offers_escrow.sql.
-- Records each sold listing so the seller sees what sold and for how much
-- the next time they open the site (or immediately if they are online).

create table if not exists public.marketplace_sale_notices (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.marketplace_listings (id) on delete cascade,
  seller_id uuid not null,
  buyer_id uuid,
  card_id text not null,
  price integer not null,
  created_at timestamptz not null default now(),
  seen_at timestamptz
);

create index if not exists marketplace_sale_notices_seller_unseen_idx
  on public.marketplace_sale_notices (seller_id, created_at desc)
  where seen_at is null;

alter table public.marketplace_sale_notices enable row level security;

create or replace function public._record_listing_sale(
  p_listing_id uuid,
  p_seller_id uuid,
  p_buyer_id uuid,
  p_card_id text,
  p_price integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.marketplace_sale_notices (
    listing_id, seller_id, buyer_id, card_id, price
  )
  values (p_listing_id, p_seller_id, p_buyer_id, p_card_id, p_price);
end;
$$;

create or replace function public.get_market_sale_notices()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_account_id();
  sales jsonb;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', n.id,
        'listingId', n.listing_id,
        'cardId', n.card_id,
        'price', n.price,
        'buyerId', n.buyer_id,
        'buyerUsername', coalesce(p.username, 'Player'),
        'createdAt', n.created_at
      )
      order by n.created_at desc
    ),
    '[]'::jsonb
  )
  into sales
  from public.marketplace_sale_notices n
  left join public.profiles p on p.id = n.buyer_id
  where n.seller_id = uid
    and n.seen_at is null;

  return jsonb_build_object('sales', sales);
end;
$$;

create or replace function public.ack_market_sale_notices(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_account_id();
  n integer;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  update public.marketplace_sale_notices
  set seen_at = now()
  where seller_id = uid
    and seen_at is null
    and (p_ids is null or id = any (p_ids));

  get diagnostics n = row_count;
  return n;
end;
$$;

-- Same as marketplace_offers_escrow.buy_listing, plus a sale notice.
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

-- Same as marketplace_offers_escrow.respond_listing_offer, plus a sale notice on accept.
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
    if offer.funds_held then
      perform public._credit_coins_verified(offer.buyer_id, offer.offer_price);
    end if;
    update public.marketplace_offers
    set status = 'declined', funds_held = false, updated_at = now()
    where id = offer.id;
    raise exception 'Listing is not active';
  end if;

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
    select coins into buyer_balance
    from public.profiles
    where id = offer.buyer_id;
  else
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
  perform public._record_listing_sale(
    listing.id,
    listing.seller_id,
    offer.buyer_id,
    listing.card_id,
    offer.offer_price
  );

  return buyer_balance;
end;
$$;

revoke all on function public._record_listing_sale(uuid, uuid, uuid, text, integer) from public;
revoke all on function public.get_market_sale_notices() from public;
revoke all on function public.ack_market_sale_notices(uuid[]) from public;
revoke all on function public.buy_listing(uuid) from public;
revoke all on function public.respond_listing_offer(uuid, boolean) from public;

grant execute on function public.get_market_sale_notices() to anon, authenticated;
grant execute on function public.ack_market_sale_notices(uuid[]) to anon, authenticated;
grant execute on function public.buy_listing(uuid) to anon, authenticated;
grant execute on function public.respond_listing_offer(uuid, boolean) to anon, authenticated;
