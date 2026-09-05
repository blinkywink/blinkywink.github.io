-- Arcade farm brakes: pause Cash after 5 of the same game in a row until
-- you win 4 other unique games. Instant-click spam locks Round Check / Order Up.
-- Server-side so the client can't skip it. Safe to re-run.

alter table public.profiles
  add column if not exists game_farm jsonb not null default '{}'::jsonb;

create or replace function public.protect_profile_coins()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_setting('bloon.allow_coin_update', true) = 'on' then
    new.updated_at := now();
    return new;
  end if;

  if new.coins is distinct from old.coins then
    new.coins := old.coins;
  end if;

  if new.monkey_money is distinct from old.monkey_money then
    new.monkey_money := old.monkey_money;
  end if;

  if new.coins_earned is distinct from old.coins_earned then
    new.coins_earned := old.coins_earned;
  end if;

  if new.shop_spent is distinct from old.shop_spent then
    new.shop_spent := old.shop_spent;
  end if;

  if new.free_category_packs is distinct from old.free_category_packs then
    new.free_category_packs := old.free_category_packs;
  end if;

  if new.account_stats is distinct from old.account_stats then
    new.account_stats := old.account_stats;
  end if;

  if new.game_farm is distinct from old.game_farm then
    new.game_farm := old.game_farm;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.arcade_game_id(p_id text)
returns text
language sql
immutable
as $$
  select case
    when p_id in (
      'zoomed',
      'geoguessr',
      'pricecheck',
      'orderup',
      'bloonle',
      'camodetection',
      'bloonssweeper',
      'bananacatch',
      'bloonhero',
      'roundcheck',
      'heliumpop',
      'blowfree'
    ) then p_id
    else null
  end
$$;

