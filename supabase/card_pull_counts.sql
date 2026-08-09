-- Global how many times each card has been pulled from packs.
-- Run in Supabase → SQL Editor (safe to re-run).

create table if not exists public.card_pull_counts (
  card_id text primary key,
  pull_count bigint not null default 0,
  constraint card_pull_counts_card_id_len check (
    char_length(card_id) between 3 and 80
  ),
  constraint card_pull_counts_nonneg check (pull_count >= 0)
);

alter table public.card_pull_counts enable row level security;

-- Anyone can read rarity / pull totals.
drop policy if exists "Anyone can read pull counts" on public.card_pull_counts;
create policy "Anyone can read pull counts"
  on public.card_pull_counts
  for select
  using (true);

-- No direct client writes — use record_card_pulls RPC.

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

create or replace function public.record_card_pulls(p_card_ids text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_card_ids is null or coalesce(array_length(p_card_ids, 1), 0) = 0 then
    return;
  end if;

  if coalesce(array_length(p_card_ids, 1), 0) > 40 then
    raise exception 'Too many cards in one pull record';
  end if;

  insert into public.card_pull_counts as c (card_id, pull_count)
  select trim(x) as card_id, count(*)::bigint
  from unnest(p_card_ids) as t(x)
  where char_length(trim(x)) between 3 and 80
  group by trim(x)
  on conflict (card_id) do update
  set pull_count = c.pull_count + excluded.pull_count;
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

revoke all on function public.record_card_pulls(text[]) from public;
grant execute on function public.record_card_pulls(text[]) to anon, authenticated;

revoke all on function public.get_card_pull_count(text) from public;
grant execute on function public.get_card_pull_count(text) to anon, authenticated;
