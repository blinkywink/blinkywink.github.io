-- Premium site themes (5 000 Cash each) + unlock tracking.
-- Safe to re-run.

alter table public.profiles
  add column if not exists site_themes_unlocked text[] not null default '{}';

alter table public.profiles
  drop constraint if exists profiles_site_theme_valid;

alter table public.profiles
  add constraint profiles_site_theme_valid
  check (
    site_theme in (
      'midnight',
      'ocean',
      'forest',
      'sunset',
      'grape',
      'crimson',
      'slate',
      'mint',
      'amber',
      'rose',
      'ice',
      'ember',
      'rgb',
      'neon',
      'lava',
      'toxic',
      'vapor',
      'aurora',
      'gold',
      'void'
    )
  );

-- Grandfather anyone already on a premium theme.
update public.profiles
set site_themes_unlocked = array(
  select distinct x
  from unnest(
    coalesce(site_themes_unlocked, '{}'::text[])
    || case
      when site_theme in (
        'rgb', 'neon', 'lava', 'toxic', 'vapor', 'aurora', 'gold', 'void'
      ) then array[site_theme]
      else '{}'::text[]
    end
  ) as x
)
where site_theme in (
  'rgb', 'neon', 'lava', 'toxic', 'vapor', 'aurora', 'gold', 'void'
)
and not (site_theme = any (coalesce(site_themes_unlocked, '{}'::text[])));

create or replace function public.set_site_theme(p_theme text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_account_id();
  theme text := lower(trim(coalesce(p_theme, '')));
  unlocked text[];
  free constant text[] := array[
    'midnight',
    'ocean',
    'forest',
    'sunset',
    'grape',
    'crimson',
    'slate',
    'mint',
    'amber',
    'rose',
    'ice',
    'ember'
  ];
  premium constant text[] := array[
    'rgb',
    'neon',
    'lava',
    'toxic',
    'vapor',
    'aurora',
    'gold',
    'void'
  ];
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  if theme <> all (free || premium) then
    raise exception 'Invalid theme';
  end if;

  if theme = any (premium) then
    select coalesce(site_themes_unlocked, '{}'::text[])
      into unlocked
    from public.profiles
    where id = uid;

    if unlocked is null or not (theme = any (unlocked)) then
      raise exception 'Theme not unlocked';
    end if;
  end if;

  update public.profiles
  set
    site_theme = theme,
    updated_at = now()
  where id = uid;

  return theme;
end;
$$;

create or replace function public.buy_site_theme(p_theme text)
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  uid uuid := public.current_account_id();
  theme text := lower(trim(coalesce(p_theme, '')));
  unlocked text[];
  balance integer;
  cost constant integer := 5000;
  premium constant text[] := array[
    'rgb',
    'neon',
    'lava',
    'toxic',
    'vapor',
    'aurora',
    'gold',
    'void'
  ];
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  if theme <> all (premium) then
    raise exception 'Invalid theme';
  end if;

  select coalesce(site_themes_unlocked, '{}'::text[]), coins
    into unlocked, balance
  from public.profiles
  where id = uid
  for update;

  if not found then
    raise exception 'Profile not found';
  end if;

  if theme = any (unlocked) then
    raise exception 'Already unlocked';
  end if;

  if balance < cost then
    raise exception 'Insufficient coins';
  end if;

  perform set_config('bloon.allow_coin_update', 'on', true);
  update public.profiles
  set
    coins = coins - cost,
    site_themes_unlocked = array_append(unlocked, theme),
    site_theme = theme,
    updated_at = now()
  where id = uid
  returning coins into balance;

  return balance;
end;
$$;

revoke all on function public.set_site_theme(text) from public;
grant execute on function public.set_site_theme(text) to anon, authenticated;

revoke all on function public.buy_site_theme(text) from public;
grant execute on function public.buy_site_theme(text) to anon, authenticated;
