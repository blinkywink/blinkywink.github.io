-- Unsold limited deals rotate after 24 hours. Sold slots still wait 2 hours.
-- Safe to re-run.

create or replace function public._shop_ensure_direct_slots()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s smallint;
  excluded text[];
  pick record;
  listing public.shop_direct_slots%rowtype;
begin
  for s in 1..4 loop
    select * into listing
    from public.shop_direct_slots
    where slot = s
    for update;

    if not found then
      select coalesce(array_agg(card_id) filter (where card_id <> ''), '{}')
        into excluded
      from public.shop_direct_slots;

      select * into pick
      from public._shop_pick_direct_card(excluded);

      insert into public.shop_direct_slots (
        slot, card_id, tier, price, available_at, visual_seed
      )
      values (
        s,
        pick.card_id,
        pick.tier,
        pick.price,
        now(),
        public._new_visual_seed()
      );
      continue;
    end if;

    -- Sold slots restock 2h after purchase. Unsold deals rotate after 24h.
    if (
         ((listing.price = 0 or listing.card_id = '')
          and listing.available_at <= now())
         or (listing.price > 0
             and listing.card_id <> ''
             and listing.available_at <= now() - interval '24 hours')
       ) then
      select coalesce(array_agg(card_id) filter (where card_id <> ''), '{}')
        into excluded
      from public.shop_direct_slots
      where slot <> s;

      select * into pick
      from public._shop_pick_direct_card(excluded);

      update public.shop_direct_slots
      set
        card_id = pick.card_id,
        tier = pick.tier,
        price = pick.price,
        visual_seed = public._new_visual_seed(),
        version = listing.version + 1,
        updated_at = now(),
        available_at = now()
      where slot = s;
    end if;
  end loop;
end;
$$;
