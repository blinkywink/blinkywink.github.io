-- Snapshot the PFP copy's visual seed / paragon degree onto profiles
-- so leaderboard + other players' avatars match the card they picked.
-- Safe to re-run.

alter table public.profiles
  add column if not exists avatar_visual_seed bigint;

alter table public.profiles
  add column if not exists avatar_paragon_degree integer;

update public.profiles p
set
  avatar_visual_seed = oc.visual_seed,
  avatar_paragon_degree = case
    when p.avatar_card_id like '%-paragon' then coalesce(pp.degree, 1)
    else null
  end
from public.owned_cards oc
left join public.paragon_progress pp
  on pp.user_id = oc.user_id
 and pp.card_id = oc.card_id
where oc.user_id = p.id
  and oc.card_id = p.avatar_card_id
  and p.avatar_card_id is not null;

create or replace function public.set_profile_avatar(
  p_card_id text,
  p_zoom real,
  p_x real,
  p_y real
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_account_id();
  cleaned text;
  z real;
  fx real;
  fy real;
  v_seed bigint;
  v_degree integer;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  cleaned := nullif(trim(coalesce(p_card_id, '')), '');

  if cleaned is null then
    update public.profiles
    set avatar_card_id = null,
        avatar_zoom = 1.35,
        avatar_x = 0.5,
        avatar_y = 0.42,
        avatar_visual_seed = null,
        avatar_paragon_degree = null,
        updated_at = now()
    where id = uid;
    return true;
  end if;

  if char_length(cleaned) < 3 or char_length(cleaned) > 80 then
    raise exception 'Invalid card';
  end if;

  select oc.visual_seed,
         case
           when cleaned like '%-paragon' then coalesce(pp.degree, 1)
           else null
         end
    into v_seed, v_degree
  from public.owned_cards oc
  left join public.paragon_progress pp
    on pp.user_id = oc.user_id
   and pp.card_id = oc.card_id
  where oc.user_id = uid
    and oc.card_id = cleaned;

  if not found then
    raise exception 'You must own the card to use it as a profile picture';
  end if;

  z := least(4::real, greatest(1::real, coalesce(p_zoom, 1.35)));
  fx := least(1::real, greatest(0::real, coalesce(p_x, 0.5)));
  fy := least(1::real, greatest(0::real, coalesce(p_y, 0.42)));

  update public.profiles
  set avatar_card_id = cleaned,
      avatar_zoom = z,
      avatar_x = fx,
      avatar_y = fy,
      avatar_visual_seed = v_seed,
      avatar_paragon_degree = v_degree,
      updated_at = now()
  where id = uid;

  return true;
end;
$$;

revoke all on function public.set_profile_avatar(text, real, real, real) from public;
grant execute on function public.set_profile_avatar(text, real, real, real) to anon, authenticated;

create or replace function public.prune_unowned_showcase()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set
    showcase_card_ids = coalesce((
      select array_agg(x order by ordinality)
      from unnest(coalesce(showcase_card_ids, '{}'))
        with ordinality as t(x, ordinality)
      where t.x is distinct from old.card_id
    ), '{}'),
    avatar_visual_seed = case
      when avatar_card_id is not distinct from old.card_id then null
      else avatar_visual_seed
    end,
    avatar_paragon_degree = case
      when avatar_card_id is not distinct from old.card_id then null
      else avatar_paragon_degree
    end,
    avatar_card_id = case
      when avatar_card_id is not distinct from old.card_id then null
      else avatar_card_id
    end,
    updated_at = now()
  where id = old.user_id
    and (
      old.card_id = any (coalesce(showcase_card_ids, '{}'))
      or avatar_card_id is not distinct from old.card_id
    );
  return old;
end;
$$;

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
  hero_levels jsonb,
  badge_ids text[],
  avatar_visual_seed bigint,
  avatar_paragon_degree integer
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
    coalesce((
      select array_agg(x order by ordinality)
      from unnest(coalesce(p.showcase_card_ids, '{}'))
        with ordinality as t(x, ordinality)
      where exists (
        select 1
        from public.owned_cards o
        where o.user_id = p.id and o.card_id = t.x
      )
    ), '{}'::text[]),
    p.accent_color,
    p.aura_card_id,
    p.owned_hero_ids,
    p.equipped_hero_id,
    p.hero_levels,
    coalesce((
      select array_agg(b.badge_id order by b.granted_at)
      from public.profile_badges b
      where b.user_id = p.id
    ), '{}'::text[]),
    p.avatar_visual_seed,
    p.avatar_paragon_degree
  from public.profiles p
  where lower(p.username) = lower(trim(p_username))
  limit 1;
end;
$$;

revoke all on function public.get_profile_by_username(text) from public;
grant execute on function public.get_profile_by_username(text) to anon, authenticated;

create or replace function public.scrap_card(p_card_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_account_id();
  cleaned text := trim(coalesce(p_card_id, ''));
  in_trade boolean;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;
  if char_length(cleaned) < 3 or char_length(cleaned) > 80 then
    raise exception 'Invalid card';
  end if;

  select exists (
    select 1
    from public.trade_offers o
    join public.trades t on t.id = o.trade_id
    where o.owner_id = uid
      and o.card_id = cleaned
      and t.status in ('pending', 'active')
  ) into in_trade;
  if in_trade then
    raise exception 'This card is in a trade';
  end if;

  delete from public.owned_cards
  where user_id = uid and card_id = cleaned;
  if not found then
    raise exception 'You do not own this card';
  end if;

  if cleaned like '%-paragon' then
    delete from public.paragon_progress
    where user_id = uid and card_id = cleaned;
  end if;

  update public.profiles
  set
    avatar_visual_seed = case
      when avatar_card_id = cleaned then null
      else avatar_visual_seed
    end,
    avatar_paragon_degree = case
      when avatar_card_id = cleaned then null
      else avatar_paragon_degree
    end,
    avatar_card_id = case
      when avatar_card_id = cleaned then null
      else avatar_card_id
    end,
    aura_card_id = case
      when aura_card_id = cleaned then null
      else aura_card_id
    end,
    showcase_card_ids = array_remove(
      coalesce(showcase_card_ids, '{}'::text[]),
      cleaned
    )
  where id = uid;

  return true;
end;
$$;

revoke all on function public.scrap_card(text) from public;
grant execute on function public.scrap_card(text) to anon, authenticated;

notify pgrst, 'reload schema';
notify pgrst, 'reload config';
