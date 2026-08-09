-- Lifetime Cash earned (never decreases when spending).
-- Safe to re-run.

alter table public.profiles
  add column if not exists coins_earned integer not null default 0
  check (coins_earned >= 0);

-- Best-effort backfill: at least what they currently hold
update public.profiles
set coins_earned = greatest(coins_earned, coins)
where coins_earned < coins;

create or replace function public.protect_profile_coins()
returns trigger
language plpgsql
as $$
begin
  if current_setting('bloon.allow_coin_update', true) = 'on' then
    new.updated_at := now();
    return new;
  end if;

  if new.coins is distinct from old.coins then
    new.coins := old.coins;
  end if;

  if new.monkey_money is distinct from old.monkey_money then
    new.monkey_money := old.monkey_money;
  end if;

  if new.coins_earned is distinct from old.coins_earned then
    new.coins_earned := old.coins_earned;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.award_coins(p_amount integer)
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  uid uuid := public.current_account_id();
  new_balance integer;
begin
  if uid is null then
    -- fallback for legacy JWT auth if present
    uid := auth.uid();
  end if;

  if uid is null then raise exception 'Not authenticated'; end if;
  if p_amount is null or p_amount < 1 or p_amount > 10000 then
    raise exception 'Invalid coin amount';
  end if;

  perform set_config('bloon.allow_coin_update', 'on', true);

  update public.profiles
  set
    coins = coins + p_amount,
    coins_earned = coins_earned + p_amount
  where id = uid
  returning coins into new_balance;

  if new_balance is null then raise exception 'Profile not found'; end if;
  return new_balance;
end;
$$;

revoke all on function public.award_coins(integer) from public;
grant execute on function public.award_coins(integer) to anon, authenticated;
