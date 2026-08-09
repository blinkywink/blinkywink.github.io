-- Separate daily card claim (UTC day). Safe to re-run.

alter table public.profiles
  add column if not exists last_daily_card_claim date;

-- Mark today's shared daily card as claimed (client awards the card after).
create or replace function public.claim_daily_card()
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  uid uuid := public.current_account_id();
  today date := (timezone('utc', now()))::date;
  last_claim date;
begin
  if uid is null then
    uid := auth.uid();
  end if;
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  select last_daily_card_claim into last_claim
  from public.profiles
  where id = uid
  for update;

  if not found then
    raise exception 'Profile not found';
  end if;

  if last_claim is not null and last_claim = today then
    raise exception 'ALREADY_CLAIMED' using errcode = 'P0001';
  end if;

  update public.profiles
  set last_daily_card_claim = today
  where id = uid;

  return json_build_object(
    'last_daily_card_claim', today
  );
end;
$$;

revoke all on function public.claim_daily_card() from public;
grant execute on function public.claim_daily_card() to anon, authenticated;
