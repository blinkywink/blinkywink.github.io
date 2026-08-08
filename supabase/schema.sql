-- Run this once in Supabase → SQL Editor → New query

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null,
  coins integer not null default 0 check (coins >= 0),
  monkey_money integer not null default 0 check (monkey_money >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_len check (
    char_length(username) between 3 and 24
  ),
  constraint profiles_username_format check (
    username ~ '^[a-zA-Z0-9_]+$'
  )
);

create unique index if not exists profiles_username_lower_idx
  on public.profiles (lower(username));

alter table public.profiles enable row level security;

drop policy if exists "Profiles are viewable by everyone" on public.profiles;
create policy "Profiles are viewable by everyone"
  on public.profiles
  for select
  using (true);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Auto-create a profile when someone signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base_name text;
  candidate text;
  suffix int := 0;
begin
  base_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'username'), ''),
    split_part(coalesce(new.email, 'player'), '@', 1)
  );
  base_name := regexp_replace(base_name, '[^a-zA-Z0-9_]', '', 'g');
  if char_length(base_name) < 3 then
    base_name := 'player';
  end if;
  base_name := left(base_name, 20);

  candidate := base_name;
  while exists (
    select 1 from public.profiles where lower(username) = lower(candidate)
  ) loop
    suffix := suffix + 1;
    candidate := left(base_name, 20 - char_length(suffix::text)) || suffix::text;
  end loop;

  insert into public.profiles (id, username)
  values (new.id, candidate);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Clients must never be able to edit their own coin balance
create or replace function public.protect_profile_coins()
returns trigger
language plpgsql
as $$
begin
  if new.coins is distinct from old.coins then
    new.coins := old.coins;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists protect_profile_coins on public.profiles;
create trigger protect_profile_coins
  before update on public.profiles
  for each row execute function public.protect_profile_coins();
