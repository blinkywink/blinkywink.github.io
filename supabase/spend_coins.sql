-- Spend Cash (pack shop, etc.) - session auth via current_account_id().
-- Safe to re-run.

create or replace function public.spend_coins(p_amount integer)
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
    raise exception 'Not authenticated';
  end if;

  if p_amount is null or p_amount < 1 or p_amount > 100000 then
    raise exception 'Invalid coin amount';
  end if;

  perform set_config('bloon.allow_coin_update', 'on', true);

  update public.profiles
  set coins = coins - p_amount
  where id = uid
    and coins >= p_amount
  returning coins into new_balance;

  if new_balance is null then
    raise exception 'Insufficient coins';
  end if;

  return new_balance;
end;
$$;

revoke all on function public.spend_coins(integer) from public;
grant execute on function public.spend_coins(integer) to anon, authenticated;
