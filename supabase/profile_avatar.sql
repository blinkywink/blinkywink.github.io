-- Profile picture from an owned card (crop/zoom focal point)
-- Safe to re-run

alter table public.profiles
  add column if not exists avatar_card_id text,
  add column if not exists avatar_zoom real not null default 1.35,
  add column if not exists avatar_x real not null default 0.5,
  add column if not exists avatar_y real not null default 0.42;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_avatar_card_id_len'
  ) then
    alter table public.profiles
      add constraint profiles_avatar_card_id_len
      check (
        avatar_card_id is null
        or char_length(avatar_card_id) between 3 and 80
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_avatar_zoom_ok'
  ) then
    alter table public.profiles
      add constraint profiles_avatar_zoom_ok
      check (avatar_zoom between 1 and 4);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_avatar_x_ok'
  ) then
    alter table public.profiles
      add constraint profiles_avatar_x_ok
      check (avatar_x between 0 and 1);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_avatar_y_ok'
  ) then
    alter table public.profiles
      add constraint profiles_avatar_y_ok
      check (avatar_y between 0 and 1);
  end if;
end $$;

create or replace function public.set_profile_avatar(
  p_card_id text,
  p_zoom real,
  p_x real,
  p_y real
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_account_id();
  cleaned text;
  z real;
  fx real;
  fy real;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  cleaned := nullif(trim(coalesce(p_card_id, '')), '');

  if cleaned is null then
    update public.profiles
    set avatar_card_id = null,
        avatar_zoom = 1.35,
        avatar_x = 0.5,
        avatar_y = 0.42,
        updated_at = now()
    where id = uid;
    return true;
  end if;

  if char_length(cleaned) < 3 or char_length(cleaned) > 80 then
    raise exception 'Invalid card';
  end if;

  if not exists (
    select 1 from public.owned_cards
    where user_id = uid and card_id = cleaned
  ) then
    raise exception 'You must own the card to use it as a profile picture';
  end if;

  z := least(4::real, greatest(1::real, coalesce(p_zoom, 1.35)));
  fx := least(1::real, greatest(0::real, coalesce(p_x, 0.5)));
  fy := least(1::real, greatest(0::real, coalesce(p_y, 0.42)));

  update public.profiles
  set avatar_card_id = cleaned,
      avatar_zoom = z,
      avatar_x = fx,
      avatar_y = fy,
      updated_at = now()
  where id = uid;

  return true;
end;
$$;

revoke all on function public.set_profile_avatar(text, real, real, real) from public;
grant execute on function public.set_profile_avatar(text, real, real, real) to anon, authenticated;

drop function if exists public.get_profile_by_username(text);

create or replace function public.get_profile_by_username(p_username text)
returns table (
  id uuid,
  username text,
  avatar_card_id text,
  avatar_zoom real,
  avatar_x real,
  avatar_y real
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
    p.avatar_y
  from public.profiles p
  where lower(p.username) = lower(trim(p_username))
  limit 1;
end;
$$;

revoke all on function public.get_profile_by_username(text) from public;
grant execute on function public.get_profile_by_username(text) to anon, authenticated;
