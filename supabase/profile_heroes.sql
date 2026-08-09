-- Heroes: ownership, equip, levels, clear progress. Safe to re-run.

alter table public.profiles
  add column if not exists owned_hero_ids text[] not null default '{}';

alter table public.profiles
  add column if not exists equipped_hero_id text;

alter table public.profiles
  add column if not exists hero_levels jsonb not null default '{}'::jsonb;

alter table public.profiles
  add column if not exists hero_clear_progress jsonb not null default '{}'::jsonb;

-- Unlock = 5000; level-ups ~30% cheaper. Keep in sync with heroUpgradeCost().
create or replace function public.hero_upgrade_cost(p_to_level integer)
returns integer
language sql
immutable
as $$
  select case
    when greatest(1, least(20, coalesce(p_to_level, 1))) <= 1 then 5000
    else greatest(
      2500,
      (
        round(
          (5000 * power(1.118::numeric, greatest(1, least(20, p_to_level)) - 1) * 0.7)
          / 250.0
        ) * 250
      )::integer
    )
  end;
$$;

-- Clears needed at current level before buying +1. Keep in sync with client.
create or replace function public.hero_clears_required(p_cur_level integer)
returns integer
language sql
immutable
as $$
  select 10 + 2 * (greatest(1, least(19, coalesce(p_cur_level, 1))) - 1);
$$;

