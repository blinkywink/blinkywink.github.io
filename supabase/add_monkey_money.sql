-- Add Monkey Money as a second account currency (safe to re-run)

alter table public.profiles
  add column if not exists monkey_money integer not null default 0
  check (monkey_money >= 0);

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

  new.updated_at := now();
  return new;
end;
$$;
