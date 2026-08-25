-- Stackable free category pack credits (synced across devices).
-- Safe to re-run.

alter table public.profiles
  add column if not exists free_category_packs jsonb not null default '{}'::jsonb;

-- Keep coin/shop locks and also block client writes to free pack balances.
create or replace function public.protect_profile_coins()
returns trigger
language plpgsql
set search_path = public
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

  if new.shop_spent is distinct from old.shop_spent then
    new.shop_spent := old.shop_spent;
  end if;

  if new.free_category_packs is distinct from old.free_category_packs then
    new.free_category_packs := old.free_category_packs;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.normalize_free_category_packs(raw jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  cats text[] := array['Primary', 'Military', 'Magic', 'Support'];
  cat text;
  n integer;
  out jsonb := '{}'::jsonb;
begin
  foreach cat in array cats loop
    begin
      n := greatest(0, floor(coalesce((raw ->> cat)::numeric, 0))::integer);
    exception when others then
      n := 0;
    end;
    if n > 0 then
      out := out || jsonb_build_object(cat, n);
    end if;
  end loop;
  return out;
end;
$$;

create or replace function public.grant_free_category_pack(p_category text default null)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  uid uuid := public.current_account_id();
  cats text[] := array['Primary', 'Military', 'Magic', 'Support'];
  pick text;
  cur jsonb;
  n integer;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  if p_category is null or length(trim(p_category)) = 0 then
    pick := cats[1 + floor(random() * 4)::integer];
  else
    pick := initcap(lower(trim(p_category)));
    -- Support Title Case for known categories
    if pick = 'Primary' or pick = 'Military' or pick = 'Magic' or pick = 'Support' then
      null;
    else
      raise exception 'Invalid category';
    end if;
  end if;

  select coalesce(free_category_packs, '{}'::jsonb)
    into cur
  from public.profiles
  where id = uid
  for update;

  if not found then
    raise exception 'Profile not found';
  end if;

  cur := public.normalize_free_category_packs(cur);
  begin
    n := greatest(0, floor(coalesce((cur ->> pick)::numeric, 0))::integer);
  exception when others then
    n := 0;
  end;
  cur := cur || jsonb_build_object(pick, n + 1);

  perform set_config('bloon.allow_coin_update', 'on', true);
  update public.profiles
  set
    free_category_packs = cur,
    updated_at = now()
  where id = uid;

  return json_build_object(
    'category', pick,
    'counts', cur
  );
end;
$$;

create or replace function public.consume_free_category_pack(p_category text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  uid uuid := public.current_account_id();
  pick text;
  cur jsonb;
  n integer;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  pick := initcap(lower(trim(coalesce(p_category, ''))));
  if pick is distinct from 'Primary'
     and pick is distinct from 'Military'
     and pick is distinct from 'Magic'
     and pick is distinct from 'Support' then
    raise exception 'Invalid category';
  end if;

  select coalesce(free_category_packs, '{}'::jsonb)
    into cur
  from public.profiles
  where id = uid
  for update;

  if not found then
    raise exception 'Profile not found';
  end if;

  cur := public.normalize_free_category_packs(cur);
  begin
    n := greatest(0, floor(coalesce((cur ->> pick)::numeric, 0))::integer);
  exception when others then
    n := 0;
  end;

  if n < 1 then
    raise exception 'NO_FREE_PACK';
  end if;

  if n - 1 <= 0 then
    cur := cur - pick;
  else
    cur := cur || jsonb_build_object(pick, n - 1);
  end if;

  perform set_config('bloon.allow_coin_update', 'on', true);
  update public.profiles
  set
    free_category_packs = cur,
    updated_at = now()
  where id = uid;

  return json_build_object('counts', cur);
end;
$$;

create or replace function public.get_free_category_packs()
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  uid uuid := public.current_account_id();
  cur jsonb;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  select coalesce(free_category_packs, '{}'::jsonb)
    into cur
  from public.profiles
  where id = uid;

  if not found then
    raise exception 'Profile not found';
  end if;

  return public.normalize_free_category_packs(cur)::json;
end;
$$;

revoke all on function public.normalize_free_category_packs(jsonb) from public;
revoke all on function public.grant_free_category_pack(text) from public;
revoke all on function public.consume_free_category_pack(text) from public;
revoke all on function public.get_free_category_packs() from public;

grant execute on function public.grant_free_category_pack(text) to anon, authenticated;
grant execute on function public.consume_free_category_pack(text) to anon, authenticated;
grant execute on function public.get_free_category_packs() to anon, authenticated;
