-- Allow RGB LED site theme. Safe to re-run.

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
      'rgb'
    )
  );

create or replace function public.set_site_theme(p_theme text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.current_account_id();
  theme text := lower(trim(coalesce(p_theme, '')));
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  if theme not in (
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
    'rgb'
  ) then
    raise exception 'Invalid theme';
  end if;

  update public.profiles
  set
    site_theme = theme,
    updated_at = now()
  where id = uid;

  return theme;
end;
$$;

revoke all on function public.set_site_theme(text) from public;
grant execute on function public.set_site_theme(text) to anon, authenticated;
