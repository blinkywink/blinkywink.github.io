-- Cash balances can exceed 32-bit integer (~2.1B).
-- Safe to re-run.

alter table public.profiles
  alter column coins type bigint using coins::bigint;

alter table public.profiles
  alter column coins_earned type bigint using coins_earned::bigint;

-- Daily Cash claim - returns bigint balance.
create or replace function public.claim_daily_cash()
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  uid uuid := public.current_account_id();
  today date := (timezone('utc', now()))::date;
  last_claim date;
  amount integer := 500;
  new_balance bigint;
begin
  if uid is null then
    uid := auth.uid();
  end if;
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  select last_daily_claim into last_claim
  from public.profiles
  where id = uid
  for update;

  if not found then
    raise exception 'Profile not found';
  end if;

  if last_claim is not null and last_claim = today then
    raise exception 'ALREADY_CLAIMED' using errcode = 'P0001';
  end if;

  perform set_config('bloon.allow_coin_update', 'on', true);

  update public.profiles
  set
    coins = coins + amount,
    coins_earned = coalesce(coins_earned, 0) + amount,
    last_daily_claim = today
  where id = uid
  returning coins into new_balance;

  return json_build_object(
    'amount', amount,
    'coins', new_balance,
    'last_daily_claim', today
  );
end;
$$;

revoke all on function public.claim_daily_cash() from public;
grant execute on function public.claim_daily_cash() to anon, authenticated;

-- Prefer the rate-limited award_coins (same signature, bigint return).
drop function if exists public.award_coins(integer);

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
    coins_earned = coalesce(coins_earned, 0) + p_amount
  where id = uid
  returning coins into new_balance;

  if new_balance is null then
    raise exception 'Profile not found';
  end if;

  return new_balance;
end;
$$;

revoke all on function public.award_coins(integer) from public;
grant execute on function public.award_coins(integer) to anon, authenticated;

-- Game dailies also assign into integer locals - bump those too.
create or replace function public.claim_blowfree_daily()
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  uid uuid := public.current_account_id();
  today date := (timezone('utc', now()))::date;
  last_claim date;
  amount integer := 2800;
  new_balance bigint;
begin
  if uid is null then
    uid := auth.uid();
  end if;
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  select last_blowfree_day, coins into last_claim, new_balance
  from public.profiles
  where id = uid
  for update;

  if not found then
    raise exception 'Profile not found';
  end if;

  if last_claim is not null and last_claim = today then
    return json_build_object(
      'already', true,
      'amount', 0,
      'coins', new_balance,
      'last_blowfree_day', today
    );
  end if;

  perform set_config('bloon.allow_coin_update', 'on', true);

  update public.profiles
  set
    coins = coins + amount,
    coins_earned = coalesce(coins_earned, 0) + amount,
    last_blowfree_day = today
  where id = uid
  returning coins into new_balance;

  return json_build_object(
    'already', false,
    'amount', amount,
    'coins', new_balance,
    'last_blowfree_day', today
  );
end;
$$;

revoke all on function public.claim_blowfree_daily() from public;
grant execute on function public.claim_blowfree_daily() to anon, authenticated;

create or replace function public.claim_bloonle_daily(p_guess_count integer)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  uid uuid := public.current_account_id();
  today date := (timezone('utc', now()))::date;
  last_claim date;
  guesses integer;
  amount integer;
  new_balance bigint;
begin
  if uid is null then
    uid := auth.uid();
  end if;
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  guesses := greatest(1, least(6, coalesce(p_guess_count, 6)));
  amount := least(
    3000,
    round(
      3000 * case
        when guesses <= 1 then 1.00
        when guesses = 2 then 0.85
        when guesses = 3 then 0.70
        else 0.55
      end
    )::numeric
  )::integer;

  select last_bloonle_day, coins into last_claim, new_balance
  from public.profiles
  where id = uid
  for update;

  if not found then
    raise exception 'Profile not found';
  end if;

  if last_claim is not null and last_claim = today then
    return json_build_object(
      'already', true,
      'amount', 0,
      'coins', new_balance,
      'last_bloonle_day', today
    );
  end if;

  perform set_config('bloon.allow_coin_update', 'on', true);

  update public.profiles
  set
    coins = coins + amount,
    coins_earned = coalesce(coins_earned, 0) + amount,
    last_bloonle_day = today
  where id = uid
  returning coins into new_balance;

  return json_build_object(
    'already', false,
    'amount', amount,
    'coins', new_balance,
    'last_bloonle_day', today
  );
end;
$$;

revoke all on function public.claim_bloonle_daily(integer) from public;
grant execute on function public.claim_bloonle_daily(integer) to anon, authenticated;
