-- Username/password auth via DB sessions (no email, no Edge Function).
-- Safe to re-run.

create extension if not exists pgcrypto;

alter table public.profiles drop constraint if exists profiles_id_fkey;

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  password_hash text not null,
  created_at timestamptz not null default now(),
  constraint accounts_username_len check (char_length(username) between 3 and 24),
  constraint accounts_username_format check (username ~ '^[a-zA-Z0-9_]+$')
);

create unique index if not exists accounts_username_lower_idx
  on public.accounts (lower(username));

alter table public.accounts enable row level security;

create table if not exists public.app_sessions (
  token text primary key,
  user_id uuid not null references public.accounts (id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists app_sessions_user_id_idx on public.app_sessions (user_id);
alter table public.app_sessions enable row level security;

-- Cards without auth.users FK
create table if not exists public.owned_cards (
  user_id uuid not null,
  card_id text not null,
  obtained_at timestamptz not null default now(),
  primary key (user_id, card_id),
  constraint owned_cards_card_id_len check (char_length(card_id) between 3 and 80)
);

do $$
begin
  alter table public.owned_cards drop constraint if exists owned_cards_user_id_fkey;
exception when undefined_table then
  null;
end $$;

create index if not exists owned_cards_user_id_idx on public.owned_cards (user_id);
alter table public.owned_cards enable row level security;

drop trigger if exists on_auth_user_created on auth.users;

create or replace function public.current_account_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  uid uuid;
  tok text;
  headers json;
begin
  uid := auth.uid();
  if uid is not null then
    return uid;
  end if;

  begin
    headers := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    headers := null;
  end;

  if headers is null then
    return null;
  end if;

  tok := nullif(headers->>'x-bloon-session', '');
  if tok is null then
    return null;
  end if;

  select s.user_id into uid
  from public.app_sessions s
  where s.token = tok and s.expires_at > now();

  return uid;
end;
$$;

revoke all on function public.current_account_id() from public;
grant execute on function public.current_account_id() to anon, authenticated;

create or replace function public.username_signup(p_username text, p_password text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  uname text;
  new_id uuid;
  tok text;
  exp timestamptz;
begin
  uname := trim(p_username);
  if uname !~ '^[a-zA-Z0-9_]{3,24}$' then
    raise exception 'INVALID_USERNAME' using errcode = 'P0001';
  end if;
  if p_password is null or char_length(p_password) < 6 or char_length(p_password) > 128 then
    raise exception 'INVALID_PASSWORD' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.accounts where lower(username) = lower(uname)) then
    raise exception 'USERNAME_TAKEN' using errcode = 'P0001';
  end if;

  new_id := gen_random_uuid();
  insert into public.accounts (id, username, password_hash)
  values (new_id, uname, crypt(p_password, gen_salt('bf')));

  insert into public.profiles (id, username, coins, coins_earned, monkey_money)
  values (new_id, uname, 5000, 5000, 0);

  tok := encode(gen_random_bytes(32), 'hex');
  exp := now() + interval '30 days';
  insert into public.app_sessions (token, user_id, expires_at)
  values (tok, new_id, exp);

  return json_build_object(
    'access_token', tok,
    'user_id', new_id,
    'username', uname,
    'expires_at', floor(extract(epoch from exp))
  );
end;
$$;

create or replace function public.username_signin(p_username text, p_password text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  acc public.accounts%rowtype;
  tok text;
  exp timestamptz;
begin
  select * into acc
  from public.accounts
  where lower(username) = lower(trim(p_username))
  limit 1;

  if not found or acc.password_hash <> crypt(p_password, acc.password_hash) then
    raise exception 'BAD_CREDENTIALS' using errcode = 'P0001';
  end if;

  tok := encode(gen_random_bytes(32), 'hex');
  exp := now() + interval '30 days';
  insert into public.app_sessions (token, user_id, expires_at)
  values (tok, acc.id, exp);

  return json_build_object(
    'access_token', tok,
    'user_id', acc.id,
    'username', acc.username,
    'expires_at', floor(extract(epoch from exp))
  );
end;
$$;

revoke all on function public.username_signup(text, text) from public;
revoke all on function public.username_signin(text, text) from public;
grant execute on function public.username_signup(text, text) to anon, authenticated;
grant execute on function public.username_signin(text, text) to anon, authenticated;

create or replace function public.award_coins(p_amount integer)
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  uid uuid := public.current_account_id();
  new_balance integer;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  if p_amount is null or p_amount < 1 or p_amount > 10000 then
    raise exception 'Invalid coin amount';
  end if;
  perform set_config('bloon.allow_coin_update', 'on', true);
  update public.profiles
  set
    coins = coins + p_amount,
    coins_earned = coins_earned + p_amount
  where id = uid
  returning coins into new_balance;
  if new_balance is null then raise exception 'Profile not found'; end if;
  return new_balance;
end;
$$;

create or replace function public.spend_coins(p_amount integer)
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  uid uuid := public.current_account_id();
  new_balance integer;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  if p_amount is null or p_amount < 1 or p_amount > 100000 then
    raise exception 'Invalid coin amount';
  end if;
  perform set_config('bloon.allow_coin_update', 'on', true);
  update public.profiles
  set coins = coins - p_amount
  where id = uid and coins >= p_amount
  returning coins into new_balance;
  if new_balance is null then raise exception 'Insufficient coins'; end if;
  return new_balance;
end;
$$;

create or replace function public.award_cards(p_card_ids text[])
returns text[]
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  uid uuid := public.current_account_id();
  added text[];
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  if p_card_ids is null or coalesce(array_length(p_card_ids, 1), 0) = 0 then
    return '{}';
  end if;
  if coalesce(array_length(p_card_ids, 1), 0) > 40 then
    raise exception 'Too many cards in one award';
  end if;

  with cleaned as (
    select distinct trim(x) as card_id
    from unnest(p_card_ids) as t(x)
    where char_length(trim(x)) between 3 and 80
  ),
  inserted as (
    insert into public.owned_cards (user_id, card_id)
    select uid, c.card_id from cleaned c
    on conflict (user_id, card_id) do nothing
    returning card_id
  )
  select coalesce(array_agg(card_id), '{}') into added from inserted;

  return added;
end;
$$;

revoke all on function public.award_coins(integer) from public;
revoke all on function public.spend_coins(integer) from public;
revoke all on function public.award_cards(text[]) from public;
grant execute on function public.award_coins(integer) to anon, authenticated;
grant execute on function public.spend_coins(integer) to anon, authenticated;
grant execute on function public.award_cards(text[]) to anon, authenticated;

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update
  using (id = public.current_account_id())
  with check (id = public.current_account_id());

drop policy if exists "Users can read own cards" on public.owned_cards;
create policy "Users can read own cards"
  on public.owned_cards for select
  using (user_id = public.current_account_id());