create or replace function public.buy_hero(p_hero_id text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  uid uuid := public.current_account_id();
  hid text := lower(trim(coalesce(p_hero_id, '')));
  owned text[];
  levels jsonb;
  clears jsonb;
  new_balance integer;
  cur_level integer;
  next_level integer;
  price integer;
  progress integer;
  needed integer;
  allowed text[] := array[
    'quincy','gwendolin','obyn-greenfoot',
    'benjamin','ezili','sauda','psi','silas'
  ];
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;
  if hid = '' or not (hid = any(allowed)) then
    raise exception 'Invalid hero';
  end if;

  select owned_hero_ids, hero_levels, hero_clear_progress, coins
    into owned, levels, clears, new_balance
  from public.profiles
  where id = uid
  for update;

  if not found then
    raise exception 'Profile not found';
  end if;

  if hid = any(coalesce(owned, '{}')) then
    cur_level := greatest(
      1,
      least(20, coalesce((levels ->> hid)::integer, 1))
    );
    if cur_level >= 20 then
      raise exception 'Hero max level';
    end if;
    next_level := cur_level + 1;
    needed := public.hero_clears_required(cur_level);
    progress := greatest(0, coalesce((clears ->> hid)::integer, 0));
    if progress < needed then
      raise exception 'Not enough clears';
    end if;
    price := public.hero_upgrade_cost(next_level);

    if new_balance < price then
      raise exception 'Insufficient coins';
    end if;

    perform set_config('bloon.allow_coin_update', 'on', true);
    update public.profiles
    set
      coins = coins - price,
      hero_levels = coalesce(hero_levels, '{}'::jsonb) || jsonb_build_object(hid, next_level),
      hero_clear_progress = coalesce(hero_clear_progress, '{}'::jsonb) || jsonb_build_object(hid, 0),
      updated_at = now()
    where id = uid
    returning coins, owned_hero_ids, hero_levels, hero_clear_progress
      into new_balance, owned, levels, clears;
  else
    price := public.hero_upgrade_cost(1);

    if new_balance < price then
      raise exception 'Insufficient coins';
    end if;

    perform set_config('bloon.allow_coin_update', 'on', true);
    update public.profiles
    set
      coins = coins - price,
      owned_hero_ids = array_append(coalesce(owned_hero_ids, '{}'), hid),
      hero_levels = coalesce(hero_levels, '{}'::jsonb) || jsonb_build_object(hid, 1),
      hero_clear_progress = coalesce(hero_clear_progress, '{}'::jsonb) || jsonb_build_object(hid, 0),
      -- Equip only if this is the player's first hero.
      equipped_hero_id = case
        when coalesce(cardinality(owned), 0) = 0 then hid
        else equipped_hero_id
      end,
      updated_at = now()
    where id = uid
    returning coins, owned_hero_ids, hero_levels, hero_clear_progress
      into new_balance, owned, levels, clears;
  end if;

  return json_build_object(
    'coins', new_balance,
    'owned_hero_ids', owned,
    'hero_levels', levels,
    'hero_clear_progress', clears,
    'equipped_hero_id', (
      select equipped_hero_id from public.profiles where id = uid
    )
  );
end;
$$;

-- Credit one clear toward equipped hero's next level unlock.
create or replace function public.record_hero_clear()
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  uid uuid := public.current_account_id();
  hid text;
  owned text[];
  levels jsonb;
  clears jsonb;
  cur_level integer;
  needed integer;
  progress integer;
  next_progress integer;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  select equipped_hero_id, owned_hero_ids, hero_levels, hero_clear_progress
    into hid, owned, levels, clears
  from public.profiles
  where id = uid
  for update;

  if not found then
    raise exception 'Profile not found';
  end if;

  if hid is null or hid = '' or not (hid = any(coalesce(owned, '{}'))) then
    return json_build_object(
      'hero_id', null,
      'progress', 0,
      'required', 0,
      'ready', false,
      'hero_clear_progress', coalesce(clears, '{}'::jsonb)
    );
  end if;

  cur_level := greatest(
    1,
    least(20, coalesce((levels ->> hid)::integer, 1))
  );
  if cur_level >= 20 then
    return json_build_object(
      'hero_id', hid,
      'progress', 0,
      'required', 0,
      'ready', false,
      'hero_clear_progress', coalesce(clears, '{}'::jsonb)
    );
  end if;

  needed := public.hero_clears_required(cur_level);
  progress := greatest(0, coalesce((clears ->> hid)::integer, 0));
  next_progress := least(needed, progress + 1);

  update public.profiles
  set
    hero_clear_progress = coalesce(hero_clear_progress, '{}'::jsonb)
      || jsonb_build_object(hid, next_progress),
    updated_at = now()
  where id = uid
  returning hero_clear_progress into clears;

  return json_build_object(
    'hero_id', hid,
    'progress', next_progress,
    'required', needed,
    'ready', next_progress >= needed,
    'hero_clear_progress', clears
  );
end;
$$;

revoke all on function public.hero_upgrade_cost(integer) from public;
grant execute on function public.hero_upgrade_cost(integer) to anon, authenticated;

revoke all on function public.hero_clears_required(integer) from public;
grant execute on function public.hero_clears_required(integer) to anon, authenticated;

revoke all on function public.buy_hero(text) from public;
grant execute on function public.buy_hero(text) to anon, authenticated;

revoke all on function public.record_hero_clear() from public;
grant execute on function public.record_hero_clear() to anon, authenticated;

-- Equip owned hero. Unequip (null) free. Swap costs 1,000 Cash.
create or replace function public.equip_hero(p_hero_id text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  uid uuid := public.current_account_id();
  hid text;
  owned text[];
  current_equip text;
  new_balance integer;
  needs_pay boolean := false;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  if p_hero_id is null or trim(p_hero_id) = '' then
    hid := null;
  else
    hid := lower(trim(p_hero_id));
  end if;

  select owned_hero_ids, equipped_hero_id, coins
    into owned, current_equip, new_balance
  from public.profiles
  where id = uid
  for update;

  if not found then
    raise exception 'Profile not found';
  end if;

  if hid is not null and not (hid = any(coalesce(owned, '{}'))) then
    raise exception 'Hero not owned';
  end if;

  if hid is not distinct from current_equip then
    return json_build_object(
      'coins', new_balance,
      'equipped_hero_id', current_equip
    );
  end if;

  -- First equip or unequip is free; swapping from one hero to another costs 1k.
  if current_equip is not null and hid is not null and hid is distinct from current_equip then
    needs_pay := true;
  end if;

  if needs_pay then
    if new_balance < 1000 then
      raise exception 'Insufficient coins';
    end if;
    perform set_config('bloon.allow_coin_update', 'on', true);
    update public.profiles
    set
      coins = coins - 1000,
      equipped_hero_id = hid,
      updated_at = now()
    where id = uid
    returning coins into new_balance;
  else
    update public.profiles
    set
      equipped_hero_id = hid,
      updated_at = now()
    where id = uid;
  end if;

  return json_build_object(
    'coins', new_balance,
    'equipped_hero_id', hid
  );
end;
$$;

revoke all on function public.equip_hero(text) from public;
grant execute on function public.equip_hero(text) to anon, authenticated;

drop function if exists public.get_profile_by_username(text);

create or replace function public.get_profile_by_username(p_username text)
returns table (
  id uuid,
  username text,
  avatar_card_id text,
  avatar_zoom real,
  avatar_x real,
  avatar_y real,
  showcase_card_ids text[],
  accent_color text,
  aura_card_id text,
  owned_hero_ids text[],
  equipped_hero_id text,
  hero_levels jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_username is null or length(trim(p_username)) < 1 then
    return;
  end if;

  return query
  select
    p.id,
    p.username,
    p.avatar_card_id,
    p.avatar_zoom,
    p.avatar_x,
    p.avatar_y,
    p.showcase_card_ids,
    p.accent_color,
    p.aura_card_id,
    p.owned_hero_ids,
    p.equipped_hero_id,
    p.hero_levels
  from public.profiles p
  where lower(p.username) = lower(trim(p_username))
  limit 1;
end;
$$;

revoke all on function public.get_profile_by_username(text) from public;
grant execute on function public.get_profile_by_username(text) to anon, authenticated;

-- Gut retired shop heroes: strip ownership / equip / levels.
do $$
declare
  retired text[] := array[
    'captain-churchill','pat-fusty','adora','admiral-brickell','geraldo',
    'striker-jones','etienne'
  ];
begin
  update public.profiles
  set
    equipped_hero_id = case
      when equipped_hero_id = any(retired) then null
      else equipped_hero_id
    end,
    owned_hero_ids = coalesce((
      select array_agg(x order by ord)
      from unnest(owned_hero_ids) with ordinality as t(x, ord)
      where not (x = any(retired))
    ), '{}'),
    hero_levels = coalesce((
      select jsonb_object_agg(key, value)
      from jsonb_each(coalesce(hero_levels, '{}'::jsonb))
      where not (key = any(retired))
    ), '{}'::jsonb),
    hero_clear_progress = coalesce((
      select jsonb_object_agg(key, value)
      from jsonb_each(coalesce(hero_clear_progress, '{}'::jsonb))
      where not (key = any(retired))
    ), '{}'::jsonb),
    updated_at = now()
  where
    equipped_hero_id = any(retired)
    or owned_hero_ids && retired
    or hero_levels ?| retired
    or hero_clear_progress ?| retired;
end;
$$;
