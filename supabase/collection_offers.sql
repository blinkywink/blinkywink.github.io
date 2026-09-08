-- Offers on cards sitting in someone's collection (not a listing).
-- Cash is held until accept / decline / ignore. Safe to re-run.

create table if not exists public.collection_offers (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null,
  buyer_id uuid not null,
  card_id text not null,
  offer_price integer not null,
  status text not null default 'pending',
  funds_held boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint collection_offers_price_ok check (offer_price between 10 and 100000000),
  constraint collection_offers_status_ok check (
    status in ('pending', 'accepted', 'declined', 'cancelled')
  ),
  constraint collection_offers_not_self check (seller_id <> buyer_id)
);

create index if not exists collection_offers_seller_status_idx
  on public.collection_offers (seller_id, status, created_at desc);

create index if not exists collection_offers_buyer_status_idx
  on public.collection_offers (buyer_id, status, created_at desc);

create unique index if not exists collection_offers_pending_pair_idx
  on public.collection_offers (seller_id, buyer_id, card_id)
  where status = 'pending';

alter table public.collection_offers enable row level security;

drop policy if exists "Collection offer parties can read" on public.collection_offers;
create policy "Collection offer parties can read"
  on public.collection_offers
  for select
  using (
    buyer_id = public.current_account_id()
    or seller_id = public.current_account_id()
  );

revoke all on table public.collection_offers from anon, authenticated;
grant select on table public.collection_offers to anon, authenticated;

