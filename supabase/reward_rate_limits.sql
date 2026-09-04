-- Rate-limit client-callable award_coins / award_cards (anti-devtools mint).
-- Keeps the same RPC signatures so the web/desktop clients need no changes.
-- Safe to re-run.

create table if not exists public.reward_buckets (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  coin_day date not null default ((timezone('utc', now()))::date),
  coins_today integer not null default 0 check (coins_today >= 0),
  card_day date not null default ((timezone('utc', now()))::date),
  cards_today integer not null default 0 check (cards_today >= 0),
  coin_window_start timestamptz not null default now(),
  coins_in_window integer not null default 0 check (coins_in_window >= 0),
  card_window_start timestamptz not null default now(),
  cards_in_window integer not null default 0 check (cards_in_window >= 0)
);

alter table public.reward_buckets enable row level security;

drop policy if exists reward_buckets_no_client on public.reward_buckets;
-- No client policies: only security definer RPCs touch this table.
create policy reward_buckets_no_client
  on public.reward_buckets
  for all
  using (false)
  with check (false);

revoke all on table public.reward_buckets from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant all on table public.reward_buckets to service_role';
  end if;
end $$;

-- Generous enough for heavy play + guest merge chunks; stops unlimited minting.
-- Per-call coin max stays 10_000 (Bloon Hero / merge chunks).
create or replace function public.award_coins(p_amount integer)
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  uid uuid := public.current_account_id();
  new_balance bigint;
  today date := (timezone('utc', now()))::date;
  b public.reward_buckets%rowtype;
  -- Caps (tune here only)
  max_per_call constant integer := 10000;
  max_per_minute constant integer := 120000;
  max_per_day constant integer := 1000000;
begin
  if uid is null then
    uid := auth.uid();
  end if;
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  if p_amount is null or p_amount < 1 or p_amount > max_per_call then
    raise exception 'Invalid coin amount';
  end if;

  insert into public.reward_buckets (user_id)
    values (uid)
  on conflict (user_id) do nothing;

  select * into b from public.reward_buckets where user_id = uid for update;

  if b.coin_day is distinct from today then
    b.coin_day := today;
    b.coins_today := 0;
  end if;

  if b.coin_window_start < now() - interval '60 seconds' then
    b.coin_window_start := now();
    b.coins_in_window := 0;
  end if;

  if b.coins_in_window + p_amount > max_per_minute then
    raise exception 'Cash earn rate limit - try again in a minute';
  end if;

  if b.coins_today + p_amount > max_per_day then
    raise exception 'Daily Cash earn limit reached';
  end if;

  update public.reward_buckets
  set
    coin_day = b.coin_day,
    coins_today = b.coins_today + p_amount,
    coin_window_start = b.coin_window_start,
    coins_in_window = b.coins_in_window + p_amount
  where user_id = uid;

  perform set_config('bloon.allow_coin_update', 'on', true);

  update public.profiles
  set
    coins = coins + p_amount,
    coins_earned = coins_earned + p_amount
  where id = uid
  returning coins into new_balance;

  if new_balance is null then
    raise exception 'Profile not found';
  end if;

  return new_balance;
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
  today date := (timezone('utc', now()))::date;
  b public.reward_buckets%rowtype;
  want integer;
  -- Caps. Pack grinding can unlock hundreds of unique cards in a day;
  -- this is only a brake on scripted minting, not normal play.
  max_per_call constant integer := 40;
  max_per_minute constant integer := 400;
  max_per_day constant integer := 10000;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  if p_card_ids is null or coalesce(array_length(p_card_ids, 1), 0) = 0 then
    return '{}';
  end if;

  want := coalesce(array_length(p_card_ids, 1), 0);
  if want > max_per_call then
    raise exception 'Too many cards in one award';
  end if;

  insert into public.reward_buckets (user_id)
  values (uid)
  on conflict (user_id) do nothing;

  select * into b from public.reward_buckets where user_id = uid for update;

  if b.card_day is distinct from today then
    b.card_day := today;
    b.cards_today := 0;
  end if;

  if b.card_window_start < now() - interval '60 seconds' then
    b.card_window_start := now();
    b.cards_in_window := 0;
  end if;

  if b.cards_in_window + want > max_per_minute then
    raise exception 'Card earn rate limit - try again in a minute';
  end if;

  if b.cards_today + want > max_per_day then
    raise exception 'Daily card earn limit reached';
  end if;

  with cleaned as (
    select distinct trim(x) as card_id
    from unnest(p_card_ids) as t(x)
    where char_length(trim(x)) between 3 and 80
  ),
  inserted as (
    insert into public.owned_cards (user_id, card_id)
    select uid, c.card_id
    from cleaned c
    where not exists (
      select 1
      from public.marketplace_listings ml
      where ml.seller_id = uid
        and ml.card_id = c.card_id
        and ml.status = 'active'
    )
    on conflict (user_id, card_id) do nothing
    returning card_id
  )
  select coalesce(array_agg(card_id), '{}') into added from inserted;

  -- Count requested batch size (not only newly inserted) so spam still hits the cap.
  update public.reward_buckets
  set
    card_day = b.card_day,
    cards_today = b.cards_today + want,
    card_window_start = b.card_window_start,
    cards_in_window = b.cards_in_window + want
  where user_id = uid;

  insert into public.paragon_progress (user_id, card_id, degree, xp)
  select uid, x, 1, 0
  from unnest(added) as x
  where x like '%-paragon'
  on conflict (user_id, card_id) do nothing;

  return added;
end;
$$;

revoke all on function public.award_coins(integer) from public;
revoke all on function public.award_cards(text[]) from public;
grant execute on function public.award_coins(integer) to anon, authenticated;
grant execute on function public.award_cards(text[]) to anon, authenticated;
