-- Paragon degree / XP. Safe to re-run.

create table if not exists public.paragon_progress (
  user_id uuid not null,
  card_id text not null,
  degree integer not null default 1,
  xp integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, card_id),
  constraint paragon_progress_card_id_ok check (
    card_id like '%-paragon'
    and char_length(card_id) between 10 and 80
  ),
  constraint paragon_progress_degree_ok check (degree between 1 and 100),
  constraint paragon_progress_xp_ok check (xp >= 0)
);

create index if not exists paragon_progress_user_id_idx
  on public.paragon_progress (user_id);

alter table public.paragon_progress enable row level security;

drop policy if exists "Paragon progress is publicly readable" on public.paragon_progress;
create policy "Paragon progress is publicly readable"
  on public.paragon_progress
  for select
  using (true);

alter table public.marketplace_listings
  add column if not exists paragon_degree integer;

alter table public.marketplace_listings
  add column if not exists paragon_xp integer;

alter table public.marketplace_listings
  drop constraint if exists marketplace_listings_paragon_degree_ok;
alter table public.marketplace_listings
  add constraint marketplace_listings_paragon_degree_ok
  check (paragon_degree is null or paragon_degree between 1 and 100);

alter table public.marketplace_listings
  drop constraint if exists marketplace_listings_paragon_xp_ok;
alter table public.marketplace_listings
  add constraint marketplace_listings_paragon_xp_ok
  check (paragon_xp is null or paragon_xp >= 0);

-- Seed degree 1 for paragons already owned.
insert into public.paragon_progress (user_id, card_id, degree, xp)
select oc.user_id, oc.card_id, 1, 0
from public.owned_cards oc
where oc.card_id like '%-paragon'
on conflict (user_id, card_id) do nothing;

create or replace function public.paragon_xp_to_next(p_degree integer)
returns integer
language sql
immutable
as $$
  select case
    when p_degree is null or p_degree >= 100 then 0
    else round(
      2400 * power(greatest(1, least(99, p_degree))::numeric, 1.18) + 800
    )::integer
  end;
$$;

create or replace function public._apply_paragon_gain(
  p_degree integer,
  p_xp integer,
  p_add_xp integer,
  p_add_degrees integer,
  out o_degree integer,
  out o_xp integer,
  out o_degrees_gained integer
)
language plpgsql
immutable
as $$
declare
  incoming integer := greatest(0, coalesce(p_add_xp, 0));
  extra integer := greatest(0, coalesce(p_add_degrees, 0));
  need integer;
  room integer;
  raised integer;
begin
  o_degree := greatest(1, least(100, coalesce(p_degree, 1)));
  o_xp := case when o_degree >= 100 then 0 else greatest(0, coalesce(p_xp, 0)) end;
  o_degrees_gained := 0;

  if extra > 0 and o_degree < 100 then
    raised := least(100, o_degree + extra);
    o_degrees_gained := raised - o_degree;
    o_degree := raised;
    if o_degree >= 100 then
      o_xp := 0;
    end if;
  end if;

  while incoming > 0 and o_degree < 100 loop
    need := public.paragon_xp_to_next(o_degree);
    room := greatest(0, need - o_xp);
    if incoming < room then
      o_xp := o_xp + incoming;
      incoming := 0;
      exit;
    end if;
    incoming := incoming - room;
    o_xp := 0;
    o_degree := o_degree + 1;
    o_degrees_gained := o_degrees_gained + 1;
  end loop;

  if o_degree >= 100 then
    o_degree := 100;
    o_xp := 0;
  end if;
end;
$$;

