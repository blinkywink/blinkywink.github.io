-- Lock paragon rows while applying XP so concurrent packs can't lose progress.
-- Safe to re-run.

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
declare
  uid uuid := public.current_account_id();
  rec record;
  cur public.paragon_progress%rowtype;
  applied record;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  if p_feeds is null or jsonb_typeof(p_feeds) <> 'array' then
    return;
  end if;
  if jsonb_array_length(p_feeds) > 20 then
    raise exception 'Too many paragon feeds';
  end if;

  for rec in
    select
      trim(x.card_id) as card_id,
      least(2000000, greatest(0, sum(coalesce(x.xp, 0))))::integer as add_xp,
      least(20, greatest(0, sum(coalesce(x.degrees, 0))))::integer as add_degrees
    from jsonb_to_recordset(p_feeds) as x(card_id text, xp integer, degrees integer)
    where trim(coalesce(x.card_id, '')) like '%-paragon'
    group by trim(x.card_id)
  loop
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
