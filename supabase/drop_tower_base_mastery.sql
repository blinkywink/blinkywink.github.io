-- Remove tower-base mastery feature. Safe to re-run.
-- Restores copy/trade/market RPCs to seed-only behavior, then drops mastered cols.

drop trigger if exists owned_cards_grant_mastery on public.owned_cards;
drop function if exists public._owned_cards_grant_mastery_trg();
drop function if exists public.grant_tower_base_masteries();
drop function if exists public.grant_tower_base_masteries_for(uuid);
drop function if exists public._tower_set_size(text);
drop function if exists public._is_tower_card(text, text);

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
    uid := auth.uid();
  end if;
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

create or replace function public._buy_listing_impl(p_listing_id uuid)
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

alter table public.owned_cards drop column if exists mastered;
alter table public.marketplace_listings drop column if exists mastered;

revoke all on function public.get_player_card_copies(uuid) from public;
grant execute on function public.get_player_card_copies(uuid) to anon, authenticated;
