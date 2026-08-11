-- Manual-only profile badges (Early Supporter, etc).
-- Clients can read. Nobody can grant via the app — only SQL as postgres/service_role.
-- Safe to re-run.
--
-- Grant later:
--   insert into public.profile_badges (user_id, badge_id)
--   select id, 'early_supporter' from public.profiles
--   where lower(username) = lower('USERNAME');

create table if not exists public.profile_badges (
  user_id uuid not null references public.profiles (id) on delete cascade,
  badge_id text not null,
  granted_at timestamptz not null default now(),
  primary key (user_id, badge_id),
  constraint profile_badges_known check (badge_id in ('early_supporter'))
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
