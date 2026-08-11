-- Keep swapped cards visible after a trade completes.
-- Apply after trades.sql (or re-run the updated set_trade_ready in that file).
-- The only change vs the previous function: do not delete trade_offers on complete.

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

revoke all on function public.set_trade_ready(uuid, boolean) from public;
grant execute on function public.set_trade_ready(uuid, boolean) to anon, authenticated;
