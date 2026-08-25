-- One-time unlock: Auto Pack Open (20 000 Cash).
-- Safe to re-run.

alter table public.profiles
  add column if not exists auto_pack_unlocked boolean not null default false;

create or replace function public.buy_auto_pack_open()
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  uid uuid := public.current_account_id();
  unlocked boolean;
  new_balance integer;
  cost constant integer := 20000;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  select auto_pack_unlocked, coins
    into unlocked, new_balance
  from public.profiles
  where id = uid
  for update;

  if not found then
    raise exception 'Profile not found';
  end if;

  if coalesce(unlocked, false) then
    return new_balance;
  end if;

  if new_balance < cost then
    raise exception 'Insufficient coins';
  end if;

  perform set_config('bloon.allow_coin_update', 'on', true);
  update public.profiles
  set
    coins = coins - cost,
    auto_pack_unlocked = true,
    updated_at = now()
  where id = uid
  returning coins into new_balance;

  return new_balance;
end;
$$;

revoke all on function public.buy_auto_pack_open() from public;
grant execute on function public.buy_auto_pack_open() to anon, authenticated;
