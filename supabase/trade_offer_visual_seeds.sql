-- Include each offered copy's art seed in get_trade so the trade table
-- can preview the owner's T4+ art instead of a fallback / viewer seed.
-- Safe to re-run.

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
  my_cards text[];
  their_cards text[];
  my_seeds jsonb;
  their_seeds jsonb;
  partner_id uuid;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  perform public.expire_stale_trades();

  select * into t from public.trades where id = p_trade_id;
  if not found then
    raise exception 'Trade not found';
  end if;
  if t.requester_id <> uid and t.recipient_id <> uid then
    raise exception 'Not a party to this trade';
  end if;

  if t.status in ('pending', 'active') and t.opened_at is null then
    update public.trades
    set opened_at = now()
    where id = t.id
      and opened_at is null;
    t.opened_at := now();
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

  -- Active: seed still lives on the offer owner's copy.
  -- Completed: copies swapped, so look up the recipient's inventory.
  select coalesce(
    (select jsonb_object_agg(seed.card_id, seed.visual_seed)
     from (
       select o.card_id, oc.visual_seed
       from public.trade_offers o
       left join public.owned_cards oc
         on oc.card_id = o.card_id
        and oc.user_id = case
          when t.status = 'completed' then partner_id
          else uid
        end
       where o.trade_id = t.id and o.owner_id = uid
     ) seed),
    '{}'::jsonb
  )
  into my_seeds;

  select coalesce(
    (select jsonb_object_agg(seed.card_id, seed.visual_seed)
     from (
       select o.card_id, oc.visual_seed
       from public.trade_offers o
       left join public.owned_cards oc
         on oc.card_id = o.card_id
        and oc.user_id = case
          when t.status = 'completed' then uid
          else partner_id
        end
       where o.trade_id = t.id and o.owner_id = partner_id
     ) seed),
    '{}'::jsonb
  )
  into their_seeds;

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
    'myOfferSeeds', coalesce(my_seeds, '{}'::jsonb),
    'theirOfferSeeds', coalesce(their_seeds, '{}'::jsonb),
    'updatedAt', t.updated_at,
    'createdAt', t.created_at
  );
end;
$$;
