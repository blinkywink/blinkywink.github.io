-- Purchasable profile / collection background art.
-- Safe to re-run.

alter table public.profiles
  add column if not exists bg_unlocked boolean not null default false;

alter table public.profiles
  add column if not exists bg_art_id text;

create or replace function public.set_profile_background(p_bg_id text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_account_id();
  bal integer;
  unlocked boolean;
  current_id text;
  next_id text := lower(trim(coalesce(p_bg_id, '')));
  unlock_cost integer := 40000;
  change_cost integer := 1500;
  allowed text[] := array[
    'monkey-meadow',
    'dark-castle',
    'infernal',
    'frozen-over',
    'enchanted-glade',
    'high-finance',
    'haunted',
    'bloonarius-prime'
  ];
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  if next_id = '' or not (next_id = any (allowed)) then
    raise exception 'Invalid background';
  end if;

  select coins, bg_unlocked, bg_art_id
  into bal, unlocked, current_id
  from public.profiles
  where id = uid
  for update;

  if not found then
    raise exception 'Profile not found';
  end if;

  if unlocked then
    if coalesce(current_id, '') = next_id then
      return bal;
    end if;
    if coalesce(bal, 0) < change_cost then
      raise exception 'Insufficient coins';
    end if;
    update public.profiles
    set coins = coins - change_cost,
        bg_art_id = next_id
    where id = uid
    returning coins into bal;
  else
    if coalesce(bal, 0) < unlock_cost then
      raise exception 'Insufficient coins';
    end if;
    update public.profiles
    set coins = coins - unlock_cost,
        bg_unlocked = true,
        bg_art_id = next_id
    where id = uid
    returning coins into bal;
  end if;

  return bal;
end;
$$;

-- Latest public profile shape (heroes + badges + background)
drop function if exists public.get_profile_by_username(text);

create or replace function public.get_profile_by_username(p_username text)
returns table (
  id uuid,
  username text,
  avatar_card_id text,
  avatar_zoom double precision,
  avatar_x double precision,
  avatar_y double precision,
  showcase_card_ids text[],
  accent_color text,
  owned_hero_ids text[],
  equipped_hero_id text,
  hero_levels jsonb,
  badge_ids text[],
  bg_art_id text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.username,
    p.avatar_card_id,
    p.avatar_zoom,
    p.avatar_x,
    p.avatar_y,
    coalesce(p.showcase_card_ids, '{}'::text[]),
    p.accent_color,
    coalesce(p.owned_hero_ids, '{}'::text[]),
    p.equipped_hero_id,
    coalesce(p.hero_levels, '{}'::jsonb),
    coalesce((
      select array_agg(b.badge_id order by b.granted_at)
      from public.profile_badges b
      where b.user_id = p.id
    ), '{}'::text[]),
    p.bg_art_id
  from public.profiles p
  where lower(p.username) = lower(trim(coalesce(p_username, '')))
  limit 1;
$$;

revoke all on function public.set_profile_background(text) from public;
revoke all on function public.get_profile_by_username(text) from public;
grant execute on function public.set_profile_background(text) to anon, authenticated;
grant execute on function public.get_profile_by_username(text) to anon, authenticated;
