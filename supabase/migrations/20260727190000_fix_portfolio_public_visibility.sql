begin;

-- Portfolio visibility must match the marketplace vendor visibility rule.
-- Requiring a paid subscription here hid albums for approved vendors whose
-- public profile was otherwise visible.
create or replace function private.portfolio_vendor_is_public(target_vendor_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.vendor_is_public(target_vendor_id);
$$;

revoke all on function private.portfolio_vendor_is_public(uuid) from public;
grant execute on function private.portfolio_vendor_is_public(uuid) to anon, authenticated;

commit;
