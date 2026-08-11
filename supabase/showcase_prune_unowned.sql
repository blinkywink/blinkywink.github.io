-- Drop showcase cards the player no longer owns (sold, traded, listed).
-- Safe to re-run.

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
    updated_at = now()
  where id = old.user_id
    and old.card_id = any (coalesce(showcase_card_ids, '{}'));
  return old;
end;
$$;

drop trigger if exists owned_cards_prune_showcase on public.owned_cards;
create trigger owned_cards_prune_showcase
  after delete on public.owned_cards
  for each row
  execute function public.prune_unowned_showcase();

-- Clean existing rows that still show cards the player sold or traded away.
update public.profiles p
set
  showcase_card_ids = coalesce((
    select array_agg(x order by ordinality)
    from unnest(coalesce(p.showcase_card_ids, '{}'))
      with ordinality as t(x, ordinality)
    where exists (
      select 1
      from public.owned_cards o
      where o.user_id = p.id and o.card_id = t.x
    )
  ), '{}'),
  updated_at = now()
where exists (
  select 1
  from unnest(coalesce(p.showcase_card_ids, '{}')) as x
  where not exists (
    select 1
    from public.owned_cards o
    where o.user_id = p.id and o.card_id = x
  )
);

-- Public profile reads also hide unowned showcase cards.
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
    ), '{}'::text[])
  from public.profiles p
  where lower(p.username) = lower(trim(p_username))
  limit 1;
end;
$$;

revoke all on function public.get_profile_by_username(text) from public;
grant execute on function public.get_profile_by_username(text) to anon, authenticated;
