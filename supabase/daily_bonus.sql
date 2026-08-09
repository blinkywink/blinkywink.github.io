-- Signup starting Cash + daily claim.
-- Safe to re-run.

alter table public.profiles
  add column if not exists last_daily_claim date;

-- New accounts start with 5,000 Cash (counts toward lifetime earned).
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
  start_cash integer := 5000;
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
  values (new_id, uname, start_cash, start_cash, 0);

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

revoke all on function public.username_signup(text, text) from public;
grant execute on function public.username_signup(text, text) to anon, authenticated;

-- Claim 500 Cash once per UTC calendar day.
create or replace function public.claim_daily_cash()
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  uid uuid := public.current_account_id();
  today date := (timezone('utc', now()))::date;
  last_claim date;
  amount integer := 500;
  new_balance integer;
begin
  if uid is null then
    uid := auth.uid();
  end if;
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  select last_daily_claim into last_claim
  from public.profiles
  where id = uid
  for update;

  if not found then
    raise exception 'Profile not found';
  end if;

  if last_claim is not null and last_claim = today then
    raise exception 'ALREADY_CLAIMED' using errcode = 'P0001';
  end if;

  perform set_config('bloon.allow_coin_update', 'on', true);

  update public.profiles
  set
    coins = coins + amount,
    coins_earned = coins_earned + amount,
    last_daily_claim = today
  where id = uid
  returning coins into new_balance;

  return json_build_object(
    'amount', amount,
    'coins', new_balance,
    'last_daily_claim', today
  );
end;
$$;

revoke all on function public.claim_daily_cash() from public;
grant execute on function public.claim_daily_cash() to anon, authenticated;
