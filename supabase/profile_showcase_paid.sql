-- Paid showcase slots (5k each, max 3) + 500 to set/change a showcase card.
-- Profile color changes also cost 500 after unlock.
-- Safe to re-run.

alter table public.profiles
  add column if not exists showcase_slots integer not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_showcase_slots_range'
  ) then
    alter table public.profiles
      add constraint profiles_showcase_slots_range
      check (showcase_slots >= 0 and showcase_slots <= 3);
  end if;
end $$;

-- Existing filled showcases keep those slots so nobody loses them.
update public.profiles
set showcase_slots = least(
  3,
  greatest(
    showcase_slots,
    coalesce(cardinality(showcase_card_ids), 0)
  )
)
where coalesce(cardinality(showcase_card_ids), 0) > showcase_slots;

create or replace function public.buy_showcase_slot()
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  uid uuid := public.current_account_id();
  slots integer;
  new_balance integer;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  select showcase_slots, coins
    into slots, new_balance
  from public.profiles
  where id = uid
  for update;

  if not found then
    raise exception 'Profile not found';
  end if;

  if coalesce(slots, 0) >= 3 then
    raise exception 'All showcase slots unlocked';
  end if;

  if new_balance < 5000 then
    raise exception 'Insufficient coins';
  end if;

  perform set_config('bloon.allow_coin_update', 'on', true);
  update public.profiles
  set
    coins = coins - 5000,
    showcase_slots = showcase_slots + 1,
    updated_at = now()
  where id = uid
  returning coins into new_balance;

  return new_balance;
end;
$$;

revoke all on function public.buy_showcase_slot() from public;
grant execute on function public.buy_showcase_slot() to anon, authenticated;

drop function if exists public.set_profile_showcase(text[]);

-- Replace showcase list. Removals free; any new card id costs 500.
create or replace function public.set_profile_showcase(p_card_ids text[])
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  uid uuid := public.current_account_id();
  cleaned text[] := '{}';
  old_ids text[] := '{}';
  slots integer;
  raw text;
  card text;
  seen text[] := '{}';
  needs_pay boolean := false;
  new_balance integer;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  select showcase_card_ids, showcase_slots, coins
    into old_ids, slots, new_balance
  from public.profiles
  where id = uid
  for update;

  if not found then
    raise exception 'Profile not found';
  end if;

  old_ids := coalesce(old_ids, '{}');
  slots := coalesce(slots, 0);

  if p_card_ids is not null then
    foreach raw in array p_card_ids
    loop
      card := nullif(trim(coalesce(raw, '')), '');
      if card is null then
        continue;
      end if;
      if char_length(card) < 3 or char_length(card) > 80 then
        raise exception 'Invalid card';
      end if;
      if card = any(seen) then
        continue;
      end if;
      if not exists (
        select 1 from public.owned_cards
        where user_id = uid and card_id = card
      ) then
        raise exception 'You must own each showcase card';
      end if;
      seen := array_append(seen, card);
      cleaned := array_append(cleaned, card);
      if cardinality(cleaned) >= 3 then
        exit;
      end if;
    end loop;
  end if;

  if cardinality(cleaned) > slots then
    raise exception 'Need more showcase slots';
  end if;

  -- Pay when introducing any card id that was not already shown.
  if cleaned is distinct from old_ids then
    select exists (
      select 1
      from unnest(cleaned) as n(id)
      where not (n.id = any (old_ids))
    ) into needs_pay;
  end if;

  if needs_pay then
    if new_balance < 500 then
      raise exception 'Insufficient coins';
    end if;
    perform set_config('bloon.allow_coin_update', 'on', true);
    update public.profiles
    set
      coins = coins - 500,
      showcase_card_ids = cleaned,
      updated_at = now()
    where id = uid
    returning coins into new_balance;
  else
    update public.profiles
    set
      showcase_card_ids = cleaned,
      updated_at = now()
    where id = uid
    returning coins into new_balance;
  end if;

  return new_balance;
end;
$$;

revoke all on function public.set_profile_showcase(text[]) from public;
grant execute on function public.set_profile_showcase(text[]) to anon, authenticated;

-- Unlock 25k (includes first color). Later color changes cost 500.
create or replace function public.set_profile_accent(p_color text)
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  uid uuid := public.current_account_id();
  color text := nullif(trim(coalesce(p_color, '')), '');
  unlocked boolean;
  prev_color text;
  new_balance integer;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  if color is null or color !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'Invalid color';
  end if;
  color := upper(color);

  select accent_unlocked, accent_color, coins
    into unlocked, prev_color, new_balance
  from public.profiles
  where id = uid
  for update;

  if not found then
    raise exception 'Profile not found';
  end if;

  if not coalesce(unlocked, false) then
    if new_balance < 25000 then
      raise exception 'Insufficient coins';
    end if;
    perform set_config('bloon.allow_coin_update', 'on', true);
    update public.profiles
    set
      coins = coins - 25000,
      accent_unlocked = true,
      accent_color = color,
      updated_at = now()
    where id = uid
    returning coins into new_balance;
  else
    if upper(coalesce(prev_color, '')) = color then
      return new_balance;
    end if;
    if new_balance < 500 then
      raise exception 'Insufficient coins';
    end if;
    perform set_config('bloon.allow_coin_update', 'on', true);
    update public.profiles
    set
      coins = coins - 500,
      accent_color = color,
      updated_at = now()
    where id = uid
    returning coins into new_balance;
  end if;

  return new_balance;
end;
$$;

revoke all on function public.set_profile_accent(text) from public;
grant execute on function public.set_profile_accent(text) to anon, authenticated;
