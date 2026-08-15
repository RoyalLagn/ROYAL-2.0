begin;

-- Every existing admin RLS policy and privileged RPC funnels through this
-- helper. Requiring aal2 here means an admin password (aal1) alone cannot read
-- or mutate administrator-only data, even if a client bypasses the UI.
create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
    and exists (
      select 1
      from public.profiles
      where id = auth.uid()
        and role::text in ('admin', 'super_admin')
        and is_active
    );
$$;

revoke all on function private.is_admin() from public;
grant execute on function private.is_admin() to anon, authenticated;

commit;
