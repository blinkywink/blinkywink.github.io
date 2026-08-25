-- Lifetime account stats (synced). Starts at 0 for everyone; no backfill.
-- Safe to re-run.

alter table public.profiles
  add column if not exists account_stats jsonb not null default '{}'::jsonb;

-- Block client writes to account_stats (same gate as coins / free packs).
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

  if new.account_stats is distinct from old.account_stats then
    new.account_stats := old.account_stats;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.normalize_account_stats(raw jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  out jsonb := '{}'::jsonb;
  plays jsonb := '{}'::jsonb;
  key text;
  n integer;
  kn integer;
begin
  if raw is null or jsonb_typeof(raw) <> 'object' then
    return jsonb_build_object(
      'gamesPlayed', 0,
      'gamesWon', 0,
      'packsOpened', 0,
      'packsPurchased', 0,
      'tradesCompleted', 0,
      'exchangesCompleted', 0,
      'gamePlays', '{}'::jsonb
    );
  end if;

  foreach key in array array[
    'gamesPlayed',
    'gamesWon',
    'packsOpened',
    'packsPurchased',
    'tradesCompleted',
    'exchangesCompleted',
    'cardsPulled',
    'paragonsPulled'
  ] loop
    begin
      n := greatest(0, floor(coalesce((raw ->> key)::numeric, 0))::integer);
    exception when others then n := 0;
    end;
    out := out || jsonb_build_object(key, n);
  end loop;

  if jsonb_typeof(raw -> 'gamePlays') = 'object' then
    for key in select jsonb_object_keys(raw -> 'gamePlays') loop
      begin
        kn := greatest(
          0,
          floor(coalesce(((raw -> 'gamePlays') ->> key)::numeric, 0))::integer
        );
      exception when others then
        kn := 0;
      end;
      if kn > 0 and length(key) between 1 and 32 then
        plays := plays || jsonb_build_object(key, kn);
      end if;
    end loop;
  end if;
  out := out || jsonb_build_object('gamePlays', plays);

  return out;
end;
$$;

-- Merge non-negative integer increments into account_stats.
-- p_delta keys: gamesPlayed, gamesWon, packsOpened, packsPurchased,
-- tradesCompleted, exchangesCompleted, and optional gameId for per-game plays.
create or replace function public.bump_account_stats(
  p_delta jsonb default '{}'::jsonb,
  p_game_id text default null
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  uid uuid := public.current_account_id();
  cur jsonb;
  plays jsonb;
  key text;
  add_n integer;
  cur_n integer;
  gid text;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  select coalesce(account_stats, '{}'::jsonb)
    into cur
  from public.profiles
  where id = uid
  for update;

  if not found then
    raise exception 'Profile not found';
  end if;

  cur := public.normalize_account_stats(cur);
  plays := coalesce(cur -> 'gamePlays', '{}'::jsonb);

  foreach key in array array[
    'gamesPlayed',
    'gamesWon',
    'packsOpened',
    'packsPurchased',
    'tradesCompleted',
    'exchangesCompleted',
    'cardsPulled',
    'paragonsPulled'
  ] loop
    begin
      add_n := greatest(0, floor(coalesce((p_delta ->> key)::numeric, 0))::integer);
    exception when others then
      add_n := 0;
    end;
    if add_n > 0 then
      begin
        cur_n := greatest(0, floor(coalesce((cur ->> key)::numeric, 0))::integer);
      exception when others then
        cur_n := 0;
      end;
      -- Cap single bump so a buggy client can't spike one call.
      add_n := least(add_n, 50);
      cur := cur || jsonb_build_object(key, cur_n + add_n);
    end if;
  end loop;

  gid := nullif(trim(coalesce(p_game_id, '')), '');
  if gid is not null and length(gid) <= 32 then
    begin
      add_n := greatest(
        0,
        floor(coalesce((p_delta ->> 'gamesPlayed')::numeric, 1))::integer
      );
    exception when others then
      add_n := 1;
    end;
    add_n := least(greatest(add_n, 1), 5);
    begin
      cur_n := greatest(0, floor(coalesce((plays ->> gid)::numeric, 0))::integer);
    exception when others then
      cur_n := 0;
    end;
    plays := plays || jsonb_build_object(gid, cur_n + add_n);
    cur := cur || jsonb_build_object('gamePlays', plays);
  end if;

  perform set_config('bloon.allow_coin_update', 'on', true);
  update public.profiles
  set
    account_stats = cur,
    updated_at = now()
  where id = uid;

  return cur::json;
end;
$$;

create or replace function public.get_account_stats()
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

  select coalesce(account_stats, '{}'::jsonb)
    into cur
  from public.profiles
  where id = uid;

  if not found then
    raise exception 'Profile not found';
  end if;

  return public.normalize_account_stats(cur)::json;
end;
$$;

revoke all on function public.normalize_account_stats(jsonb) from public;
revoke all on function public.bump_account_stats(jsonb, text) from public;
revoke all on function public.get_account_stats() from public;

grant execute on function public.bump_account_stats(jsonb, text) to anon, authenticated;
grant execute on function public.get_account_stats() to anon, authenticated;
