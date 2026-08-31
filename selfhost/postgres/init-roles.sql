-- Roles PostgREST expects. Safe to re-run on a blank volume only
-- (docker entrypoint runs this once). Restore the live dump after this.

create extension if not exists pgcrypto;

do $$ begin
  create role anon nologin noinherit;
exception when duplicate_object then null;
end $$;

do $$ begin
  create role authenticated nologin noinherit;
exception when duplicate_object then null;
end $$;

do $$ begin
  create role authenticator noinherit login password 'changeme';
exception when duplicate_object then null;
end $$;

grant anon to authenticator;
grant authenticated to authenticator;

grant usage on schema public to anon, authenticated, authenticator;
grant select on all tables in schema public to anon, authenticated;
grant execute on all functions in schema public to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;

alter default privileges in schema public
  grant select on tables to anon, authenticated;
alter default privileges in schema public
  grant execute on functions to anon, authenticated;
alter default privileges in schema public
  grant usage, select on sequences to anon, authenticated;
