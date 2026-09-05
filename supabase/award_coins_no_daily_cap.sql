-- Drop daily / per-minute Cash caps on award_coins. Per-call max stays 10_000.
-- Server-side only — no app update. Safe to re-run.

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
  -- Per-call sanity bound only (Bloon Hero / merge chunks). No daily/minute cap.
  max_per_call constant integer := 10000;
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

revoke all on function public.award_coins(integer) from public;
grant execute on function public.award_coins(integer) to anon, authenticated;
