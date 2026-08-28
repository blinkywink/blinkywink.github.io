-- Profile badges (Early Supporter, Cursed Holo, etc).
-- Clients can read. Early Supporter is SQL-only; Cursed Holo via award_cursed_holo_badge().
-- Safe to re-run.
--
-- Grant Early Supporter later:
--   insert into public.profile_badges (user_id, badge_id)
--   select id, 'early_supporter' from public.profiles
--   where lower(username) = lower('USERNAME');

create table if not exists public.profile_badges (
  user_id uuid not null references public.profiles (id) on delete cascade,
  badge_id text not null,
  granted_at timestamptz not null default now(),
  primary key (user_id, badge_id)
);

alter table public.profile_badges
  drop constraint if exists profile_badges_known;

alter table public.profile_badges
  add constraint profile_badges_known
  check (
    badge_id in (
      'early_supporter',
      'cursed_holo',
      'collected_every_card',
      'collected_a_tower',
      'level_20_hero',
      'degree_100_paragon',
      'owns_a_paragon',
      'owns_all_paragons',
      'owns_all_heroes'
    )
  );

alter table public.profile_badges enable row level security;

drop policy if exists "Badges are viewable by everyone" on public.profile_badges;
create policy "Badges are viewable by everyone"
  on public.profile_badges
  for select
  using (true);

revoke all on table public.profile_badges from public, anon, authenticated;
grant select on table public.profile_badges to anon, authenticated, service_role;
grant all on table public.profile_badges to service_role;

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
  badge_ids text[]
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
    p.hero_levels,
    coalesce((
      select array_agg(b.badge_id order by b.granted_at)
      from public.profile_badges b
      where b.user_id = p.id
    ), '{}'::text[])
  from public.profiles p
  where lower(p.username) = lower(trim(p_username))
  limit 1;
end;
$$;

revoke all on function public.get_profile_by_username(text) from public;
grant execute on function public.get_profile_by_username(text) to anon, authenticated;

create or replace function public.award_cursed_holo_badge()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_account_id();
  inserted boolean := false;
begin
  if uid is null then
    return false;
  end if;

  insert into public.profile_badges (user_id, badge_id)
  values (uid, 'cursed_holo')
  on conflict (user_id, badge_id) do nothing;

  get diagnostics inserted = row_count;
  return inserted;
end;
$$;

revoke all on function public.award_cursed_holo_badge() from public;
grant execute on function public.award_cursed_holo_badge() to anon, authenticated;

create or replace function public.award_collected_every_card_badge()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_account_id();
  inserted boolean := false;
begin
  if uid is null then
    return false;
  end if;

  insert into public.profile_badges (user_id, badge_id)
  values (uid, 'collected_every_card')
  on conflict (user_id, badge_id) do nothing;

  get diagnostics inserted = row_count;
  return inserted;
end;
$$;

revoke all on function public.award_collected_every_card_badge() from public;
grant execute on function public.award_collected_every_card_badge() to anon, authenticated;

create or replace function public.award_collected_a_tower_badge()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_account_id();
  inserted boolean := false;
begin
  if uid is null then
    return false;
  end if;

  insert into public.profile_badges (user_id, badge_id)
  values (uid, 'collected_a_tower')
  on conflict (user_id, badge_id) do nothing;

  get diagnostics inserted = row_count;
  return inserted;
end;
$$;

revoke all on function public.award_collected_a_tower_badge() from public;
grant execute on function public.award_collected_a_tower_badge() to anon, authenticated;


create or replace function public.award_level_20_hero_badge()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_account_id();
  inserted boolean := false;
begin
  if uid is null then
    return false;
  end if;

  insert into public.profile_badges (user_id, badge_id)
  values (uid, 'level_20_hero')
  on conflict (user_id, badge_id) do nothing;

  get diagnostics inserted = row_count;
  return inserted;
end;
$$;

revoke all on function public.award_level_20_hero_badge() from public;
grant execute on function public.award_level_20_hero_badge() to anon, authenticated;


create or replace function public.award_degree_100_paragon_badge()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_account_id();
  inserted boolean := false;
begin
  if uid is null then
    return false;
  end if;

  insert into public.profile_badges (user_id, badge_id)
  values (uid, 'degree_100_paragon')
  on conflict (user_id, badge_id) do nothing;

  get diagnostics inserted = row_count;
  return inserted;
end;
$$;

revoke all on function public.award_degree_100_paragon_badge() from public;
grant execute on function public.award_degree_100_paragon_badge() to anon, authenticated;


create or replace function public.award_owns_a_paragon_badge()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_account_id();
  inserted boolean := false;
begin
  if uid is null then
    return false;
  end if;

  insert into public.profile_badges (user_id, badge_id)
  values (uid, 'owns_a_paragon')
  on conflict (user_id, badge_id) do nothing;

  get diagnostics inserted = row_count;
  return inserted;
end;
$$;

revoke all on function public.award_owns_a_paragon_badge() from public;
grant execute on function public.award_owns_a_paragon_badge() to anon, authenticated;


create or replace function public._required_paragon_card_ids()
returns text[]
language sql
immutable
as $$
  select array[
    'dart-monkey-paragon',
    'boomerang-monkey-paragon',
    'bomb-shooter-paragon',
    'tack-shooter-paragon',
    'ice-monkey-paragon',
    'monkey-sub-paragon',
    'monkey-buccaneer-paragon',
    'monkey-ace-paragon',
    'wizard-monkey-paragon',
    'ninja-monkey-paragon',
    'druid-paragon',
    'spike-factory-paragon',
    'engineer-monkey-paragon'
  ]::text[];
$$;

create or replace function public._owns_all_paragons(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select count(distinct oc.card_id)
      from public.owned_cards oc
      where oc.user_id = p_user_id
        and oc.card_id = any (public._required_paragon_card_ids())
    ),
    0
  ) >= coalesce(array_length(public._required_paragon_card_ids(), 1), 0);
$$;


create or replace function public.award_owns_all_paragons_badge()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_account_id();
  inserted boolean := false;
begin
  if uid is null then
    return false;
  end if;

  if not public._owns_all_paragons(uid) then
    return false;
  end if;

  insert into public.profile_badges (user_id, badge_id)
  values (uid, 'owns_all_paragons')
  on conflict (user_id, badge_id) do nothing;

  get diagnostics inserted = row_count;
  return inserted;
end;
$$;

revoke all on function public.award_owns_all_paragons_badge() from public;
grant execute on function public.award_owns_all_paragons_badge() to anon, authenticated;


create or replace function public.award_owns_all_heroes_badge()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_account_id();
  inserted boolean := false;
begin
  if uid is null then
    return false;
  end if;

  insert into public.profile_badges (user_id, badge_id)
  values (uid, 'owns_all_heroes')
  on conflict (user_id, badge_id) do nothing;

  get diagnostics inserted = row_count;
  return inserted;
end;
$$;

revoke all on function public.award_owns_all_heroes_badge() from public;
grant execute on function public.award_owns_all_heroes_badge() to anon, authenticated;
