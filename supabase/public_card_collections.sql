-- Public collection browsing (leaderboard → view another player's cards)
-- Run in Supabase → SQL Editor (safe to re-run)

create or replace function public.get_player_cards(p_user_id uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_user_id is null then
    return '{}';
  end if;

  return coalesce(
    (
      select array_agg(card_id order by obtained_at asc)
      from public.owned_cards
      where user_id = p_user_id
    ),
    '{}'
  );
end;
$$;

revoke all on function public.get_player_cards(uuid) from public;
grant execute on function public.get_player_cards(uuid) to anon, authenticated;
