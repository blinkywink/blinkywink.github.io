-- Global recent Bloon Hero song picks (shared across players).
-- Safe to re-run.

create table if not exists public.bloonhero_recent_plays (
  id bigint generated always as identity primary key,
  user_id uuid null,
  username text not null default 'Player',
  md5 text not null,
  chart_id bigint null,
  song_name text not null,
  artist text not null,
  album_art_md5 text null,
  charter text null,
  song_length integer null,
  played_at timestamptz not null default now()
);

create index if not exists bloonhero_recent_plays_played_at_idx
  on public.bloonhero_recent_plays (played_at desc);

create index if not exists bloonhero_recent_plays_md5_played_at_idx
  on public.bloonhero_recent_plays (md5, played_at desc);

alter table public.bloonhero_recent_plays enable row level security;

-- No direct client reads/writes — use RPCs below.
drop policy if exists bloonhero_recent_select on public.bloonhero_recent_plays;
drop policy if exists bloonhero_recent_insert on public.bloonhero_recent_plays;

create or replace function public.record_bloonhero_play(
  p_md5 text,
  p_chart_id bigint,
  p_song_name text,
  p_artist text,
  p_album_art_md5 text default null,
  p_charter text default null,
  p_song_length integer default null
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  uid uuid := public.current_account_id();
  uname text := 'Player';
begin
  if uid is null then
    uid := auth.uid();
  end if;

  if p_md5 is null or length(trim(p_md5)) < 8 then
    raise exception 'Invalid chart';
  end if;
  if p_song_name is null or length(trim(p_song_name)) < 1 then
    raise exception 'Invalid song';
  end if;

  if uid is not null then
    select username into uname from public.profiles where id = uid;
    if uname is null or length(trim(uname)) = 0 then
      uname := 'Player';
    end if;

    -- Soft rate limit: one row per user+song per 45s
    if exists (
      select 1
      from public.bloonhero_recent_plays
      where user_id = uid
        and md5 = lower(trim(p_md5))
        and played_at > now() - interval '45 seconds'
    ) then
      return false;
    end if;
  else
    uname := 'Guest';
    if exists (
      select 1
      from public.bloonhero_recent_plays
      where user_id is null
        and md5 = lower(trim(p_md5))
        and played_at > now() - interval '20 seconds'
    ) then
      return false;
    end if;
  end if;

  insert into public.bloonhero_recent_plays (
    user_id,
    username,
    md5,
    chart_id,
    song_name,
    artist,
    album_art_md5,
    charter,
    song_length
  )
  values (
    uid,
    left(coalesce(nullif(trim(uname), ''), 'Player'), 32),
    lower(trim(p_md5)),
    p_chart_id,
    left(trim(p_song_name), 160),
    left(coalesce(nullif(trim(p_artist), ''), 'Unknown'), 120),
    nullif(trim(coalesce(p_album_art_md5, '')), ''),
    nullif(left(trim(coalesce(p_charter, '')), 80), ''),
    case
      when p_song_length is null or p_song_length < 0 then null
      else least(p_song_length, 36000000)
    end
  );

  -- Keep table bounded
  delete from public.bloonhero_recent_plays
  where id < (
    select id
    from public.bloonhero_recent_plays
    order by played_at desc
    offset 400
    limit 1
  );

  return true;
end;
$$;

revoke all on function public.record_bloonhero_play(
  text, bigint, text, text, text, text, integer
) from public;
grant execute on function public.record_bloonhero_play(
  text, bigint, text, text, text, text, integer
) to anon, authenticated;

create or replace function public.get_bloonhero_recent_plays(
  p_limit integer default 16
)
returns table (
  id bigint,
  user_id uuid,
  username text,
  md5 text,
  chart_id bigint,
  song_name text,
  artist text,
  album_art_md5 text,
  charter text,
  song_length integer,
  played_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  with latest as (
    select distinct on (r.md5)
      r.id,
      r.user_id,
      r.username,
      r.md5,
      r.chart_id,
      r.song_name,
      r.artist,
      r.album_art_md5,
      r.charter,
      r.song_length,
      r.played_at
    from public.bloonhero_recent_plays r
    order by r.md5, r.played_at desc
  )
  select *
  from latest
  order by played_at desc
  limit greatest(1, least(coalesce(p_limit, 16), 40));
$$;

revoke all on function public.get_bloonhero_recent_plays(integer) from public;
grant execute on function public.get_bloonhero_recent_plays(integer) to anon, authenticated;
