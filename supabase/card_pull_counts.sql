-- Global how many times each card has been pulled from packs (includes duplicates).
-- Also tracks total pulls across the whole game.
-- Run in Supabase → SQL Editor (safe to re-run).

create table if not exists public.card_pull_counts (
  card_id text primary key,
  pull_count bigint not null default 0,
  constraint card_pull_counts_card_id_len check (
    char_length(card_id) between 3 and 80
  ),
  constraint card_pull_counts_nonneg check (pull_count >= 0)
);

-- Singleton row for “every card pull ever” (includes duplicates).
create table if not exists public.card_pull_totals (
  id boolean primary key default true check (id),
  total_pulls bigint not null default 0,
  constraint card_pull_totals_nonneg check (total_pulls >= 0)
);

insert into public.card_pull_totals (id, total_pulls)
values (true, 0)
on conflict (id) do nothing;

alter table public.card_pull_counts enable row level security;
alter table public.card_pull_totals enable row level security;

drop policy if exists "Anyone can read pull counts" on public.card_pull_counts;
create policy "Anyone can read pull counts"
  on public.card_pull_counts
  for select
  using (true);

drop policy if exists "Anyone can read pull totals" on public.card_pull_totals;
create policy "Anyone can read pull totals"
  on public.card_pull_totals
  for select
  using (true);

-- Seed a floor from current unique owners (historical pulls undercounted).
insert into public.card_pull_counts (card_id, pull_count)
select card_id, count(*)::bigint
from public.owned_cards
group by card_id
on conflict (card_id) do update
set pull_count = greatest(
  public.card_pull_counts.pull_count,
  excluded.pull_count
);

-- Keep total in sync with the sum of per-card counts (safe re-run).
update public.card_pull_totals
set total_pulls = (
  select coalesce(sum(pull_count), 0)::bigint from public.card_pull_counts
)
where id = true;

create or replace function public.record_card_pulls(p_card_ids text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  cleaned text[];
  added bigint;
begin
  if p_card_ids is null or coalesce(array_length(p_card_ids, 1), 0) = 0 then
    return;
  end if;

  if coalesce(array_length(p_card_ids, 1), 0) > 40 then
    raise exception 'Too many cards in one pull record';
  end if;

  select coalesce(array_agg(trim(x)), '{}')
  into cleaned
  from unnest(p_card_ids) as t(x)
  where char_length(trim(x)) between 3 and 80;

  added := coalesce(array_length(cleaned, 1), 0);
  if added = 0 then
    return;
  end if;

  -- Per-card counts: duplicates in the same pack each increment.
  insert into public.card_pull_counts as c (card_id, pull_count)
  select cid, count(*)::bigint
  from unnest(cleaned) as cid
  group by cid
  on conflict (card_id) do update
  set pull_count = c.pull_count + excluded.pull_count;

  insert into public.card_pull_totals (id, total_pulls)
  values (true, added)
  on conflict (id) do update
  set total_pulls = public.card_pull_totals.total_pulls + excluded.total_pulls;
end;
$$;

create or replace function public.get_card_pull_count(p_card_id text)
returns bigint
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  id text := trim(coalesce(p_card_id, ''));
  n bigint;
begin
  if char_length(id) < 3 or char_length(id) > 80 then
    return 0;
  end if;

  select pull_count into n
  from public.card_pull_counts
  where card_id = id;

  return coalesce(n, 0);
end;
$$;

-- card pulls + all-time total pulls (duplicates included in both).
create or replace function public.get_card_pull_stats(p_card_id text)
returns json
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  id text := trim(coalesce(p_card_id, ''));
  n bigint := 0;
  t bigint := 0;
begin
  if char_length(id) >= 3 and char_length(id) <= 80 then
    select pull_count into n
    from public.card_pull_counts
    where card_id = id;
  end if;

  select total_pulls into t
  from public.card_pull_totals
  where id = true;

  return json_build_object(
    'count', coalesce(n, 0),
    'total', coalesce(t, 0)
  );
end;
$$;

revoke all on function public.record_card_pulls(text[]) from public;
grant execute on function public.record_card_pulls(text[]) to anon, authenticated;

revoke all on function public.get_card_pull_count(text) from public;
grant execute on function public.get_card_pull_count(text) to anon, authenticated;

revoke all on function public.get_card_pull_stats(text) from public;
grant execute on function public.get_card_pull_stats(text) to anon, authenticated;
