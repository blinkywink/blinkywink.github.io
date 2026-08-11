-- Grant Early Supporter to the first playtesters. Safe to re-run.

insert into public.profile_badges (user_id, badge_id)
select p.id, 'early_supporter'
from public.profiles p
where lower(p.username) in (
  lower('blinky'),
  lower('Beastman6090l'),
  lower('swift574'),
  lower('sharkninja0731'),
  lower('arit')
)
on conflict (user_id, badge_id) do nothing;
