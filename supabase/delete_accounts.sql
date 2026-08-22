-- Delete specific accounts by username (and all gameplay data).
-- Usage: select public.delete_accounts_by_username(array['123','1234']);

create or replace function public.delete_accounts_by_username(p_usernames text[])
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  ids uuid[];
  unames text[];
begin
  select array_agg(a.id), array_agg(a.username)
  into ids, unames
  from public.accounts a
  where lower(a.username) = any(
    select lower(trim(x)) from unnest(coalesce(p_usernames, '{}')) as t(x)
  );

  if ids is null or coalesce(array_length(ids, 1), 0) = 0 then
    return json_build_object('deleted', '[]'::json, 'message', 'No matching accounts');
  end if;

  delete from public.marketplace_offers o
  using public.marketplace_listings l
  where o.listing_id = l.id and l.seller_id = any(ids);

  delete from public.marketplace_offers where buyer_id = any(ids);
  delete from public.marketplace_sale_notices
  where seller_id = any(ids) or buyer_id = any(ids);
  delete from public.marketplace_listings where seller_id = any(ids);

  delete from public.trade_offers
  where trade_id in (
    select id from public.trades
    where requester_id = any(ids) or recipient_id = any(ids)
  );
  delete from public.trades
  where requester_id = any(ids) or recipient_id = any(ids);

  delete from public.card_exchanges
  where requester_id = any(ids) or recipient_id = any(ids);

  delete from public.owned_cards where user_id = any(ids);
  delete from public.paragon_progress where user_id = any(ids);
  delete from public.game_high_scores where user_id = any(ids);
  delete from public.bloonhero_favorites where user_id = any(ids);
  delete from public.bloonhero_recent_plays where user_id = any(ids);
  delete from public.profile_badges where user_id = any(ids);
  delete from public.app_sessions where user_id = any(ids);
  delete from public.profiles where id = any(ids);
  delete from public.accounts where id = any(ids);

  return json_build_object('deleted', to_json(unames));
end;
$$;

revoke all on function public.delete_accounts_by_username(text[]) from public;
grant execute on function public.delete_accounts_by_username(text[]) to service_role;
