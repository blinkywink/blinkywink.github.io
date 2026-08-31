-- Live patch: 40 concurrent trade rooms.
-- Unused invites: 3 minutes. Unfinished rooms: 10 minutes.
-- Safe to re-run. Do not replay all of supabase/trades.sql.

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
    'updatedAt', t.updated_at,
    'createdAt', t.created_at
  );
end;
$$;

revoke all on function public.expire_stale_trades() from public;
revoke all on function public.request_trade(text) from public;
revoke all on function public.respond_trade(uuid, boolean) from public;
revoke all on function public.get_trade_inbox() from public;
revoke all on function public.get_trade(uuid) from public;

grant execute on function public.request_trade(text) to anon, authenticated;
grant execute on function public.respond_trade(uuid, boolean) to anon, authenticated;
grant execute on function public.get_trade_inbox() to anon, authenticated;
grant execute on function public.get_trade(uuid) to anon, authenticated;
