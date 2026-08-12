-- Per-game high scores for endless modes (Banana Catch, Camo Detection).
-- Safe to re-run.

create table if not exists public.game_high_scores (
  user_id uuid not null references public.profiles (id) on delete cascade,
  game_id text not null,
  score integer not null check (score >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, game_id),
  constraint game_high_scores_known check (
    game_id in ('bananacatch', 'camodetection')
  )
);

create index if not exists game_high_scores_game_score_idx
  on public.game_high_scores (game_id, score desc, updated_at asc);

alter table public.game_high_scores enable row level security;

drop policy if exists "Game high scores are viewable by everyone" on public.game_high_scores;
create policy "Game high scores are viewable by everyone"
  on public.game_high_scores
  for select
  using (true);

revoke all on table public.game_high_scores from public, anon, authenticated;
grant select on table public.game_high_scores to anon, authenticated, service_role;
grant all on table public.game_high_scores to service_role;

drop function if exists public.submit_game_score(text, integer);

create or replace function public.submit_game_score(
  p_game_id text,
  p_score integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_account_id();
  gid text := lower(trim(coalesce(p_game_id, '')));
  scored integer := greatest(0, coalesce(p_score, 0));
  prev_score integer := 0;
  best integer := 0;
  is_new boolean := false;
  my_rank integer := 1;
  result jsonb;
begin
  if uid is null then
    uid := auth.uid();
  end if;
  if uid is null then
    raise exception 'Sign in to save a high score';
  end if;
  if gid not in ('bananacatch', 'camodetection') then
    raise exception 'Unknown game';
  end if;

  select s.score into prev_score
  from public.game_high_scores s
  where s.user_id = uid and s.game_id = gid;

  if prev_score is null then
    prev_score := 0;
  end if;

  best := greatest(prev_score, scored);
  is_new := scored > prev_score;

  if is_new or prev_score = 0 then
    insert into public.game_high_scores (user_id, game_id, score, updated_at)
    values (uid, gid, best, now())
    on conflict (user_id, game_id) do update
      set score = excluded.score,
          updated_at = excluded.updated_at
      where public.game_high_scores.score < excluded.score
         or public.game_high_scores.score = 0;
  end if;

  select s.score into best
  from public.game_high_scores s
  where s.user_id = uid and s.game_id = gid;
  best := coalesce(best, scored);

  select count(*)::integer + 1 into my_rank
  from public.game_high_scores s
  where s.game_id = gid
    and (
      s.score > best
      or (s.score = best and s.updated_at < (
        select updated_at from public.game_high_scores
        where user_id = uid and game_id = gid
      ))
      or (
        s.score = best
        and s.updated_at = (
          select updated_at from public.game_high_scores
          where user_id = uid and game_id = gid
        )
        and s.user_id < uid
      )
    );

  select jsonb_build_object(
    'gameId', gid,
    'score', scored,
    'bestScore', best,
    'isNewBest', is_new,
    'rank', my_rank,
    'neighbors', coalesce((
      with ranked as (
        select
          s.user_id,
          p.username,
          s.score,
          rank() over (
            order by s.score desc, s.updated_at asc, s.user_id asc
          ) as rnk
        from public.game_high_scores s
        join public.profiles p on p.id = s.user_id
        where s.game_id = gid
      ),
      me as (
        select rnk from ranked where user_id = uid
      )
      select jsonb_agg(
        jsonb_build_object(
          'rank', r.rnk,
          'userId', r.user_id,
          'username', r.username,
          'score', r.score,
          'isYou', r.user_id = uid
        )
        order by r.rnk
      )
      from ranked r, me
      where r.rnk between greatest(1, me.rnk - 3) and me.rnk + 3
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke all on function public.submit_game_score(text, integer) from public;
grant execute on function public.submit_game_score(text, integer) to anon, authenticated, service_role;
