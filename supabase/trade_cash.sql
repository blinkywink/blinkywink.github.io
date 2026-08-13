-- Cash bargaining on live trades + get_trade / set_trade_offer updates.
-- Safe to re-run.

alter table public.trades
  add column if not exists requester_cash integer not null default 0;

alter table public.trades
  add column if not exists recipient_cash integer not null default 0;

alter table public.trades
  drop constraint if exists trades_cash_nonneg;

alter table public.trades
  add constraint trades_cash_nonneg check (
    requester_cash >= 0 and recipient_cash >= 0
  );

create or replace function public.get_trade(p_trade_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_account_id();
  t public.trades%rowtype;
  requester_name text;
  recipient_name text;
  partner_id uuid;
  my_cards text[];
  their_cards text[];
  my_cash integer;
  their_cash integer;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into t from public.trades where id = p_trade_id;
  if not found then
    raise exception 'Trade not found';
  end if;
  if t.requester_id <> uid and t.recipient_id <> uid then
    raise exception 'Not a party to this trade';
  end if;

  select username into requester_name from public.profiles where id = t.requester_id;
  select username into recipient_name from public.profiles where id = t.recipient_id;

  partner_id := case
    when t.requester_id = uid then t.recipient_id
    else t.requester_id
  end;

  select coalesce(array_agg(o.card_id order by o.created_at, o.card_id), '{}')
  into my_cards
  from public.trade_offers o
  where o.trade_id = t.id and o.owner_id = uid;

  select coalesce(array_agg(o.card_id order by o.created_at, o.card_id), '{}')
  into their_cards
  from public.trade_offers o
  where o.trade_id = t.id and o.owner_id = partner_id;

  if t.requester_id = uid then
    my_cash := t.requester_cash;
    their_cash := t.recipient_cash;
  else
    my_cash := t.recipient_cash;
    their_cash := t.requester_cash;
  end if;

  return jsonb_build_object(
    'id', t.id,
    'status', t.status,
    'requesterId', t.requester_id,
    'recipientId', t.recipient_id,
    'requesterUsername', coalesce(requester_name, 'Player'),
    'recipientUsername', coalesce(recipient_name, 'Player'),
    'requesterReady', t.requester_ready,
    'recipientReady', t.recipient_ready,
    'myOffer', to_jsonb(my_cards),
    'theirOffer', to_jsonb(their_cards),
    'myCash', my_cash,
    'theirCash', their_cash,
    'updatedAt', t.updated_at,
    'createdAt', t.created_at
  );
end;
$$;

drop function if exists public.set_trade_offer(uuid, text[]);

create or replace function public.set_trade_offer(
  p_trade_id uuid,
  p_card_ids text[],
  p_cash integer default 0
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_account_id();
  t public.trades%rowtype;
  cleaned text[];
  cid text;
  partner uuid;
  partner_offer text[];
  cash_amt integer := greatest(0, coalesce(p_cash, 0));
  bal integer;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into t
  from public.trades
  where id = p_trade_id
  for update;

  if not found then
    raise exception 'Trade not found';
  end if;
  if t.status <> 'active' then
    raise exception 'Trade is not active';
  end if;
  if t.requester_id <> uid and t.recipient_id <> uid then
    raise exception 'Not a party to this trade';
  end if;

  if cash_amt > 50000000 then
    raise exception 'Cash offer too large';
  end if;

  cleaned := array(
    select distinct trim(x)
    from unnest(coalesce(p_card_ids, '{}'::text[])) as x
    where trim(x) <> ''
  );

  if coalesce(array_length(cleaned, 1), 0) > 8 then
    raise exception 'Max 8 cards per side';
  end if;

  select coins into bal from public.profiles where id = uid for update;
  if coalesce(bal, 0) < cash_amt then
    raise exception 'Not enough Cash for that offer';
  end if;

  partner := case
    when t.requester_id = uid then t.recipient_id
    else t.requester_id
  end;

  select coalesce(array_agg(o.card_id), '{}')
  into partner_offer
  from public.trade_offers o
  where o.trade_id = t.id and o.owner_id = partner;

  foreach cid in array cleaned
  loop
    if char_length(cid) < 3 or char_length(cid) > 80 then
      raise exception 'Invalid card';
    end if;
    if not exists (
      select 1 from public.owned_cards
      where user_id = uid and card_id = cid
    ) then
      raise exception 'You do not own one of those cards';
    end if;
    if exists (
      select 1 from public.owned_cards
      where user_id = partner and card_id = cid
    ) and not (cid = any (partner_offer)) then
      raise exception 'They already own one of those cards';
    end if;
  end loop;

  delete from public.trade_offers
  where trade_id = t.id and owner_id = uid;

  if coalesce(array_length(cleaned, 1), 0) > 0 then
    insert into public.trade_offers (trade_id, owner_id, card_id)
    select t.id, uid, c from unnest(cleaned) as c;
  end if;

  if t.requester_id = uid then
    update public.trades
    set requester_cash = cash_amt,
        requester_ready = false,
        recipient_ready = false,
        updated_at = now()
    where id = t.id;
  else
    update public.trades
    set recipient_cash = cash_amt,
        requester_ready = false,
        recipient_ready = false,
        updated_at = now()
    where id = t.id;
  end if;

  return true;
end;
$$;

create or replace function public.set_trade_ready(
  p_trade_id uuid,
  p_ready boolean
)
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
  partner uuid;
  cid text;
  both_ready boolean;
  req_cash integer;
  rec_cash integer;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into t
  from public.trades
  where id = p_trade_id
  for update;

  if not found then
    raise exception 'Trade not found';
  end if;
  if t.status <> 'active' then
    raise exception 'Trade is not active';
  end if;
  if t.requester_id <> uid and t.recipient_id <> uid then
    raise exception 'Not a party to this trade';
  end if;

  if t.requester_id = uid then
    update public.trades
    set requester_ready = coalesce(p_ready, false),
        updated_at = now()
    where id = t.id
    returning * into t;
  else
    update public.trades
    set recipient_ready = coalesce(p_ready, false),
        updated_at = now()
    where id = t.id
    returning * into t;
  end if;

  both_ready := t.requester_ready and t.recipient_ready;
  if not both_ready then
    return public.get_trade(t.id);
  end if;

  partner := case when t.requester_id = uid then t.recipient_id else t.requester_id end;

  select coalesce(array_agg(o.card_id), '{}')
  into my_cards
  from public.trade_offers o
  where o.trade_id = t.id and o.owner_id = t.requester_id;

  select coalesce(array_agg(o.card_id), '{}')
  into their_cards
  from public.trade_offers o
  where o.trade_id = t.id and o.owner_id = t.recipient_id;

  req_cash := greatest(0, coalesce(t.requester_cash, 0));
  rec_cash := greatest(0, coalesce(t.recipient_cash, 0));

  if coalesce(array_length(my_cards, 1), 0) = 0
     and coalesce(array_length(their_cards, 1), 0) = 0
     and req_cash = 0
     and rec_cash = 0 then
    update public.trades
    set requester_ready = false,
        recipient_ready = false,
        updated_at = now()
    where id = t.id;
    raise exception 'Add cards or Cash before completing';
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

  -- Cash balance checks (both sides) before moving anything
  if req_cash > 0 then
    if coalesce((select coins from public.profiles where id = t.requester_id), 0) < req_cash then
      update public.trades
      set requester_ready = false, recipient_ready = false, updated_at = now()
      where id = t.id;
      raise exception 'Requester no longer has enough Cash';
    end if;
  end if;
  if rec_cash > 0 then
    if coalesce((select coins from public.profiles where id = t.recipient_id), 0) < rec_cash then
      update public.trades
      set requester_ready = false, recipient_ready = false, updated_at = now()
      where id = t.id;
      raise exception 'Recipient no longer has enough Cash';
    end if;
  end if;

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

  -- Transfer cash (requester pays recipient, recipient pays requester)
  if req_cash > 0 then
    perform public._debit_coins_verified(t.requester_id, req_cash);
    perform public._credit_coins_verified(t.recipient_id, req_cash);
  end if;
  if rec_cash > 0 then
    perform public._debit_coins_verified(t.recipient_id, rec_cash);
    perform public._credit_coins_verified(t.requester_id, rec_cash);
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

revoke all on function public.get_trade(uuid) from public;
revoke all on function public.set_trade_offer(uuid, text[], integer) from public;
revoke all on function public.set_trade_ready(uuid, boolean) from public;

grant execute on function public.get_trade(uuid) to anon, authenticated;
grant execute on function public.set_trade_offer(uuid, text[], integer) to anon, authenticated;
grant execute on function public.set_trade_ready(uuid, boolean) to anon, authenticated;
