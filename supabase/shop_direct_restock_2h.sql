-- Limited shop deals restock 2 hours after a sale (was 4).
-- Unsold rotation is still 24 hours. Safe to re-run.

create or replace function public.buy_shop_direct_card(
  p_slot integer,
  p_version bigint
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_account_id();
  listing public.shop_direct_slots%rowtype;
  new_balance bigint;
begin
  if uid is null then
    uid := auth.uid();
  end if;
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  if p_slot is null or p_slot < 1 or p_slot > 4 then
    raise exception 'Invalid slot';
  end if;

  perform public._shop_ensure_direct_slots();

  select * into listing
  from public.shop_direct_slots
  where slot = p_slot
  for update;

  if not found then
    raise exception 'Listing not found';
  end if;

  if listing.price <= 0
     or listing.available_at > now() then
    raise exception 'SOLD_OUT' using errcode = 'P0001';
  end if;

  if listing.version is distinct from p_version then
    raise exception 'SOLD_OUT' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.owned_cards
    where user_id = uid and card_id = listing.card_id
  ) then
    raise exception 'ALREADY_OWNED' using errcode = 'P0001';
  end if;

  perform set_config('bloon.allow_coin_update', 'on', true);

  update public.profiles
  set
    coins = coins - listing.price,
    shop_spent = shop_spent + listing.price
  where id = uid
    and coins >= listing.price
  returning coins into new_balance;

  if new_balance is null then
    raise exception 'Insufficient Cash';
  end if;

  insert into public.owned_cards (user_id, card_id, visual_seed)
  values (
    uid,
    listing.card_id,
    coalesce(listing.visual_seed, public._new_visual_seed())
  );

  update public.shop_direct_slots
  set
    price = 0,
    version = listing.version + 1,
    updated_at = now(),
    available_at = now() + interval '2 hours'
  where slot = p_slot;

  return json_build_object(
    'ok', true,
    'boughtCardId', listing.card_id,
    'boughtTier', listing.tier,
    'price', listing.price,
    'coins', new_balance,
    'listings', public.get_shop_direct_listings()
  );
end;
$$;

revoke all on function public.buy_shop_direct_card(integer, bigint) from public;
grant execute on function public.buy_shop_direct_card(integer, bigint) to anon, authenticated;

-- Shorten any sold slots still waiting more than 2 hours.
update public.shop_direct_slots
set available_at = now() + interval '2 hours'
where available_at > now() + interval '2 hours';

notify pgrst, 'reload schema';
notify pgrst, 'reload config';
