-- Apply Paragon XP/degrees from pulled card ids (text[] — same shape as award_cards).
-- Also harden apply_paragon_feeds so a bad jsonb payload can't silently no-op.
-- Safe to re-run.

create or replace function public._paragon_xp_for_card(p_card_id text)
returns integer
language plpgsql
immutable
as $$
declare
  a integer;
  b integer;
  c integer;
  tier integer;
begin
  if p_card_id is null or p_card_id like '%-paragon' then
    return 0;
  end if;
  if p_card_id !~ '-[0-5]-[0-5]-[0-5]$' then
    return 0;
  end if;
  a := substring(p_card_id from '-([0-5])-[0-5]-[0-5]$')::integer;
  b := substring(p_card_id from '-[0-5]-([0-5])-[0-5]$')::integer;
  c := substring(p_card_id from '-[0-5]-[0-5]-([0-5])$')::integer;
  tier := greatest(a, b, c);
  return case tier
    when 0 then 1
    when 1 then 1
    when 2 then 6
    when 3 then 22
    when 4 then 80
    when 5 then 350
    else 0
  end;
end;
$$;

create or replace function public._paragon_id_for_card(p_card_id text)
returns text
language sql
immutable
as $$
  select case
    when p_card_id like '%-paragon' then p_card_id
    when p_card_id ~ '-[0-5]-[0-5]-[0-5]$' then regexp_replace(p_card_id, '-[0-5]-[0-5]-[0-5]$', '-paragon')
    else null
  end;
$$;

create or replace function public.feed_paragons_from_cards(
  p_card_ids text[],
  p_new_ids text[] default '{}'
)
returns table(
  card_id text,
  degree integer,
  xp integer,
  xp_gained integer,
  degrees_gained integer
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  uid uuid := public.current_account_id();
  rec record;
  cur public.paragon_progress%rowtype;
  applied record;
  new_ids text[] := coalesce(p_new_ids, '{}');
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;
  if p_card_ids is null or coalesce(array_length(p_card_ids, 1), 0) = 0 then
    return;
  end if;
  if coalesce(array_length(p_card_ids, 1), 0) > 40 then
    raise exception 'Too many cards to feed';
  end if;

  for rec in
    select
      public._paragon_id_for_card(trim(x)) as paragon_id,
      sum(
        case
          when trim(x) like '%-paragon' and not (trim(x) = any (new_ids))
            then 0
          else public._paragon_xp_for_card(trim(x))
        end
      )::integer as add_xp,
      sum(
        case
          when trim(x) like '%-paragon' and not (trim(x) = any (new_ids))
            then 3
          else 0
        end
      )::integer as add_degrees
    from unnest(p_card_ids) as x
    where char_length(trim(x)) between 3 and 80
      and public._paragon_id_for_card(trim(x)) is not null
    group by public._paragon_id_for_card(trim(x))
  loop
    if rec.paragon_id is null then
      continue;
    end if;
    if coalesce(rec.add_xp, 0) <= 0 and coalesce(rec.add_degrees, 0) <= 0 then
      continue;
    end if;
    if not exists (
      select 1 from public.owned_cards oc
      where oc.user_id = uid and oc.card_id = rec.paragon_id
    ) then
      continue;
    end if;

    perform pg_advisory_xact_lock(hashtext(uid::text || ':' || rec.paragon_id));

    select * into cur
    from public.paragon_progress pp
    where pp.user_id = uid and pp.card_id = rec.paragon_id
    for update;

    if not found then
      cur.degree := 1;
      cur.xp := 0;
    end if;

    select * into applied
    from public._apply_paragon_gain(
      cur.degree,
      cur.xp,
      least(2000000, greatest(0, rec.add_xp)),
      least(20, greatest(0, rec.add_degrees))
    );

    insert into public.paragon_progress (user_id, card_id, degree, xp, updated_at)
    values (uid, rec.paragon_id, applied.o_degree, applied.o_xp, now())
    on conflict (user_id, card_id) do update
      set degree = excluded.degree,
          xp = excluded.xp,
          updated_at = now();

    card_id := rec.paragon_id;
    degree := applied.o_degree;
    xp := applied.o_xp;
    xp_gained := rec.add_xp;
    degrees_gained := applied.o_degrees_gained;
    return next;
  end loop;
end;
$$;

-- Harden the old jsonb RPC: never silent-return on a usable payload.
create or replace function public.apply_paragon_feeds(p_feeds jsonb)
returns table(
  card_id text,
  degree integer,
  xp integer,
  xp_gained integer,
  degrees_gained integer
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  uid uuid := public.current_account_id();
  rec record;
  cur public.paragon_progress%rowtype;
  applied record;
  feeds jsonb := p_feeds;
begin
  if uid is null then raise exception 'Not authenticated'; end if;

  if feeds is null then
    return;
  end if;
  if jsonb_typeof(feeds) = 'string' then
    begin
      feeds := (feeds #>> '{}')::jsonb;
    exception when others then
      raise exception 'Invalid paragon feeds';
    end;
  end if;
  if jsonb_typeof(feeds) <> 'array' then
    raise exception 'Invalid paragon feeds';
  end if;
  if jsonb_array_length(feeds) = 0 then
    return;
  end if;
  if jsonb_array_length(feeds) > 20 then
    raise exception 'Too many paragon feeds';
  end if;

  for rec in
    select
      trim(coalesce(x.card_id, x.paragon_id, '')) as card_id,
      least(2000000, greatest(0, sum(coalesce(x.xp, 0))))::integer as add_xp,
      least(20, greatest(0, sum(coalesce(x.degrees, 0))))::integer as add_degrees
    from jsonb_to_recordset(feeds) as x(
      card_id text,
      paragon_id text,
      xp integer,
      degrees integer
    )
    where trim(coalesce(x.card_id, x.paragon_id, '')) like '%-paragon'
    group by trim(coalesce(x.card_id, x.paragon_id, ''))
  loop
    if rec.card_id is null or rec.card_id = '' then
      continue;
    end if;
    if rec.add_xp <= 0 and rec.add_degrees <= 0 then
      continue;
    end if;
    if not exists (
      select 1 from public.owned_cards oc
      where oc.user_id = uid and oc.card_id = rec.card_id
    ) then
      continue;
    end if;

    perform pg_advisory_xact_lock(hashtext(uid::text || ':' || rec.card_id));

    select * into cur
    from public.paragon_progress pp
    where pp.user_id = uid and pp.card_id = rec.card_id
    for update;

    if not found then
      cur.degree := 1;
      cur.xp := 0;
    end if;

    select * into applied
    from public._apply_paragon_gain(cur.degree, cur.xp, rec.add_xp, rec.add_degrees);

    insert into public.paragon_progress (user_id, card_id, degree, xp, updated_at)
    values (uid, rec.card_id, applied.o_degree, applied.o_xp, now())
    on conflict (user_id, card_id) do update
      set degree = excluded.degree,
          xp = excluded.xp,
          updated_at = now();

    card_id := rec.card_id;
    degree := applied.o_degree;
    xp := applied.o_xp;
    xp_gained := rec.add_xp;
    degrees_gained := applied.o_degrees_gained;
    return next;
  end loop;
end;
$$;

revoke all on function public._paragon_xp_for_card(text) from public;
revoke all on function public._paragon_id_for_card(text) from public;
revoke all on function public.feed_paragons_from_cards(text[], text[]) from public;
revoke all on function public.apply_paragon_feeds(jsonb) from public;

grant execute on function public.feed_paragons_from_cards(text[], text[]) to anon, authenticated;
grant execute on function public.apply_paragon_feeds(jsonb) to anon, authenticated;
