-- Two-step exchanges (recipient names a price, requester must accept)
-- plus unique visual seeds on every owned T5 / Paragon copy.
-- Safe to re-run.

create or replace function public._new_visual_seed()
returns bigint
language sql
volatile
as $$
  select (floor(random() * 4294967296))::bigint;
$$;

alter table public.owned_cards
  add column if not exists visual_seed bigint;

alter table public.owned_cards
  alter column visual_seed set default public._new_visual_seed();

update public.owned_cards
set visual_seed = public._new_visual_seed()
where visual_seed is null;

alter table public.owned_cards
  alter column visual_seed set not null;

alter table public.marketplace_listings
  add column if not exists visual_seed bigint;

alter table public.card_exchanges
  drop constraint if exists card_exchanges_status_ok;

alter table public.card_exchanges
  add constraint card_exchanges_status_ok check (
    status in ('pending', 'offered', 'completed', 'declined', 'cancelled')
  );

drop index if exists public.card_exchanges_one_pending_pair_idx;

create unique index if not exists card_exchanges_one_open_pair_idx
  on public.card_exchanges (
    least(requester_id, recipient_id),
    greatest(requester_id, recipient_id)
  )
  where status in ('pending', 'offered');

create or replace function public._swap_owned_card_copies(
  p_a uuid,
  p_b uuid,
  p_card_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  a_got timestamptz;
  b_got timestamptz;
  a_seed bigint;
  b_seed bigint;
  a_deg integer;
  a_xp integer;
  b_deg integer;
  b_xp integer;
begin
  if p_a is null or p_b is null or p_card_id is null then
    return;
  end if;

  select obtained_at, visual_seed into a_got, a_seed
  from public.owned_cards
  where user_id = p_a and card_id = p_card_id;
  select obtained_at, visual_seed into b_got, b_seed
  from public.owned_cards
  where user_id = p_b and card_id = p_card_id;

  if a_got is null or b_got is null then
    raise exception 'Both players must own that card';
  end if;

  update public.owned_cards
  set obtained_at = b_got,
      visual_seed = coalesce(b_seed, public._new_visual_seed())
  where user_id = p_a and card_id = p_card_id;
  update public.owned_cards
  set obtained_at = a_got,
      visual_seed = coalesce(a_seed, public._new_visual_seed())
  where user_id = p_b and card_id = p_card_id;

  if p_card_id not like '%-paragon' then
    return;
  end if;

  select degree, xp into a_deg, a_xp
  from public.paragon_progress
  where user_id = p_a and card_id = p_card_id;
  select degree, xp into b_deg, b_xp
  from public.paragon_progress
  where user_id = p_b and card_id = p_card_id;

  delete from public.paragon_progress
  where card_id = p_card_id and user_id in (p_a, p_b);

  insert into public.paragon_progress (user_id, card_id, degree, xp, updated_at)
  values
    (p_a, p_card_id, coalesce(b_deg, 1), coalesce(b_xp, 0), now()),
    (p_b, p_card_id, coalesce(a_deg, 1), coalesce(a_xp, 0), now());
end;
$$;

create or replace function public.request_exchange(
  p_username text,
  p_card_id text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_account_id();
  target uuid;
  cid text := trim(coalesce(p_card_id, ''));
  tid uuid;
  pending_in integer;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;
  if char_length(cid) < 3 or char_length(cid) > 80 then
    raise exception 'Pick a card to exchange';
  end if;

  select p.id into target
  from public.profiles p
  where lower(p.username) = lower(trim(coalesce(p_username, '')))
  limit 1;

  if target is null then
    raise exception 'Player not found';
  end if;
  if target = uid then
    raise exception 'You cannot exchange with yourself';
  end if;

  if not exists (
    select 1 from public.owned_cards
    where user_id = uid and card_id = cid
  ) then
    raise exception 'You do not own that card';
  end if;
  if not exists (
    select 1 from public.owned_cards
    where user_id = target and card_id = cid
  ) then
    raise exception 'They do not own that card';
  end if;

  select count(*) into pending_in
  from public.card_exchanges
  where recipient_id = target and status in ('pending', 'offered');
  if pending_in >= 20 then
    raise exception 'That player has too many pending exchange requests';
  end if;

  begin
    insert into public.card_exchanges (requester_id, recipient_id, card_id, status)
    values (uid, target, cid, 'pending')
    returning id into tid;
  exception
    when unique_violation then
      raise exception 'You already have an open exchange with this player';
  end;

  return tid;
end;
$$;

-- Recipient names a price (or declines). Does NOT move Cash or cards.
create or replace function public.respond_exchange(
  p_exchange_id uuid,
  p_accept boolean,
  p_price integer
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_account_id();
  e public.card_exchanges%rowtype;
  fee integer := coalesce(p_price, 0);
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into e
  from public.card_exchanges
  where id = p_exchange_id
  for update;

  if not found then
    raise exception 'Exchange not found';
  end if;
  if e.recipient_id <> uid then
    raise exception 'Only the recipient can set the price';
  end if;
  if e.status <> 'pending' then
    raise exception 'Exchange is no longer waiting for a price';
  end if;

  if not coalesce(p_accept, false) then
    update public.card_exchanges
    set status = 'declined', updated_at = now()
    where id = e.id;
    return 'declined';
  end if;

  if fee < 0 or fee > 1000000 then
    raise exception 'Price must be between 0 and 1,000,000';
  end if;

  if not exists (
    select 1 from public.owned_cards
    where user_id = e.requester_id and card_id = e.card_id
  ) or not exists (
    select 1 from public.owned_cards
    where user_id = e.recipient_id and card_id = e.card_id
  ) then
    raise exception 'Both players must still own that card';
  end if;

  update public.card_exchanges
  set status = 'offered',
      price = fee,
      updated_at = now()
  where id = e.id;

  return 'offered';
end;
$$;

-- Requester accepts or declines the named Cash fee. This is when money moves.
create or replace function public.confirm_exchange(
  p_exchange_id uuid,
  p_accept boolean
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_account_id();
  e public.card_exchanges%rowtype;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into e
  from public.card_exchanges
  where id = p_exchange_id
  for update;

  if not found then
    raise exception 'Exchange not found';
  end if;
  if e.requester_id <> uid then
    raise exception 'Only the original player can accept this offer';
  end if;
  if e.status <> 'offered' then
    raise exception 'No price offer to accept yet';
  end if;

  if not coalesce(p_accept, false) then
    update public.card_exchanges
    set status = 'declined', updated_at = now()
    where id = e.id;
    return 'declined';
  end if;

  if not exists (
    select 1 from public.owned_cards
    where user_id = e.requester_id and card_id = e.card_id
  ) or not exists (
    select 1 from public.owned_cards
    where user_id = e.recipient_id and card_id = e.card_id
  ) then
    raise exception 'Both players must still own that card';
  end if;

  if e.price > 0 then
    perform public._debit_coins_verified(e.requester_id, e.price);
    perform public._credit_coins_verified(e.recipient_id, e.price);
  end if;

  perform public._swap_owned_card_copies(
    e.requester_id,
    e.recipient_id,
    e.card_id
  );

  update public.card_exchanges
  set status = 'completed',
      updated_at = now()
  where id = e.id;

  return 'completed';
end;
$$;

create or replace function public.cancel_exchange(p_exchange_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_account_id();
  e public.card_exchanges%rowtype;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into e
  from public.card_exchanges
  where id = p_exchange_id
  for update;

  if not found then
    raise exception 'Exchange not found';
  end if;
  if e.requester_id <> uid and e.recipient_id <> uid then
    raise exception 'Not your exchange';
  end if;
  if e.status not in ('pending', 'offered') then
    raise exception 'Exchange cannot be cancelled';
  end if;

  update public.card_exchanges
  set status = 'cancelled', updated_at = now()
  where id = e.id;

  return true;
end;
$$;

create or replace function public.get_exchange_inbox()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_account_id();
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  return jsonb_build_object(
    'incoming',
    coalesce((
      select jsonb_agg(x order by x->>'createdAt' desc)
      from (
        select jsonb_build_object(
          'id', e.id,
          'partnerId', e.requester_id,
          'partnerUsername', coalesce(p.username, 'Player'),
          'status', e.status,
          'cardId', e.card_id,
          'price', e.price,
          'theirDegree', coalesce(rp.degree, 1),
          'myDegree', coalesce(me.degree, 1),
          'theirSeed', coalesce(oc_them.visual_seed, 0),
          'mySeed', coalesce(oc_me.visual_seed, 0),
          'createdAt', e.created_at
        ) as x
        from public.card_exchanges e
        left join public.profiles p on p.id = e.requester_id
        left join public.paragon_progress rp
          on rp.user_id = e.requester_id and rp.card_id = e.card_id
        left join public.paragon_progress me
          on me.user_id = uid and me.card_id = e.card_id
        left join public.owned_cards oc_them
          on oc_them.user_id = e.requester_id and oc_them.card_id = e.card_id
        left join public.owned_cards oc_me
          on oc_me.user_id = uid and oc_me.card_id = e.card_id
        where e.recipient_id = uid and e.status in ('pending', 'offered')
      ) q
    ), '[]'::jsonb),
    'outgoing',
    coalesce((
      select jsonb_agg(x order by x->>'createdAt' desc)
      from (
        select jsonb_build_object(
          'id', e.id,
          'partnerId', e.recipient_id,
          'partnerUsername', coalesce(p.username, 'Player'),
          'status', e.status,
          'cardId', e.card_id,
          'price', e.price,
          'theirDegree', coalesce(rp.degree, 1),
          'myDegree', coalesce(me.degree, 1),
          'theirSeed', coalesce(oc_them.visual_seed, 0),
          'mySeed', coalesce(oc_me.visual_seed, 0),
          'createdAt', e.created_at
        ) as x
        from public.card_exchanges e
        left join public.profiles p on p.id = e.recipient_id
        left join public.paragon_progress rp
          on rp.user_id = e.recipient_id and rp.card_id = e.card_id
        left join public.paragon_progress me
          on me.user_id = uid and me.card_id = e.card_id
        left join public.owned_cards oc_them
          on oc_them.user_id = e.recipient_id and oc_them.card_id = e.card_id
        left join public.owned_cards oc_me
          on oc_me.user_id = uid and oc_me.card_id = e.card_id
        where e.requester_id = uid and e.status in ('pending', 'offered')
      ) q
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.get_player_card_copies(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_user_id is null then
    return '[]'::jsonb;
  end if;

  return coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'cardId', oc.card_id,
          'visualSeed', oc.visual_seed,
          'obtainedAt', oc.obtained_at
        )
        order by oc.obtained_at asc
      )
      from public.owned_cards oc
      where oc.user_id = p_user_id
    ),
    '[]'::jsonb
  );
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

  insert into public.owned_cards (user_id, card_id, visual_seed)
  values (
    uid,
    listing.card_id,
    coalesce(listing.visual_seed, public._new_visual_seed())
  )
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

  insert into public.owned_cards (user_id, card_id, visual_seed)
  values (
    offer.buyer_id,
    listing.card_id,
    coalesce(listing.visual_seed, public._new_visual_seed())
  );

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
  seed_map jsonb := '{}'::jsonb;
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

  select coalesce(
    jsonb_object_agg(oc.user_id::text || ':' || oc.card_id, oc.visual_seed),
    '{}'::jsonb
  )
  into seed_map
  from public.owned_cards oc
  where (oc.user_id = t.requester_id and oc.card_id = any (my_cards))
     or (oc.user_id = t.recipient_id and oc.card_id = any (their_cards));

  if coalesce(array_length(my_cards, 1), 0) > 0 then
    delete from public.owned_cards
    where user_id = t.requester_id and card_id = any (my_cards);
  end if;
  if coalesce(array_length(their_cards, 1), 0) > 0 then
    delete from public.owned_cards
    where user_id = t.recipient_id and card_id = any (their_cards);
  end if;

  if coalesce(array_length(my_cards, 1), 0) > 0 then
    insert into public.owned_cards (user_id, card_id, visual_seed)
    select
      t.recipient_id,
      c,
      coalesce(
        (seed_map ->> (t.requester_id::text || ':' || c))::bigint,
        public._new_visual_seed()
      )
    from unnest(my_cards) as c
    on conflict do nothing;
  end if;
  if coalesce(array_length(their_cards, 1), 0) > 0 then
    insert into public.owned_cards (user_id, card_id, visual_seed)
    select
      t.requester_id,
      c,
      coalesce(
        (seed_map ->> (t.recipient_id::text || ':' || c))::bigint,
        public._new_visual_seed()
      )
    from unnest(their_cards) as c
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

revoke all on function public._new_visual_seed() from public;
revoke all on function public._swap_owned_card_copies(uuid, uuid, text) from public;
revoke all on function public.request_exchange(text, text) from public;
revoke all on function public.respond_exchange(uuid, boolean, integer) from public;
revoke all on function public.confirm_exchange(uuid, boolean) from public;
revoke all on function public.cancel_exchange(uuid) from public;
revoke all on function public.get_exchange_inbox() from public;
revoke all on function public.get_player_card_copies(uuid) from public;

grant execute on function public.request_exchange(text, text) to anon, authenticated;
grant execute on function public.respond_exchange(uuid, boolean, integer) to anon, authenticated;
grant execute on function public.confirm_exchange(uuid, boolean) to anon, authenticated;
grant execute on function public.cancel_exchange(uuid) to anon, authenticated;
grant execute on function public.get_exchange_inbox() to anon, authenticated;
grant execute on function public.get_player_card_copies(uuid) to anon, authenticated;
