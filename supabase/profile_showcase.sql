-- Profile showcase: up to 3 owned cards shown on public collection pages.
-- Safe to re-run.

alter table public.profiles
  add column if not exists showcase_card_ids text[] not null default '{}';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_showcase_card_ids_len'
  ) then
    alter table public.profiles
      add constraint profiles_showcase_card_ids_len
      check (coalesce(cardinality(showcase_card_ids), 0) <= 3);
  end if;
end $$;

create or replace function public.set_profile_showcase(p_card_ids text[])
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_account_id();
  cleaned text[] := '{}';
  raw text;
  card text;
  seen text[] := '{}';
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

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

  update public.profiles
  set showcase_card_ids = cleaned,
      updated_at = now()
  where id = uid;

  return true;
end;
$$;

revoke all on function public.set_profile_showcase(text[]) from public;
grant execute on function public.set_profile_showcase(text[]) to anon, authenticated;

drop function if exists public.get_profile_by_username(text);

create or replace function public.get_profile_by_username(p_username text)
returns table (
  id uuid,
  username text,
  avatar_card_id text,
  avatar_zoom real,
  avatar_x real,
  avatar_y real,
  showcase_card_ids text[]
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
    p.showcase_card_ids
  from public.profiles p
  where lower(p.username) = lower(trim(p_username))
  limit 1;
end;
$$;

revoke all on function public.get_profile_by_username(text) from public;
grant execute on function public.get_profile_by_username(text) to anon, authenticated;
