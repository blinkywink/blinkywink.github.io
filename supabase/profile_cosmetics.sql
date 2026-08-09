-- Profile cosmetics: custom accent color (25k unlock) + card aura FX (50k unlock).
-- Safe to re-run.

alter table public.profiles
  add column if not exists accent_unlocked boolean not null default false;

alter table public.profiles
  add column if not exists accent_color text;

alter table public.profiles
  add column if not exists aura_unlocked boolean not null default false;

alter table public.profiles
  add column if not exists aura_card_id text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_accent_color_hex'
  ) then
    alter table public.profiles
      add constraint profiles_accent_color_hex
      check (
        accent_color is null
        or accent_color ~ '^#[0-9A-Fa-f]{6}$'
      );
  end if;
end $$;

-- Buy once (25 000), then free color changes.
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
  new_balance integer;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  if color is null or color !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'Invalid color';
  end if;
  color := upper(color);

  select accent_unlocked, coins
    into unlocked, new_balance
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
    update public.profiles
    set
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

-- Buy once (50 000) when first setting an aura; changes free after unlock. Null clears.
create or replace function public.set_profile_aura(p_card_id text)
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  uid uuid := public.current_account_id();
  card text := nullif(trim(coalesce(p_card_id, '')), '');
  unlocked boolean;
  new_balance integer;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  if card is not null then
    if char_length(card) < 3 or char_length(card) > 80 then
      raise exception 'Invalid card';
    end if;
    if not exists (
      select 1 from public.owned_cards
      where user_id = uid and card_id = card
    ) then
      raise exception 'You must own that card';
    end if;
  end if;

  select aura_unlocked, coins
    into unlocked, new_balance
  from public.profiles
  where id = uid
  for update;

  if not found then
    raise exception 'Profile not found';
  end if;

  if card is null then
    update public.profiles
    set
      aura_card_id = null,
      updated_at = now()
    where id = uid
    returning coins into new_balance;
    return new_balance;
  end if;

  if not coalesce(unlocked, false) then
    if new_balance < 50000 then
      raise exception 'Insufficient coins';
    end if;
    perform set_config('bloon.allow_coin_update', 'on', true);
    update public.profiles
    set
      coins = coins - 50000,
      aura_unlocked = true,
      aura_card_id = card,
      updated_at = now()
    where id = uid
    returning coins into new_balance;
  else
    update public.profiles
    set
      aura_card_id = card,
      updated_at = now()
    where id = uid
    returning coins into new_balance;
  end if;

  return new_balance;
end;
$$;

revoke all on function public.set_profile_aura(text) from public;
grant execute on function public.set_profile_aura(text) to anon, authenticated;

drop function if exists public.get_profile_by_username(text);

create or replace function public.get_profile_by_username(p_username text)
returns table (
  id uuid,
  username text,
  avatar_card_id text,
  avatar_zoom real,
  avatar_x real,
  avatar_y real,
  showcase_card_ids text[],
  accent_color text,
  aura_card_id text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_username is null or length(trim(p_username)) < 1 then
    return;
  end if;

  return query
  select
    p.id,
    p.username,
    p.avatar_card_id,
    p.avatar_zoom,
    p.avatar_x,
    p.avatar_y,
    p.showcase_card_ids,
    p.accent_color,
    p.aura_card_id
  from public.profiles p
  where lower(p.username) = lower(trim(p_username))
  limit 1;
end;
$$;

revoke all on function public.get_profile_by_username(text) from public;
grant execute on function public.get_profile_by_username(text) to anon, authenticated;
