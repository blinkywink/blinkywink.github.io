-- Monkey card ownership for signed-in users
-- Run in Supabase → SQL Editor (safe to re-run)

create table if not exists public.owned_cards (
  user_id uuid not null references auth.users (id) on delete cascade,
  card_id text not null,
  obtained_at timestamptz not null default now(),
  primary key (user_id, card_id),
  constraint owned_cards_card_id_len check (
    char_length(card_id) between 3 and 80
  )
);

create index if not exists owned_cards_user_id_idx
  on public.owned_cards (user_id);

alter table public.owned_cards enable row level security;

drop policy if exists "Users can read own cards" on public.owned_cards;
create policy "Users can read own cards"
  on public.owned_cards
  for select
  using (auth.uid() = user_id);

-- No direct insert/update/delete from clients — use award_cards RPC

create or replace function public.award_cards(p_card_ids text[])
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  added text[];
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  if p_card_ids is null or coalesce(array_length(p_card_ids, 1), 0) = 0 then
    return '{}';
  end if;

  if coalesce(array_length(p_card_ids, 1), 0) > 40 then
    raise exception 'Too many cards in one award';
  end if;

  with cleaned as (
    select distinct trim(x) as card_id
    from unnest(p_card_ids) as t(x)
    where char_length(trim(x)) between 3 and 80
  ),
  inserted as (
    insert into public.owned_cards (user_id, card_id)
    select uid, c.card_id
    from cleaned c
    on conflict (user_id, card_id) do nothing
    returning card_id
  )
  select coalesce(array_agg(card_id), '{}') into added from inserted;

  return added;
end;
$$;

revoke all on function public.award_cards(text[]) from public;
grant execute on function public.award_cards(text[]) to authenticated;
