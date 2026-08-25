-- Public read of another player's account stats.
-- Safe to re-run.

create or replace function public.get_public_account_stats(p_username text)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  row record;
begin
  if p_username is null or length(trim(p_username)) < 1 then
    return null;
  end if;

  select
    p.account_stats,
    p.coins_earned,
    p.shop_spent,
    p.owned_hero_ids
  into row
  from public.profiles p
  where lower(p.username) = lower(trim(p_username))
  limit 1;

  if not found then
    return null;
  end if;

  return json_build_object(
    'accountStats', public.normalize_account_stats(coalesce(row.account_stats, '{}'::jsonb)),
    'coinsEarned', coalesce(row.coins_earned, 0),
    'shopSpent', coalesce(row.shop_spent, 0),
    'ownedHeroIds', coalesce(row.owned_hero_ids, '{}'::text[])
  );
end;
$$;

revoke all on function public.get_public_account_stats(text) from public;
grant execute on function public.get_public_account_stats(text) to anon, authenticated;
