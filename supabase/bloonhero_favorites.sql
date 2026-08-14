-- Per-account Bloon Hero song favorites. Safe to re-run.

create table if not exists public.bloonhero_favorites (
  user_id uuid not null references public.profiles (id) on delete cascade,
  md5 text not null,
  hit jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, md5),
  constraint bloonhero_favorites_md5_len check (char_length(md5) between 8 and 64)
);

create index if not exists bloonhero_favorites_user_created_idx
  on public.bloonhero_favorites (user_id, created_at desc);

alter table public.bloonhero_favorites enable row level security;

drop policy if exists bloonhero_favorites_select on public.bloonhero_favorites;
drop policy if exists bloonhero_favorites_insert on public.bloonhero_favorites;
drop policy if exists bloonhero_favorites_update on public.bloonhero_favorites;
drop policy if exists bloonhero_favorites_delete on public.bloonhero_favorites;

create or replace function public.get_bloonhero_favorites()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  uid uuid := public.current_account_id();
begin
  if uid is null then
    uid := auth.uid();
  end if;
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  return coalesce(
    (
      select jsonb_agg(f.hit order by f.created_at desc)
      from public.bloonhero_favorites f
      where f.user_id = uid
    ),
    '[]'::jsonb
  );
end;
$$;

revoke all on function public.get_bloonhero_favorites() from public;
grant execute on function public.get_bloonhero_favorites() to anon, authenticated;

create or replace function public.set_bloonhero_favorite(
  p_md5 text,
  p_hit jsonb,
  p_on boolean
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  uid uuid := public.current_account_id();
  chart text;
begin
  if uid is null then
    uid := auth.uid();
  end if;
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  chart := lower(trim(coalesce(p_md5, '')));
  if char_length(chart) < 8 then
    raise exception 'Invalid chart';
  end if;

  if not coalesce(p_on, false) then
    delete from public.bloonhero_favorites
    where user_id = uid and md5 = chart;
    return false;
  end if;

  if p_hit is null or jsonb_typeof(p_hit) <> 'object' then
    raise exception 'Invalid song';
  end if;

  insert into public.bloonhero_favorites (user_id, md5, hit)
  values (uid, chart, p_hit)
  on conflict (user_id, md5) do update
    set hit = excluded.hit,
        created_at = now();

  delete from public.bloonhero_favorites f
  where f.user_id = uid
    and f.md5 not in (
      select f2.md5
      from public.bloonhero_favorites f2
      where f2.user_id = uid
      order by f2.created_at desc
      limit 200
    );

  return true;
end;
$$;

revoke all on function public.set_bloonhero_favorite(text, jsonb, boolean) from public;
grant execute on function public.set_bloonhero_favorite(text, jsonb, boolean) to anon, authenticated;
