-- Player-to-player live card trades
-- Safe to re-run

create table if not exists public.trades (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null,
  recipient_id uuid not null,
  status text not null default 'pending',
  requester_ready boolean not null default false,
  recipient_ready boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  opened_at timestamptz,
  activated_at timestamptz,
  constraint trades_parties_distinct check (requester_id <> recipient_id),
  constraint trades_status_ok check (
    status in ('pending', 'active', 'completed', 'declined', 'cancelled')
  )
);

create index if not exists trades_recipient_status_idx
  on public.trades (recipient_id, status, created_at desc);

create index if not exists trades_requester_status_idx
  on public.trades (requester_id, status, created_at desc);

create unique index if not exists trades_one_pending_pair_idx
  on public.trades (
    least(requester_id, recipient_id),
    greatest(requester_id, recipient_id)
  )
  where status in ('pending', 'active');

alter table public.trades
  add column if not exists opened_at timestamptz;

alter table public.trades
  add column if not exists activated_at timestamptz;

create index if not exists trades_expire_pending_idx
  on public.trades (created_at)
  where status = 'pending';

create index if not exists trades_expire_unopened_idx
  on public.trades (updated_at)
  where status = 'active' and opened_at is null;

create index if not exists trades_expire_active_idx
  on public.trades (activated_at)
  where status = 'active';

create table if not exists public.trade_offers (
  id uuid primary key default gen_random_uuid(),
  trade_id uuid not null references public.trades (id) on delete cascade,
  owner_id uuid not null,
  card_id text not null,
  created_at timestamptz not null default now(),
  constraint trade_offers_card_id_len check (
    char_length(card_id) between 3 and 80
  ),
  constraint trade_offers_unique unique (trade_id, owner_id, card_id)
);

create index if not exists trade_offers_trade_idx
  on public.trade_offers (trade_id, owner_id);

alter table public.trades enable row level security;
alter table public.trade_offers enable row level security;

-- No direct table access - use RPCs only
drop policy if exists "No direct trade reads" on public.trades;
drop policy if exists "No direct offer reads" on public.trade_offers;

revoke all on table public.trades from anon, authenticated;
revoke all on table public.trade_offers from anon, authenticated;
grant all on table public.trades to service_role;
grant all on table public.trade_offers to service_role;

-- 40 live rooms stays well under the N100 polling budget.
-- Pending invites and never-opened rooms drop after 3 minutes.
-- Open rooms that never finish drop after 10 minutes.
create or replace function public.expire_stale_trades()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.trade_offers o
  using public.trades t
  where o.trade_id = t.id
    and (
      (t.status = 'pending' and t.created_at < now() - interval '3 minutes')
      or (
        t.status = 'active'
        and t.opened_at is null
        and coalesce(t.activated_at, t.updated_at) < now() - interval '3 minutes'
      )
      or (
        t.status = 'active'
        and coalesce(t.activated_at, t.updated_at) < now() - interval '10 minutes'
      )
    );

  update public.trades
  set status = 'cancelled',
      updated_at = now(),
      requester_ready = false,
      recipient_ready = false
  where (
      status = 'pending'
      and created_at < now() - interval '3 minutes'
    )
    or (
      status = 'active'
      and opened_at is null
      and coalesce(activated_at, updated_at) < now() - interval '3 minutes'
    )
    or (
      status = 'active'
      and coalesce(activated_at, updated_at) < now() - interval '10 minutes'
    );
end;
$$;

revoke all on function public.expire_stale_trades() from public;

