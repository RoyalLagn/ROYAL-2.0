begin;

-- Supabase Auth is otherwise callable directly with the public anon key.
-- Reject vendor-tagged identities at the Auth table boundary while public
-- registration is closed. Customer/public identities do not match this
-- condition and are unaffected.
create or replace function private.enforce_vendor_auth_registration_enabled()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(new.raw_user_meta_data ->> 'role', '') = 'vendor'
    and not private.vendor_registration_enabled() then
    raise exception 'Vendor registrations are temporarily unavailable.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_vendor_registration_before_auth_user on auth.users;
create trigger enforce_vendor_registration_before_auth_user
before insert on auth.users
for each row execute function private.enforce_vendor_auth_registration_enabled();

commit;
