-- Mix Up daily: once per UTC day per account.
-- Safe to re-run.

alter table public.profiles
  add column if not exists last_mixup_day date;

create or replace function public.get_mixup_daily_status()
returns json
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  uid uuid := public.current_account_id();
  today date := (timezone('utc', now()))::date;
  last_day date;
begin
  if uid is null then
    uid := auth.uid();
  end if;

  if uid is null then
    return json_build_object(
      'day', today,
      'completed', false,
      'signed_in', false
    );
  end if;

  select last_mixup_day into last_day
  from public.profiles
  where id = uid;

  return json_build_object(
    'day', today,
    'completed', last_day is not null and last_day = today,
    'signed_in', true,
    'last_mixup_day', last_day
  );
end;
$$;

-- Marks today complete. Returns completed=true if this call reserved the day
-- (first finish). completed=false if already done today.
create or replace function public.complete_mixup_daily()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_account_id();
  today date := (timezone('utc', now()))::date;
  last_day date;
  claimed boolean := false;
begin
  if uid is null then
    uid := auth.uid();
  end if;
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  select last_mixup_day into last_day
  from public.profiles
  where id = uid
  for update;

  if not found then
    raise exception 'Profile not found';
  end if;

  if last_day is null or last_day <> today then
    update public.profiles
    set last_mixup_day = today
    where id = uid;
    claimed := true;
  end if;

  return json_build_object(
    'day', today,
    'claimed', claimed,
    'completed', true
  );
end;
$$;

revoke all on function public.get_mixup_daily_status() from public;
grant execute on function public.get_mixup_daily_status() to anon, authenticated;

revoke all on function public.complete_mixup_daily() from public;
grant execute on function public.complete_mixup_daily() to anon, authenticated;