create or replace function public.request_trade(p_username text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_account_id();
  target uuid;
  tid uuid;
  pending_in integer;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  perform public.expire_stale_trades();

  if (select count(*) from public.trades where status = 'active') >= 40 then
    raise exception 'All 40 trade rooms are in use right now. Wait a minute, then try sending the request again.';
  end if;

  select p.id into target
  from public.profiles p
  where lower(p.username) = lower(trim(coalesce(p_username, '')))
  limit 1;

  if target is null then
    raise exception 'Player not found';
  end if;
  if target = uid then
    raise exception 'You cannot trade with yourself';
  end if;

  select count(*) into pending_in
  from public.trades
  where recipient_id = target and status = 'pending';
  if pending_in >= 20 then
    raise exception 'That player has too many pending trade requests';
  end if;

  begin
    insert into public.trades (requester_id, recipient_id, status)
    values (uid, target, 'pending')
    returning id into tid;
  exception
    when unique_violation then
      raise exception 'You already have an open trade with this player';
  end;

  return tid;
end;
$$;

create or replace function public.respond_trade(
  p_trade_id uuid,
  p_accept boolean
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_account_id();
  t public.trades%rowtype;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  perform public.expire_stale_trades();

  select * into t
  from public.trades
  where id = p_trade_id
  for update;

  if not found then
    raise exception 'Trade not found';
  end if;
  if t.recipient_id <> uid then
    raise exception 'Only the recipient can respond';
  end if;
  if t.status <> 'pending' then
    raise exception 'Trade is no longer pending';
  end if;

  if coalesce(p_accept, false) then
    if (select count(*) from public.trades where status = 'active') >= 40 then
      raise exception 'All 40 trade rooms are in use right now. Wait a minute, then try sending the request again.';
    end if;
    update public.trades
    set status = 'active',
        updated_at = now(),
        activated_at = now(),
        requester_ready = false,
        recipient_ready = false
    where id = t.id;
    return 'active';
  end if;

  update public.trades
  set status = 'declined',
      updated_at = now()
  where id = t.id;
  return 'declined';
end;
$$;

create or replace function public.cancel_trade(p_trade_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_account_id();
  t public.trades%rowtype;
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
  if t.requester_id <> uid and t.recipient_id <> uid then
    raise exception 'Not a party to this trade';
  end if;
  if t.status not in ('pending', 'active') then
    raise exception 'Trade cannot be cancelled';
  end if;

  delete from public.trade_offers where trade_id = t.id;

  update public.trades
  set status = 'cancelled',
      updated_at = now(),
      requester_ready = false,
      recipient_ready = false
  where id = t.id;

  return true;
end;
$$;

create or replace function public.get_trade_inbox()
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

  perform public.expire_stale_trades();

  return jsonb_build_object(
    'incoming',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', t.id,
            'partnerId', t.requester_id,
            'partnerUsername', p.username,
            'status', t.status,
            'createdAt', t.created_at
          )
          order by t.created_at desc
        )
        from public.trades t
        join public.profiles p on p.id = t.requester_id
        where t.recipient_id = uid and t.status = 'pending'
      ),
      '[]'::jsonb
    ),
    'outgoing',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', t.id,
            'partnerId', t.recipient_id,
            'partnerUsername', p.username,
            'status', t.status,
            'createdAt', t.created_at
          )
          order by t.created_at desc
        )
        from public.trades t
        join public.profiles p on p.id = t.recipient_id
        where t.requester_id = uid and t.status = 'pending'
      ),
      '[]'::jsonb
    ),
    'active',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', t.id,
            'partnerId', case
              when t.requester_id = uid then t.recipient_id
              else t.requester_id
            end,
            'partnerUsername', p.username,
            'status', t.status,
            'createdAt', t.created_at
          )
          order by t.updated_at desc
        )
        from public.trades t
        join public.profiles p on p.id = case
          when t.requester_id = uid then t.recipient_id
          else t.requester_id
        end
        where t.status = 'active'
          and (t.requester_id = uid or t.recipient_id = uid)
      ),
      '[]'::jsonb
    )
  );
end;
$$;

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

create or replace function public.set_trade_offer(
  p_trade_id uuid,
  p_card_ids text[]
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

  cleaned := array(
    select distinct trim(x)
    from unnest(coalesce(p_card_ids, '{}'::text[])) as x
    where trim(x) <> ''
  );

  if coalesce(array_length(cleaned, 1), 0) > 8 then
    raise exception 'Max 8 cards per side';
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

  update public.trades
  set requester_ready = false,
      recipient_ready = false,
      updated_at = now()
  where id = t.id;

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

  -- Execute swap
  partner := case when t.requester_id = uid then t.recipient_id else t.requester_id end;

  select coalesce(array_agg(o.card_id), '{}')
  into my_cards
  from public.trade_offers o
  where o.trade_id = t.id and o.owner_id = uid;

  select coalesce(array_agg(o.card_id), '{}')
  into their_cards
  from public.trade_offers o
  where o.trade_id = t.id and o.owner_id = partner;

  -- Re-read both sides from DB (not just caller's view)
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

  -- Ownership + conflict checks
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

  -- Remove offered cards from both sides
  if coalesce(array_length(my_cards, 1), 0) > 0 then
    delete from public.owned_cards
    where user_id = t.requester_id and card_id = any (my_cards);
  end if;
  if coalesce(array_length(their_cards, 1), 0) > 0 then
    delete from public.owned_cards
    where user_id = t.recipient_id and card_id = any (their_cards);
  end if;

  -- Deliver swapped cards
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

  -- Keep offer rows so both players still see what swapped.

  update public.trades
  set status = 'completed',
      updated_at = now(),
      requester_ready = false,
      recipient_ready = false
  where id = t.id;

  return public.get_trade(t.id);
end;
$$;

revoke all on function public.expire_stale_trades() from public;
revoke all on function public.request_trade(text) from public;
revoke all on function public.respond_trade(uuid, boolean) from public;
revoke all on function public.cancel_trade(uuid) from public;
revoke all on function public.get_trade_inbox() from public;
revoke all on function public.get_trade(uuid) from public;
revoke all on function public.set_trade_offer(uuid, text[]) from public;
revoke all on function public.set_trade_ready(uuid, boolean) from public;

grant execute on function public.request_trade(text) to anon, authenticated;
grant execute on function public.respond_trade(uuid, boolean) to anon, authenticated;
grant execute on function public.cancel_trade(uuid) to anon, authenticated;
grant execute on function public.get_trade_inbox() to anon, authenticated;
grant execute on function public.get_trade(uuid) to anon, authenticated;
grant execute on function public.set_trade_offer(uuid, text[]) to anon, authenticated;
grant execute on function public.set_trade_ready(uuid, boolean) to anon, authenticated;
