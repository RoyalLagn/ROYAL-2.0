begin;

insert into public.application_settings(key, value, value_type, description, is_public)
values (
  'vendor_registration_enabled',
  'true'::jsonb,
  'boolean',
  'Allow new vendors to register through the public app.',
  true
)
on conflict (key) do nothing;

create or replace function private.vendor_registration_enabled()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select case
        when jsonb_typeof(value) = 'boolean' then (value #>> '{}')::boolean
        else true
      end
      from public.application_settings
      where key = 'vendor_registration_enabled'
    ),
    true
  );
$$;

create or replace function public.get_vendor_registration_enabled()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.vendor_registration_enabled();
$$;

create or replace function public.assert_vendor_registration_enabled()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.vendor_registration_enabled() then
    raise exception 'Vendor registrations are temporarily unavailable.' using errcode = 'P0001';
  end if;
  return true;
end;
$$;

create or replace function public.admin_set_vendor_registration_enabled(enabled boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  insert into public.application_settings(key, value, value_type, description, is_public, updated_by)
  values (
    'vendor_registration_enabled',
    to_jsonb(enabled),
    'boolean',
    'Allow new vendors to register through the public app.',
    true,
    auth.uid()
  )
  on conflict (key) do update set
    value = excluded.value,
    value_type = excluded.value_type,
    description = excluded.description,
    is_public = true,
    updated_by = auth.uid(),
    updated_at = now();

  return enabled;
end;
$$;

create or replace function private.enforce_vendor_registration_enabled()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() = 'service_role' or private.is_admin() then
    return new;
  end if;

  if tg_table_name = 'profiles' then
    if new.role::text <> 'vendor'
      or (tg_op = 'UPDATE' and old.role::text = 'vendor') then
      return new;
    end if;
  end if;

  if not private.vendor_registration_enabled() then
    raise exception 'Vendor registrations are temporarily unavailable.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_enforce_vendor_registration on public.profiles;
create trigger profiles_enforce_vendor_registration
before insert or update of role on public.profiles
for each row execute function private.enforce_vendor_registration_enabled();

drop trigger if exists vendor_applications_enforce_registration on public.vendor_applications;
create trigger vendor_applications_enforce_registration
before insert on public.vendor_applications
for each row execute function private.enforce_vendor_registration_enabled();

revoke all on function public.get_vendor_registration_enabled() from public;
revoke all on function public.assert_vendor_registration_enabled() from public;
revoke all on function public.admin_set_vendor_registration_enabled(boolean) from public;
grant execute on function public.get_vendor_registration_enabled() to anon, authenticated;
grant execute on function public.assert_vendor_registration_enabled() to anon, authenticated;
grant execute on function public.admin_set_vendor_registration_enabled(boolean) to authenticated;

commit;
