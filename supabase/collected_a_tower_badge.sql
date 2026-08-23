-- Collected a tower badge — permanent once any tower's full set is owned.
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