create or replace function public.normalize_game_farm(raw jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  gid text;
  other text;
  wins jsonb;
  paused jsonb := '{}'::jsonb;
  spam jsonb := '{}'::jsonb;
  last_pay jsonb := '{}'::jsonb;
  fast jsonb := '{}'::jsonb;
  cleaned jsonb := '{}'::jsonb;
  last_game text;
  streak integer;
  arr text[];
  ts text;
  n integer;
begin
  if raw is null or jsonb_typeof(raw) <> 'object' then
    raw := '{}'::jsonb;
  end if;

  last_game := public.arcade_game_id(raw ->> 'lastGame');
  begin
    streak := greatest(0, least(40, floor(coalesce((raw ->> 'streak')::numeric, 0))::integer));
  exception when others then
    streak := 0;
  end;
  if last_game is null then
    streak := 0;
  end if;

  if jsonb_typeof(raw -> 'paused') = 'object' then
    for gid in select jsonb_object_keys(raw -> 'paused') loop
      if public.arcade_game_id(gid) is null then
        continue;
      end if;
      arr := '{}';
      wins := (raw -> 'paused') -> gid;
      if jsonb_typeof(wins) = 'array' then
        for other in select jsonb_array_elements_text(wins) loop
          other := public.arcade_game_id(other);
          if other is null or other = gid then
            continue;
          end if;
          if not (other = any (arr)) then
            arr := arr || other;
          end if;
        end loop;
      end if;
      paused := paused || jsonb_build_object(gid, to_jsonb(arr));
    end loop;
  end if;

  if jsonb_typeof(raw -> 'spamUntil') = 'object' then
    for gid in select jsonb_object_keys(raw -> 'spamUntil') loop
      if public.arcade_game_id(gid) is null then
        continue;
      end if;
      ts := (raw -> 'spamUntil') ->> gid;
      if ts is null or length(ts) < 10 then
        continue;
      end if;
      begin
        if ts::timestamptz > now() then
          spam := spam || jsonb_build_object(gid, ts);
        end if;
      exception when others then
        null;
      end;
    end loop;
  end if;

  if jsonb_typeof(raw -> 'lastPayAt') = 'object' then
    for gid in select jsonb_object_keys(raw -> 'lastPayAt') loop
      if public.arcade_game_id(gid) is null then
        continue;
      end if;
      ts := (raw -> 'lastPayAt') ->> gid;
      if ts is null then
        continue;
      end if;
      begin
        perform ts::timestamptz;
        last_pay := last_pay || jsonb_build_object(gid, ts);
      exception when others then
        null;
      end;
    end loop;
  end if;

  if jsonb_typeof(raw -> 'fastStreak') = 'object' then
    for gid in select jsonb_object_keys(raw -> 'fastStreak') loop
      if public.arcade_game_id(gid) is null then
        continue;
      end if;
      begin
        n := greatest(0, least(20, floor(coalesce(((raw -> 'fastStreak') ->> gid)::numeric, 0))::integer));
      exception when others then
        n := 0;
      end;
      if n > 0 then
        fast := fast || jsonb_build_object(gid, n);
      end if;
    end loop;
  end if;

  cleaned := jsonb_build_object(
    'lastGame', last_game,
    'streak', streak,
    'paused', paused,
    'spamUntil', spam,
    'lastPayAt', last_pay,
    'fastStreak', fast
  );
  return cleaned;
end;
$$;

create or replace function public.game_farm_snapshot(
  p_state jsonb,
  p_game_id text,
  p_just_paused boolean default false,
  p_reason text default 'ok',
  p_coins bigint default null
)
returns json
language plpgsql
stable
as $$
declare
  gid text := public.arcade_game_id(p_game_id);
  st jsonb := public.normalize_game_farm(p_state);
  wins jsonb := '[]'::jsonb;
  have integer := 0;
  spam_until text;
  paused boolean := false;
  spam boolean := false;
  reason text := coalesce(nullif(p_reason, ''), 'ok');
begin
  if gid is not null then
    wins := coalesce(st -> 'paused' -> gid, '[]'::jsonb);
    have := coalesce(jsonb_array_length(wins), 0);
    paused := (st -> 'paused') ? gid;
    spam_until := st -> 'spamUntil' ->> gid;
    if spam_until is not null then
      begin
        spam := spam_until::timestamptz > now();
      exception when others then
        spam := false;
      end;
    end if;
  end if;

  if spam then
    reason := 'spam';
  elsif paused and reason is distinct from 'spam' then
    reason := 'paused';
  end if;

  return json_build_object(
    'coins', p_coins,
    'paid', 0,
    'canPay', (not spam and not paused),
    'reason', reason,
    'justPaused', coalesce(p_just_paused, false),
    'game', gid,
    'have', have,
    'need', 4,
    'paused', coalesce(st -> 'paused', '{}'::jsonb),
    'spamUntil', coalesce(st -> 'spamUntil', '{}'::jsonb),
    'lastGame', st -> 'lastGame',
    'streak', coalesce((st ->> 'streak')::integer, 0)
  );
end;
$$;

create or replace function public.read_game_farm(uid uuid)
returns jsonb
language plpgsql
as $$
declare
  raw jsonb;
  st jsonb;
begin
  select game_farm into raw from public.profiles where id = uid for update;
  if not found then
    raise exception 'Profile not found';
  end if;
  st := public.normalize_game_farm(raw);
  if st is distinct from coalesce(raw, '{}'::jsonb) then
    perform set_config('bloon.allow_coin_update', 'on', true);
    update public.profiles set game_farm = st where id = uid;
  end if;
  return st;
end;
$$;

create or replace function public.write_game_farm(uid uuid, st jsonb)
returns void
language plpgsql
as $$
begin
  perform set_config('bloon.allow_coin_update', 'on', true);
  update public.profiles
  set game_farm = public.normalize_game_farm(st)
  where id = uid;
end;
$$;

create or replace function public.get_game_farm(p_game_id text default null)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  uid uuid := public.current_account_id();
  st jsonb;
  coins bigint;
begin
  if uid is null then
    uid := auth.uid();
  end if;
  if uid is null then
    raise exception 'Not authenticated';
  end if;
  st := public.read_game_farm(uid);
  select p.coins into coins from public.profiles p where p.id = uid;
  return public.game_farm_snapshot(st, p_game_id, false, 'ok', coins);
end;
$$;

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
  paused jsonb;
  wins jsonb;
  gid2 text;
  arr jsonb;
  just_paused boolean := false;
  won boolean := coalesce(p_won, false);
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
  paused := coalesce(st -> 'paused', '{}'::jsonb);

  -- Unique other-game wins unlock any paused title.
  if won then
    for gid2 in select jsonb_object_keys(paused) loop
      if gid2 = gid then
        continue;
      end if;
      arr := coalesce(paused -> gid2, '[]'::jsonb);
      if not (arr ? gid) then
        arr := arr || jsonb_build_array(gid);
      end if;
      if jsonb_array_length(arr) >= 4 then
        paused := paused - gid2;
      else
        paused := paused || jsonb_build_object(gid2, arr);
      end if;
    end loop;
  end if;

  if last_game is not distinct from gid then
    streak := streak + 1;
  else
    streak := 1;
  end if;

  if streak >= 5 and not (paused ? gid) then
    paused := paused || jsonb_build_object(gid, '[]'::jsonb);
    just_paused := true;
  end if;

  st := st || jsonb_build_object(
    'lastGame', gid,
    'streak', streak,
    'paused', paused
  );
  perform public.write_game_farm(uid, st);

  select p.coins into coins from public.profiles p where p.id = uid;
  return public.game_farm_snapshot(st, gid, just_paused, 'ok', coins);
end;
$$;

create or replace function public.flag_game_spam(p_game_id text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  uid uuid := public.current_account_id();
  gid text := public.arcade_game_id(p_game_id);
  st jsonb;
  spam jsonb;
  until_ts timestamptz := now() + interval '20 minutes';
  coins bigint;
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
  spam := coalesce(st -> 'spamUntil', '{}'::jsonb);
  spam := spam || jsonb_build_object(gid, until_ts);
  st := st || jsonb_build_object('spamUntil', spam);
  perform public.write_game_farm(uid, st);

  select p.coins into coins from public.profiles p where p.id = uid;
  return public.game_farm_snapshot(st, gid, false, 'spam', coins);
end;
$$;

create or replace function public.award_game_coins(p_amount integer, p_game_id text)
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
  today date := (timezone('utc', now()))::date;
  b public.reward_buckets%rowtype;
  max_per_call constant integer := 10000;
  snap json;
  spam_until text;
  last_pay text;
  fast integer := 0;
  last_pay_at timestamptz;
  spam jsonb;
  last_pay_map jsonb;
  fast_map jsonb;
  until_ts timestamptz;
  new_balance bigint;
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
  if p_amount is null or p_amount < 1 or p_amount > max_per_call then
    raise exception 'Invalid coin amount';
  end if;

  st := public.read_game_farm(uid);
  select p.coins into coins from public.profiles p where p.id = uid;

  spam_until := st -> 'spamUntil' ->> gid;
  if spam_until is not null then
    begin
      if spam_until::timestamptz > now() then
        snap := public.game_farm_snapshot(st, gid, false, 'spam', coins);
        return snap;
      end if;
    exception when others then
      null;
    end;
  end if;

  if (st -> 'paused') ? gid then
    snap := public.game_farm_snapshot(st, gid, false, 'paused', coins);
    return snap;
  end if;

  last_pay := st -> 'lastPayAt' ->> gid;
  begin
    last_pay_at := last_pay::timestamptz;
  exception when others then
    last_pay_at := null;
  end;
  begin
    fast := greatest(0, coalesce((st -> 'fastStreak' ->> gid)::integer, 0));
  exception when others then
    fast := 0;
  end;

  if last_pay_at is not null and last_pay_at > now() - interval '800 milliseconds' then
    fast := fast + 1;
  else
    fast := 0;
  end if;

  last_pay_map := coalesce(st -> 'lastPayAt', '{}'::jsonb) || jsonb_build_object(gid, now());
  fast_map := coalesce(st -> 'fastStreak', '{}'::jsonb);

  if fast >= 4 then
    until_ts := now() + interval '20 minutes';
    spam := coalesce(st -> 'spamUntil', '{}'::jsonb) || jsonb_build_object(gid, until_ts);
    fast_map := fast_map || jsonb_build_object(gid, 0);
    st := st || jsonb_build_object(
      'spamUntil', spam,
      'lastPayAt', last_pay_map,
      'fastStreak', fast_map
    );
    perform public.write_game_farm(uid, st);
    snap := public.game_farm_snapshot(st, gid, false, 'spam', coins);
    return snap;
  end if;

  fast_map := fast_map || jsonb_build_object(gid, fast);
  st := st || jsonb_build_object(
    'lastPayAt', last_pay_map,
    'fastStreak', fast_map
  );

  insert into public.reward_buckets (user_id)
    values (uid)
  on conflict (user_id) do nothing;

  select * into b from public.reward_buckets where user_id = uid for update;

  if b.coin_day is distinct from today then
    b.coin_day := today;
    b.coins_today := 0;
  end if;

  if b.coin_window_start < now() - interval '60 seconds' then
    b.coin_window_start := now();
    b.coins_in_window := 0;
  end if;

  update public.reward_buckets
  set
    coin_day = b.coin_day,
    coins_today = b.coins_today + p_amount,
    coin_window_start = b.coin_window_start,
    coins_in_window = b.coins_in_window + p_amount
  where user_id = uid;

  perform set_config('bloon.allow_coin_update', 'on', true);

  update public.profiles
  set
    coins = coins + p_amount,
    coins_earned = coins_earned + p_amount
  where id = uid
  returning coins into new_balance;

  if new_balance is null then
    raise exception 'Profile not found';
  end if;

  -- write_game_farm also sets allow_coin_update
  perform public.write_game_farm(uid, st);

  snap := public.game_farm_snapshot(st, gid, false, 'ok', new_balance);
  snap := jsonb_set(snap::jsonb, '{paid}', to_jsonb(p_amount))::json;
  return snap;
end;
$$;

revoke all on function public.get_game_farm(text) from public;
revoke all on function public.note_game_run(text, boolean) from public;
revoke all on function public.flag_game_spam(text) from public;
revoke all on function public.award_game_coins(integer, text) from public;
grant execute on function public.get_game_farm(text) to anon, authenticated;
grant execute on function public.note_game_run(text, boolean) to anon, authenticated;
grant execute on function public.flag_game_spam(text) to anon, authenticated;
grant execute on function public.award_game_coins(integer, text) to anon, authenticated;