create or replace function public._move_paragon_progress(
  p_from uuid,
  p_to uuid,
  p_card_ids text[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  cid text;
  src public.paragon_progress%rowtype;
begin
  if p_from is null or p_to is null or p_card_ids is null then
    return;
  end if;

  foreach cid in array p_card_ids
  loop
    if cid is null or cid not like '%-paragon' then
      continue;
    end if;

    select * into src
    from public.paragon_progress
    where user_id = p_from and card_id = cid;

    delete from public.paragon_progress
    where user_id = p_from and card_id = cid;

    if not found and src.user_id is null then
      src.degree := 1;
      src.xp := 0;
    end if;

    insert into public.paragon_progress (user_id, card_id, degree, xp, updated_at)
    values (
      p_to,
      cid,
      coalesce(src.degree, 1),
      coalesce(src.xp, 0),
      now()
    )
    on conflict (user_id, card_id) do update
      set degree = case
            when excluded.degree > public.paragon_progress.degree then excluded.degree
            else public.paragon_progress.degree
          end,
          xp = case
            when excluded.degree > public.paragon_progress.degree then excluded.xp
            when excluded.degree = public.paragon_progress.degree
              then greatest(excluded.xp, public.paragon_progress.xp)
            else public.paragon_progress.xp
          end,
          updated_at = now();
  end loop;
end;
$$;

create or replace function public._give_listed_paragon(
  p_user uuid,
  p_card_id text,
  p_degree integer,
  p_xp integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user is null or p_card_id is null or p_card_id not like '%-paragon' then
    return;
  end if;
  insert into public.paragon_progress (user_id, card_id, degree, xp, updated_at)
  values (
    p_user,
    p_card_id,
    greatest(1, least(100, coalesce(p_degree, 1))),
    greatest(0, coalesce(p_xp, 0)),
    now()
  )
  on conflict (user_id, card_id) do update
    set degree = excluded.degree,
        xp = excluded.xp,
        updated_at = now();
end;
$$;

create or replace function public.award_cards(p_card_ids text[])
returns text[]
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  uid uuid := public.current_account_id();
  added text[];
begin
  if uid is null then raise exception 'Not authenticated'; end if;

  if p_card_ids is null or coalesce(array_length(p_card_ids, 1), 0) = 0 then
    return '{}';
  end if;
  if coalesce(array_length(p_card_ids, 1), 0) > 40 then
    raise exception 'Too many cards in one award';
  end if;

  with cleaned as (
    select distinct trim(x) as card_id
    from unnest(p_card_ids) as t(x)
    where char_length(trim(x)) between 3 and 80
  ),
  inserted as (
    insert into public.owned_cards (user_id, card_id)
    select uid, c.card_id from cleaned c
    on conflict (user_id, card_id) do nothing
    returning card_id
  )
  select coalesce(array_agg(card_id), '{}') into added from inserted;

  insert into public.paragon_progress (user_id, card_id, degree, xp)
  select uid, x, 1, 0
  from unnest(added) as x
  where x like '%-paragon'
  on conflict (user_id, card_id) do nothing;

  return added;
end;
$$;

create or replace function public.get_player_paragons(p_user_id uuid)
returns table(card_id text, degree integer, xp integer)
language sql
stable
security definer
set search_path = public
as $$
  select p.card_id, p.degree, p.xp
  from public.paragon_progress p
  where p.user_id = p_user_id
  order by p.card_id;
$$;

create or replace function public.apply_paragon_feeds(p_feeds jsonb)
returns table(
  card_id text,
  degree integer,
  xp integer,
  xp_gained integer,
  degrees_gained integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_account_id();
  rec record;
  cur public.paragon_progress%rowtype;
  applied record;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  if p_feeds is null or jsonb_typeof(p_feeds) <> 'array' then
    return;
  end if;
  if jsonb_array_length(p_feeds) > 20 then
    raise exception 'Too many paragon feeds';
  end if;

  for rec in
    select
      trim(x.card_id) as card_id,
      least(2000000, greatest(0, sum(coalesce(x.xp, 0))))::integer as add_xp,
      least(20, greatest(0, sum(coalesce(x.degrees, 0))))::integer as add_degrees
    from jsonb_to_recordset(p_feeds) as x(card_id text, xp integer, degrees integer)
    where trim(coalesce(x.card_id, '')) like '%-paragon'
    group by trim(x.card_id)
  loop
    if not exists (
      select 1 from public.owned_cards
      where user_id = uid and card_id = rec.card_id
    ) then
      continue;
    end if;

    select * into cur
    from public.paragon_progress
    where user_id = uid and card_id = rec.card_id;

    if not found then
      cur.degree := 1;
      cur.xp := 0;
    end if;

    select * into applied
    from public._apply_paragon_gain(cur.degree, cur.xp, rec.add_xp, rec.add_degrees);

    insert into public.paragon_progress (user_id, card_id, degree, xp, updated_at)
    values (uid, rec.card_id, applied.o_degree, applied.o_xp, now())
    on conflict (user_id, card_id) do update
      set degree = excluded.degree,
          xp = excluded.xp,
          updated_at = now();

    card_id := rec.card_id;
    degree := applied.o_degree;
    xp := applied.o_xp;
    xp_gained := rec.add_xp;
    degrees_gained := applied.o_degrees_gained;
    return next;
  end loop;
end;
$$;

create or replace function public.import_paragon_progress(p_rows jsonb)
returns table(card_id text, degree integer, xp integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_account_id();
  rec record;
  incoming_degree integer;
  incoming_xp integer;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    return;
  end if;

  for rec in
    select trim(x.card_id) as card_id, x.degree, x.xp
    from jsonb_to_recordset(p_rows) as x(card_id text, degree integer, xp integer)
    where trim(coalesce(x.card_id, '')) like '%-paragon'
  loop
    if not exists (
      select 1 from public.owned_cards
      where user_id = uid and card_id = rec.card_id
    ) then
      continue;
    end if;

    incoming_degree := greatest(1, least(100, coalesce(rec.degree, 1)));
    incoming_xp := greatest(0, coalesce(rec.xp, 0));
    if incoming_degree >= 100 then
      incoming_xp := 0;
    end if;

    insert into public.paragon_progress (user_id, card_id, degree, xp, updated_at)
    values (uid, rec.card_id, incoming_degree, incoming_xp, now())
    on conflict (user_id, card_id) do update
      set degree = case
            when excluded.degree > public.paragon_progress.degree then excluded.degree
            else public.paragon_progress.degree
          end,
          xp = case
            when excluded.degree > public.paragon_progress.degree then excluded.xp
            when excluded.degree = public.paragon_progress.degree
              then greatest(excluded.xp, public.paragon_progress.xp)
            else public.paragon_progress.xp
          end,
          updated_at = now();
  end loop;

  return query
    select p.card_id, p.degree, p.xp
    from public.paragon_progress p
    where p.user_id = uid;
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
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  cleaned := trim(coalesce(p_card_id, ''));
  if char_length(cleaned) < 3 or char_length(cleaned) > 80 then
    raise exception 'Invalid card';
  end if;
  if p_price is null or p_price < 10 or p_price > 1000000 then
    raise exception 'Price must be between 10 and 1,000,000';
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
  where user_id = uid and card_id = cleaned;
  if not found then
    raise exception 'You do not own this card';
  end if;

  if cleaned like '%-paragon' then
    delete from public.paragon_progress
    where user_id = uid and card_id = cleaned;
  end if;

  begin
    insert into public.marketplace_listings (
      seller_id, card_id, price, status, paragon_degree, paragon_xp
    )
    values (
      uid,
      cleaned,
      p_price,
      'active',
      snap_degree,
      snap_xp
    )
    returning id into listing_id;
  exception
    when unique_violation then
      insert into public.owned_cards (user_id, card_id)
      values (uid, cleaned)
      on conflict (user_id, card_id) do nothing;
      if cleaned like '%-paragon' then
        perform public._give_listed_paragon(uid, cleaned, snap_degree, snap_xp);
      end if;
      raise exception 'Card is already listed';
  end;

  return listing_id;
end;
$$;

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

  if listing.card_id like '%-paragon' then
    perform public._give_listed_paragon(
      uid,
      listing.card_id,
      listing.paragon_degree,
      listing.paragon_xp
    );
  end if;

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

  if listing.card_id like '%-paragon' then
    perform public._give_listed_paragon(
      offer.buyer_id,
      listing.card_id,
      listing.paragon_degree,
      listing.paragon_xp
    );
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

create or replace function public.set_trade_ready(p_trade_id uuid, p_ready boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_account_id();
  t public.trades%rowtype;
  my_cards text[];
  their_cards text[];
  cid text;
  both_ready boolean;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  if p_trade_id is null then raise exception 'Missing trade'; end if;

  select * into t from public.trades where id = p_trade_id for update;
  if not found then raise exception 'Trade not found'; end if;
  if t.status <> 'active' then raise exception 'Trade is not active'; end if;
  if t.requester_id <> uid and t.recipient_id <> uid then
    raise exception 'Not your trade';
  end if;

  if t.requester_id = uid then
    update public.trades
    set requester_ready = coalesce(p_ready, false), updated_at = now()
    where id = t.id
    returning * into t;
  else
    update public.trades
    set recipient_ready = coalesce(p_ready, false), updated_at = now()
    where id = t.id
    returning * into t;
  end if;

  both_ready := t.requester_ready and t.recipient_ready;
  if not both_ready then
    return public.get_trade(t.id);
  end if;

  select coalesce(array_agg(o.card_id), '{}') into my_cards
  from public.trade_offers o
  where o.trade_id = t.id and o.owner_id = t.requester_id;

  select coalesce(array_agg(o.card_id), '{}') into their_cards
  from public.trade_offers o
  where o.trade_id = t.id and o.owner_id = t.recipient_id;

  if coalesce(array_length(my_cards, 1), 0) = 0
     and coalesce(array_length(their_cards, 1), 0) = 0 then
    update public.trades
    set requester_ready = false,
        recipient_ready = false,
        updated_at = now()
    where id = t.id;
    raise exception 'Add at least one card before completing';
  end if;

  foreach cid in array my_cards
  loop
    if not exists (
      select 1 from public.owned_cards
      where user_id = t.requester_id and card_id = cid
    ) then
      update public.trades
      set requester_ready = false, recipient_ready = false, updated_at = now()
      where id = t.id;
      raise exception 'Requester no longer owns a offered card';
    end if;
    if exists (
      select 1 from public.owned_cards
      where user_id = t.recipient_id and card_id = cid
    ) and not (cid = any (their_cards)) then
      update public.trades
      set requester_ready = false, recipient_ready = false, updated_at = now()
      where id = t.id;
      raise exception 'Partner already owns a card you are offering';
    end if;
  end loop;

  foreach cid in array their_cards
  loop
    if not exists (
      select 1 from public.owned_cards
      where user_id = t.recipient_id and card_id = cid
    ) then
      update public.trades
      set requester_ready = false, recipient_ready = false, updated_at = now()
      where id = t.id;
      raise exception 'Recipient no longer owns a offered card';
    end if;
    if exists (
      select 1 from public.owned_cards
      where user_id = t.requester_id and card_id = cid
    ) and not (cid = any (my_cards)) then
      update public.trades
      set requester_ready = false, recipient_ready = false, updated_at = now()
      where id = t.id;
      raise exception 'You already own a card they are offering';
    end if;
  end loop;

  perform public._move_paragon_progress(t.requester_id, t.recipient_id, my_cards);
  perform public._move_paragon_progress(t.recipient_id, t.requester_id, their_cards);

  if coalesce(array_length(my_cards, 1), 0) > 0 then
    delete from public.owned_cards
    where user_id = t.requester_id and card_id = any (my_cards);
  end if;
  if coalesce(array_length(their_cards, 1), 0) > 0 then
    delete from public.owned_cards
    where user_id = t.recipient_id and card_id = any (their_cards);
  end if;

  if coalesce(array_length(my_cards, 1), 0) > 0 then
    insert into public.owned_cards (user_id, card_id)
    select t.recipient_id, c from unnest(my_cards) as c
    on conflict do nothing;
  end if;
  if coalesce(array_length(their_cards, 1), 0) > 0 then
    insert into public.owned_cards (user_id, card_id)
    select t.requester_id, c from unnest(their_cards) as c
    on conflict do nothing;
  end if;

  update public.trades
  set status = 'completed',
      updated_at = now(),
      requester_ready = false,
      recipient_ready = false
  where id = t.id;

  return public.get_trade(t.id);
end;
$$;

revoke all on function public.paragon_xp_to_next(integer) from public;
revoke all on function public._apply_paragon_gain(integer, integer, integer, integer) from public;
revoke all on function public._move_paragon_progress(uuid, uuid, text[]) from public;
revoke all on function public._give_listed_paragon(uuid, text, integer, integer) from public;
revoke all on function public.get_player_paragons(uuid) from public;
revoke all on function public.apply_paragon_feeds(jsonb) from public;
revoke all on function public.import_paragon_progress(jsonb) from public;
revoke all on function public.award_cards(text[]) from public;
revoke all on function public.list_card_for_sale(text, integer) from public;
revoke all on function public.cancel_listing(uuid) from public;
revoke all on function public.buy_listing(uuid) from public;
revoke all on function public.respond_listing_offer(uuid, boolean) from public;
revoke all on function public.set_trade_ready(uuid, boolean) from public;

grant execute on function public.get_player_paragons(uuid) to anon, authenticated;
grant execute on function public.apply_paragon_feeds(jsonb) to anon, authenticated;
grant execute on function public.import_paragon_progress(jsonb) to anon, authenticated;
grant execute on function public.award_cards(text[]) to anon, authenticated;
grant execute on function public.list_card_for_sale(text, integer) to anon, authenticated;
grant execute on function public.cancel_listing(uuid) to anon, authenticated;
grant execute on function public.buy_listing(uuid) to anon, authenticated;
grant execute on function public.respond_listing_offer(uuid, boolean) to anon, authenticated;
grant execute on function public.set_trade_ready(uuid, boolean) to anon, authenticated;
