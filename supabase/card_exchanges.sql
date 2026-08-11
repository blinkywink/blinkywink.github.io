-- Same-card copy exchange (paragon degree / copy identity).
-- Sender picks a card both own. Recipient names a Cash fee (0 = free).
-- Safe to re-run.

create table if not exists public.card_exchanges (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null,
  recipient_id uuid not null,
  card_id text not null,
  price integer not null default 0,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint card_exchanges_parties_distinct check (requester_id <> recipient_id),
  constraint card_exchanges_card_id_len check (
    char_length(card_id) between 3 and 80
  ),
  constraint card_exchanges_price_ok check (price >= 0 and price <= 1000000),
  constraint card_exchanges_status_ok check (
    status in ('pending', 'completed', 'declined', 'cancelled')
  )
);

create index if not exists card_exchanges_recipient_status_idx
  on public.card_exchanges (recipient_id, status, created_at desc);

create index if not exists card_exchanges_requester_status_idx
  on public.card_exchanges (requester_id, status, created_at desc);

create unique index if not exists card_exchanges_one_pending_pair_idx
  on public.card_exchanges (
    least(requester_id, recipient_id),
    greatest(requester_id, recipient_id)
  )
  where status = 'pending';

alter table public.card_exchanges enable row level security;

revoke all on table public.card_exchanges from anon, authenticated;
grant all on table public.card_exchanges to service_role;

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
  a_deg integer;
  a_xp integer;
  b_deg integer;
  b_xp integer;
begin
  if p_a is null or p_b is null or p_card_id is null then
    return;
  end if;

  select obtained_at into a_got
  from public.owned_cards
  where user_id = p_a and card_id = p_card_id;
  select obtained_at into b_got
  from public.owned_cards
  where user_id = p_b and card_id = p_card_id;

  if a_got is null or b_got is null then
    raise exception 'Both players must own that card';
  end if;

  update public.owned_cards
  set obtained_at = b_got
  where user_id = p_a and card_id = p_card_id;
  update public.owned_cards
  set obtained_at = a_got
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
  where recipient_id = target and status = 'pending';
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
    raise exception 'Exchange is no longer pending';
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

  if fee > 0 then
    perform public._debit_coins_verified(e.requester_id, fee);
    perform public._credit_coins_verified(e.recipient_id, fee);
  end if;

  perform public._swap_owned_card_copies(
    e.requester_id,
    e.recipient_id,
    e.card_id
  );

  update public.card_exchanges
  set status = 'completed',
      price = fee,
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
  if e.status <> 'pending' then
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
          'createdAt', e.created_at
        ) as x
        from public.card_exchanges e
        left join public.profiles p on p.id = e.requester_id
        left join public.paragon_progress rp
          on rp.user_id = e.requester_id and rp.card_id = e.card_id
        left join public.paragon_progress me
          on me.user_id = uid and me.card_id = e.card_id
        where e.recipient_id = uid and e.status = 'pending'
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
          'createdAt', e.created_at
        ) as x
        from public.card_exchanges e
        left join public.profiles p on p.id = e.recipient_id
        left join public.paragon_progress rp
          on rp.user_id = e.recipient_id and rp.card_id = e.card_id
        left join public.paragon_progress me
          on me.user_id = uid and me.card_id = e.card_id
        where e.requester_id = uid and e.status = 'pending'
      ) q
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public._swap_owned_card_copies(uuid, uuid, text) from public;
revoke all on function public.request_exchange(text, text) from public;
revoke all on function public.respond_exchange(uuid, boolean, integer) from public;
revoke all on function public.cancel_exchange(uuid) from public;
revoke all on function public.get_exchange_inbox() from public;

grant execute on function public.request_exchange(text, text) to anon, authenticated;
grant execute on function public.respond_exchange(uuid, boolean, integer) to anon, authenticated;
grant execute on function public.cancel_exchange(uuid) to anon, authenticated;
grant execute on function public.get_exchange_inbox() to anon, authenticated;
