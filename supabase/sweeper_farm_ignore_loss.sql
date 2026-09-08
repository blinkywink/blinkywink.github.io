-- Sweeper losses do not count toward the 5-in-a-row No Cash cool-off.

create or replace function public.note_game_run(p_game_id text, p_won boolean)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  uid uuid := public.current_account_id();
  gid text := public.arcade_game_id(p_game_id);
  st jsonb;
  coins bigint;
  last_game text;
  streak integer;
  just_paused boolean := false;
begin
  if uid is null then
    uid := auth.uid();
  end if;
  if uid is null then
    raise exception 'Not authenticated';
  end if;
  if gid is null then
    raise exception 'Invalid game';
  end if;

  st := public.read_game_farm(uid);
  last_game := st ->> 'lastGame';
  streak := coalesce((st ->> 'streak')::integer, 0);

  -- Sweeper deaths are common and pay nothing — don't feed the 5-in-a-row mute.
  if gid = 'bloonssweeper' and coalesce(p_won, false) = false then
    select p.coins into coins from public.profiles p where p.id = uid;
    return public.game_farm_snapshot(st, gid, false, 'ok', coins);
  end if;

  if last_game is not distinct from gid then
    streak := streak + 1;
  else
    streak := 1;
  end if;

  -- Five of the same game in a row → 3 minute No Cash cool-off.
  if streak >= 5 then
    st := public.extend_game_mute(st, gid, now() + interval '3 minutes');
    just_paused := true;
    streak := 0;
  end if;

  st := st || jsonb_build_object(
    'lastGame', gid,
    'streak', streak,
    'paused', '{}'::jsonb
  );
  perform public.write_game_farm(uid, st);

  select p.coins into coins from public.profiles p where p.id = uid;
  return public.game_farm_snapshot(
    st,
    gid,
    just_paused,
    case when just_paused then 'paused' else 'ok' end,
    coins
  );
end;
$$;
