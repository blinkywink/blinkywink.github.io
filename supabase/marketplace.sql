-- Player-to-player card marketplace
-- Safe to re-run

create table if not exists public.marketplace_listings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null,
  card_id text not null,
  price integer not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  constraint marketplace_listings_price_ok check (price between 10 and 100000000),
  constraint marketplace_listings_card_id_len check (
    char_length(card_id) between 3 and 80
  ),
  constraint marketplace_listings_status_ok check (
    status in ('active', 'sold', 'cancelled')
  )
);

create index if not exists marketplace_listings_active_created_idx
  on public.marketplace_listings (created_at desc)
  where status = 'active';

create index if not exists marketplace_listings_seller_status_idx
  on public.marketplace_listings (seller_id, status);

create unique index if not exists marketplace_listings_active_seller_card_idx
  on public.marketplace_listings (seller_id, card_id)
  where status = 'active';

alter table public.marketplace_listings enable row level security;

drop policy if exists "Active listings are public" on public.marketplace_listings;
create policy "Active listings are public"
  on public.marketplace_listings
  for select
  using (status = 'active' or seller_id = public.current_account_id());

-- List one owned card for sale (escrows the card off ownership).
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
begin
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

  delete from public.owned_cards
  where user_id = uid and card_id = cleaned;
  if not found then
    raise exception 'You do not own this card';
  end if;

  begin
    insert into public.marketplace_listings (seller_id, card_id, price, status)
    values (uid, cleaned, p_price, 'active')
    returning id into listing_id;
  exception
    when unique_violation then
      insert into public.owned_cards (user_id, card_id)
      values (uid, cleaned)
      on conflict (user_id, card_id) do nothing;
      raise exception 'Card is already listed';
  end;

  return listing_id;
end;
$$;

-- Cancel your listing and get the card back.
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

  return true;
end;
$$;

-- Buy an active listing. Buyer must not already own the card.
-- Returns the buyer's new Cash balance.
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

  -- Transfer only — does not inflate lifetime coins_earned.
  update public.profiles
  set coins = coins + listing.price
  where id = listing.seller_id;

  insert into public.owned_cards (user_id, card_id)
  values (buyer, listing.card_id)
  on conflict (user_id, card_id) do nothing;

  update public.marketplace_listings
  set status = 'sold'
  where id = listing.id;

  return buyer_balance;
end;
$$;

revoke all on function public.list_card_for_sale(text, integer) from public;
revoke all on function public.cancel_listing(uuid) from public;
revoke all on function public.buy_listing(uuid) from public;
grant execute on function public.list_card_for_sale(text, integer) to anon, authenticated;
grant execute on function public.cancel_listing(uuid) to anon, authenticated;
grant execute on function public.buy_listing(uuid) to anon, authenticated;
