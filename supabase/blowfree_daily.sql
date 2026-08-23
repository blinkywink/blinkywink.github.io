-- Blow Free daily Cash: once per UTC day, per account. Safe to re-run.

alter table public.profiles
  add column if not exists last_blowfree_day date;

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
  new_balance integer;
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
