-- Owns all paragons badge - permanent once every tower paragon is owned.
-- Safe to re-run.

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

revoke all on function public._required_paragon_card_ids() from public;
revoke all on function public._owns_all_paragons(uuid) from public;
revoke all on function public.award_owns_all_paragons_badge() from public;
grant execute on function public.award_owns_all_paragons_badge() to anon, authenticated;
