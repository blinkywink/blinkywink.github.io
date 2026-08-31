-- Defense in depth for the self-hosted API. Safe to re-run after a restore.

-- No Supabase Auth schema here. Session identity is x-bloon-session.
create schema if not exists auth;
grant usage on schema auth to anon, authenticated, authenticator;

create or replace function public.current_account_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid;
  tok text;
  headers json;
begin
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
grant execute on function public.current_account_id() to anon, authenticated, authenticator;

-- Leftover RPCs still call auth.uid(); point it at the same session helper.
create or replace function auth.uid()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select public.current_account_id();
$$;

revoke all on function auth.uid() from public;
grant execute on function auth.uid() to anon, authenticated, authenticator;

create table if not exists public.auth_throttle (
  key text primary key,
  window_start timestamptz not null default now(),
  hits integer not null default 0
);

alter table public.auth_throttle enable row level security;
alter table public.auth_throttle force row level security;
drop policy if exists auth_throttle_no_client on public.auth_throttle;
create policy auth_throttle_no_client
  on public.auth_throttle for all using (false) with check (false);

revoke all on table public.auth_throttle from public, anon, authenticated;

create or replace function public.client_ip()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  headers json;
  forwarded text;
begin
  begin
    headers := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    headers := null;
  end;
  if headers is null then
    return 'unknown';
  end if;
  forwarded := split_part(coalesce(headers->>'x-forwarded-for', ''), ',', 1);
  forwarded := nullif(btrim(forwarded), '');
  return coalesce(
    nullif(headers->>'cf-connecting-ip', ''),
    forwarded,
    nullif(headers->>'x-real-ip', ''),
    'unknown'
  );
end;
$$;

revoke all on function public.client_ip() from public, anon, authenticated;

create or replace function public.enforce_auth_throttle(p_kind text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  ip text := public.client_ip();
  bucket text := p_kind || ':' || ip;
  win interval := case when p_kind = 'signup' then interval '1 hour' else interval '15 minutes' end;
  max_hits integer := case when p_kind = 'signup' then 8 else 30 end;
  rec public.auth_throttle%rowtype;
begin
  insert into public.auth_throttle (key, window_start, hits)
  values (bucket, now(), 0)
  on conflict (key) do nothing;

  select * into rec from public.auth_throttle where key = bucket for update;

  if rec.window_start + win < now() then
    update public.auth_throttle
    set window_start = now(), hits = 1
    where key = bucket;
    return;
  end if;

  if rec.hits >= max_hits then
    raise exception 'TOO_MANY_ATTEMPTS' using errcode = 'P0001';
  end if;

  update public.auth_throttle set hits = hits + 1 where key = bucket;
end;
$$;

revoke all on function public.enforce_auth_throttle(text) from public, anon, authenticated;

create or replace function public.pgrst_pre_request()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  path text := coalesce(current_setting('request.path', true), '');
begin
  if path ilike '%username_signup%' then
    perform public.enforce_auth_throttle('signup');
  elsif path ilike '%username_signin%' then
    perform public.enforce_auth_throttle('signin');
  end if;
end;
$$;

revoke all on function public.pgrst_pre_request() from public;
grant execute on function public.pgrst_pre_request() to anon, authenticated, authenticator;

-- Password hashes and session tokens must never be queryable.
alter table public.accounts force row level security;
alter table public.app_sessions force row level security;
drop policy if exists accounts_no_client on public.accounts;
create policy accounts_no_client on public.accounts for all using (false) with check (false);
drop policy if exists app_sessions_no_client on public.app_sessions;
create policy app_sessions_no_client on public.app_sessions for all using (false) with check (false);

revoke all on table public.accounts from public, anon, authenticated;
revoke all on table public.app_sessions from public, anon, authenticated;
revoke all on table public.reward_buckets from public, anon, authenticated;
revoke all on table public._schema_patches from public, anon, authenticated;
revoke all on table public.auth_throttle from public, anon, authenticated;

-- Clients must not PATCH coins / call internal helpers.
revoke update, insert, delete, truncate on all tables in schema public from anon, authenticated;
grant select on all tables in schema public to anon, authenticated;
revoke select on table public.accounts from anon, authenticated;
revoke select on table public.app_sessions from anon, authenticated;
revoke select on table public.reward_buckets from anon, authenticated;
revoke select on table public._schema_patches from anon, authenticated;
revoke select on table public.auth_throttle from anon, authenticated;

-- Re-issue function grants: RPCs only, never _internal or admin reset tools.
revoke all on all functions in schema public from public, anon, authenticated;
do $$
declare
  r record;
begin
  for r in
    select p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and p.proname not like '\_%' escape '\'
      and p.proname not in (
        'delete_accounts_by_username',
        'reset_all_accounts_to_fresh',
        'preview_reset_all_accounts',
        'handle_new_user',
        'protect_profile_coins',
        'client_ip',
        'enforce_auth_throttle'
      )
  loop
    execute format(
      'grant execute on function public.%I(%s) to anon, authenticated',
      r.proname,
      r.args
    );
  end loop;
end
$$;

notify pgrst, 'reload schema';
notify pgrst, 'reload config';