create or replace function public._refund_collection_offer(p_offer_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  offer public.collection_offers%rowtype;
begin
  select * into offer
  from public.collection_offers
  where id = p_offer_id
  for update;

  if not found or not offer.funds_held then
    return;
  end if;

  perform public._credit_coins_verified(offer.buyer_id, offer.offer_price);
  update public.collection_offers
  set funds_held = false, updated_at = now()
  where id = offer.id;
end;
$$;

create or replace function public.make_collection_offer(
  p_seller_id uuid,
  p_card_id text,
  p_offer_price integer
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  buyer uuid := public.current_account_id();
  card text := trim(coalesce(p_card_id, ''));
  old_id uuid;
  offer_id uuid;
begin
  if buyer is null then
    raise exception 'Not authenticated';
  end if;
  if p_seller_id is null or card = '' then
    raise exception 'Missing card';
  end if;
  if p_seller_id = buyer then
    raise exception 'You cannot offer on your own card';
  end if;

  perform public._assert_shop_spend_unlocked(buyer);
  if p_offer_price is null or p_offer_price < 10 or p_offer_price > 100000000 then
    raise exception 'Offer must be between 10 and 100,000,000';
  end if;

  if not exists (
    select 1 from public.owned_cards
    where user_id = p_seller_id and card_id = card
  ) then
    raise exception 'They no longer have that card';
  end if;

  if exists (
    select 1 from public.owned_cards
    where user_id = buyer and card_id = card
  ) then
    raise exception 'You already own this card';
  end if;

  if exists (
    select 1 from public.marketplace_listings
    where seller_id = p_seller_id
      and card_id = card
      and status = 'active'
  ) then
    raise exception 'That card is already listed — offer on the listing';
  end if;

  for old_id in
    select id
    from public.collection_offers
    where seller_id = p_seller_id
      and buyer_id = buyer
      and card_id = card
      and status = 'pending'
    for update
  loop
    perform public._refund_collection_offer(old_id);
    update public.collection_offers
    set status = 'cancelled', updated_at = now()
    where id = old_id;
  end loop;

  perform public._debit_coins_verified(buyer, p_offer_price);

  insert into public.collection_offers (
    seller_id, buyer_id, card_id, offer_price, status, funds_held
  )
  values (p_seller_id, buyer, card, p_offer_price, 'pending', true)
  returning id into offer_id;

  return offer_id;
end;
$$;

create or replace function public.respond_collection_offer(
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
  offer public.collection_offers%rowtype;
  seed bigint;
  buyer_balance integer;
  other_id uuid;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;
  if p_offer_id is null then
    raise exception 'Missing offer';
  end if;

  select * into offer
  from public.collection_offers
  where id = p_offer_id
  for update;

  if not found or offer.status <> 'pending' then
    raise exception 'Offer is no longer pending';
  end if;

  if offer.buyer_id = uid then
    if p_accept then
      raise exception 'Buyers cannot accept their own offer';
    end if;
    perform public._refund_collection_offer(offer.id);
    update public.collection_offers
    set status = 'cancelled', updated_at = now()
    where id = offer.id;
    select coins into buyer_balance from public.profiles where id = uid;
    return buyer_balance;
  end if;

  if offer.seller_id <> uid then
    raise exception 'Not your offer';
  end if;

  if not p_accept then
    perform public._refund_collection_offer(offer.id);
    update public.collection_offers
    set status = 'declined', updated_at = now()
    where id = offer.id;
    return null;
  end if;

  if exists (
    select 1 from public.owned_cards
    where user_id = offer.buyer_id and card_id = offer.card_id
  ) then
    perform public._refund_collection_offer(offer.id);
    update public.collection_offers
    set status = 'declined', updated_at = now()
    where id = offer.id;
    raise exception 'Buyer already owns this card';
  end if;

  if not exists (
    select 1 from public.owned_cards
    where user_id = offer.seller_id and card_id = offer.card_id
  ) then
    perform public._refund_collection_offer(offer.id);
    update public.collection_offers
    set status = 'declined', updated_at = now()
    where id = offer.id;
    raise exception 'You no longer have that card';
  end if;

  select oc.visual_seed into seed
  from public.owned_cards oc
  where oc.user_id = offer.seller_id and oc.card_id = offer.card_id;

  delete from public.owned_cards
  where user_id = offer.seller_id and card_id = offer.card_id;

  insert into public.owned_cards (user_id, card_id, visual_seed)
  values (offer.buyer_id, offer.card_id, seed);

  if exists (
    select 1 from public.paragon_progress
    where user_id = offer.seller_id and card_id = offer.card_id
  ) then
    insert into public.paragon_progress (user_id, card_id, degree, xp, updated_at)
    select offer.buyer_id, card_id, degree, xp, now()
    from public.paragon_progress
    where user_id = offer.seller_id and card_id = offer.card_id
    on conflict (user_id, card_id) do update
      set degree = excluded.degree,
          xp = excluded.xp,
          updated_at = now();
    delete from public.paragon_progress
    where user_id = offer.seller_id and card_id = offer.card_id;
  end if;

  perform public._credit_coins_verified(offer.seller_id, offer.offer_price);

  update public.collection_offers
  set status = 'accepted', funds_held = false, updated_at = now()
  where id = offer.id;

  -- Decline any other pending offers on the same card, refunding held cash.
  for other_id in
    select id
    from public.collection_offers
    where seller_id = offer.seller_id
      and card_id = offer.card_id
      and status = 'pending'
      and id <> offer.id
  loop
    perform public._refund_collection_offer(other_id);
    update public.collection_offers
    set status = 'declined', updated_at = now()
    where id = other_id;
  end loop;

  select coins into buyer_balance from public.profiles where id = offer.buyer_id;
  return buyer_balance;
end;
$$;

create or replace function public.ignore_collection_offers()
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  uid uuid := public.current_account_id();
  n integer := 0;
  offer_id uuid;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  for offer_id in
    select id
    from public.collection_offers
    where seller_id = uid and status = 'pending'
    for update
  loop
    perform public._refund_collection_offer(offer_id);
    update public.collection_offers
    set status = 'declined', updated_at = now()
    where id = offer_id;
    n := n + 1;
  end loop;

  return n;
end;
$$;

create or replace function public.get_collection_offers()
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
      o.card_id as "cardId",
      o.offer_price as "offerPrice",
      o.buyer_id::text as "partnerId",
      coalesce(p.username, 'Player') as "partnerUsername",
      o.created_at as "createdAt"
    from public.collection_offers o
    left join public.profiles p on p.id = o.buyer_id
    where o.status = 'pending'
      and o.seller_id = uid
  ) x;

  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x."createdAt" desc), '[]'::jsonb)
  into outgoing
  from (
    select
      o.id::text as id,
      o.card_id as "cardId",
      o.offer_price as "offerPrice",
      o.seller_id::text as "partnerId",
      coalesce(p.username, 'Player') as "partnerUsername",
      o.created_at as "createdAt"
    from public.collection_offers o
    left join public.profiles p on p.id = o.seller_id
    where o.status = 'pending'
      and o.buyer_id = uid
  ) x;

  return jsonb_build_object('incoming', incoming, 'outgoing', outgoing);
end;
$$;

revoke all on function public._refund_collection_offer(uuid) from public;
revoke all on function public.make_collection_offer(uuid, text, integer) from public;
revoke all on function public.respond_collection_offer(uuid, boolean) from public;
revoke all on function public.ignore_collection_offers() from public;
revoke all on function public.get_collection_offers() from public;

grant execute on function public.make_collection_offer(uuid, text, integer) to anon, authenticated;
grant execute on function public.respond_collection_offer(uuid, boolean) to anon, authenticated;
grant execute on function public.ignore_collection_offers() to anon, authenticated;
grant execute on function public.get_collection_offers() to anon, authenticated;
