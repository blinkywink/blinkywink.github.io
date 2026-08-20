-- Pin search_path + lock internal helpers.
--
-- This app authenticates with x-bloon-session and the publishable (anon) key,
-- not a Supabase JWT. Client RPCs MUST stay executable by anon. Revoking
-- anon EXECUTE on those functions breaks packs, shop, market, trades, etc.
--
-- Advisor 0028/0029 on client RPCs is expected for this auth model.
-- Safe to re-run.

-- Pin search_path on helper functions the linter flagged.
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as ident
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'protect_profile_coins',
        'shop_direct_price',
        'hero_clears_required',
        'hero_upgrade_cost',
        'hero_unlock_cost',
        'paragon_xp_to_next',
        '_apply_paragon_gain',
        '_new_visual_seed',
        '_paragon_xp_for_card',
        '_paragon_id_for_card'
      )
  loop
    execute format('alter function %s set search_path = public', r.ident);
  end loop;
end $$;

-- Internal SECURITY DEFINER helpers are not client RPCs.
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as ident
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and (
        p.proname like '\_%' escape '\'
        or p.proname in (
          'handle_new_user',
          'preview_reset_all_accounts',
          'reset_all_accounts_to_fresh',
          'prune_unowned_showcase'
        )
      )
  loop
    execute format('revoke all on function %s from public', r.ident);
    execute format('revoke all on function %s from anon', r.ident);
    execute format('revoke all on function %s from authenticated', r.ident);
    execute format('grant execute on function %s to service_role', r.ident);
  end loop;
end $$;

-- Restore client + RLS helpers to anon (publishable key) and authenticated.
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as ident
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and p.proname not like '\_%' escape '\'
      and p.proname not in (
        'handle_new_user',
        'preview_reset_all_accounts',
        'reset_all_accounts_to_fresh',
        'prune_unowned_showcase'
      )
  loop
    execute format('grant execute on function %s to anon, authenticated, service_role', r.ident);
  end loop;
end $$;
