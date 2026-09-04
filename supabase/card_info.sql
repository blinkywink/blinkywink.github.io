-- Card info: circulation counts + scrap-from-inventory (no Cash).
-- Safe to re-run.

create or replace function public.get_card_circulation(p_card_id text)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  cleaned text := trim(coalesce(p_card_id, ''));
  held integer;
  listed integer;
begin
  if char_length(cleaned) < 3 or char_length(cleaned) > 80 then
    return 0;
  end if;

  select count(*)::integer into held
  from public.owned_cards
  where card_id = cleaned;

  select count(*)::integer into listed
  from public.marketplace_listings
  where card_id = cleaned and status = 'active';

  return held + listed;
end;
$$;

revoke all on function public.get_card_circulation(text) from public;
grant execute on function public.get_card_circulation(text) to anon, authenticated;

create or replace function public.scrap_card(p_card_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_account_id();
  cleaned text := trim(coalesce(p_card_id, ''));
  in_trade boolean;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;
  if char_length(cleaned) < 3 or char_length(cleaned) > 80 then
    raise exception 'Invalid card';
  end if;

  select exists (
    select 1
    from public.trade_offers o
    join public.trades t on t.id = o.trade_id
    where o.owner_id = uid
      and o.card_id = cleaned
      and t.status in ('pending', 'active')
  ) into in_trade;
  if in_trade then
    raise exception 'This card is in a trade';
  end if;

  delete from public.owned_cards
  where user_id = uid and card_id = cleaned;
  if not found then
    raise exception 'You do not own this card';
  end if;

  if cleaned like '%-paragon' then
    delete from public.paragon_progress
    where user_id = uid and card_id = cleaned;
  end if;

  update public.profiles
  set
    avatar_card_id = case
      when avatar_card_id = cleaned then null
      else avatar_card_id
    end,
    aura_card_id = case
      when aura_card_id = cleaned then null
      else aura_card_id
    end,
    showcase_card_ids = array_remove(
      coalesce(showcase_card_ids, '{}'::text[]),
      cleaned
    )
  where id = uid;

  return true;
end;
$$;

revoke all on function public.scrap_card(text) from public;
grant execute on function public.scrap_card(text) to anon, authenticated;

notify pgrst, 'reload schema';
notify pgrst, 'reload config';
