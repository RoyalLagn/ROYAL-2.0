-- Admin access now uses the authenticated user's active admin profile only.
-- Email/password authentication and role checks remain enforced everywhere
-- that calls private.is_admin().
create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role::text in ('admin', 'super_admin')
      and is_active
  );
$$;

revoke all on function private.is_admin() from public;
grant execute on function private.is_admin() to anon, authenticated;
