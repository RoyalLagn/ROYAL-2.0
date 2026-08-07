begin;

-- Bug
-- ---
-- private.validate_managed_location_selection() is shared by triggers on
-- profiles, vendor_applications, vendors, and vendor_service_locations.
-- The final vendor city/state consistency check was written as:
--
--   if tg_table_name = 'vendors' and not exists (... new.city ... new.state ...)
--
-- PL/pgSQL evaluates that as one SQL expression. SQL boolean AND does not
-- guarantee short-circuit evaluation, so Postgres still resolves NEW.city /
-- NEW.state when the trigger fires on public.profiles — which has neither
-- column. Public signup then dies inside complete_public_registration with:
--
--   42703  record "new" has no field "city"
--   HTTP 400 from /rest/v1/rpc/complete_public_registration
--
-- Leaving the auth user half-created (OTP verified, password never set /
-- profile row missing).
--
-- Fix: nest the vendor-only field access so NEW.city / NEW.state are only
-- referenced when the triggering table is actually vendors.

create or replace function private.validate_managed_location_selection()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_city_id uuid;
  selected_area_id uuid;
  service_area_id uuid;
begin
  if tg_table_name = 'profiles' then
    selected_city_id := new.preferred_city_id;
    selected_area_id := new.preferred_area_id;
  elsif tg_table_name = 'vendor_applications' then
    selected_city_id := new.city_id;
    selected_area_id := new.area_id;
    if tg_op = 'INSERT' then
      if selected_city_id is null then
        raise exception 'Choose a supported RoyalLagn city';
      end if;
      if new.pincode !~ '^[1-9][0-9]{5}$' then
        raise exception 'Enter a valid six-digit Indian PIN code';
      end if;
    end if;
    foreach service_area_id in array coalesce(new.service_area_ids, array[]::uuid[])
    loop
      if not exists (
        select 1 from public.supported_areas service_area
        where service_area.id = service_area_id
          and service_area.city_id = selected_city_id
          and service_area.is_active
      ) then
        raise exception 'A selected service area is not active in the selected city';
      end if;
    end loop;
  elsif tg_table_name = 'vendors' then
    selected_city_id := new.primary_city_id;
    selected_area_id := new.primary_area_id;
    if selected_city_id is null
       and tg_op = 'UPDATE'
       and auth.uid() is not null
       and not private.is_admin()
       and (new.city is distinct from old.city or new.state is distinct from old.state) then
      raise exception 'Choose a supported service location before changing city or state';
    end if;
  else
    selected_city_id := new.city_id;
    selected_area_id := new.area_id;
  end if;

  if selected_area_id is not null and selected_city_id is null then
    raise exception 'An area must belong to a selected city';
  end if;
  if selected_city_id is null then return new; end if;

  if not exists (
    select 1 from public.supported_cities city
    where city.id = selected_city_id and city.is_active
  ) then
    raise exception 'This city is not currently supported by RoyalLagn';
  end if;
  if selected_area_id is not null and not exists (
    select 1 from public.supported_areas area
    where area.id = selected_area_id
      and area.city_id = selected_city_id
      and area.is_active
  ) then
    raise exception 'This area is not active in the selected city';
  end if;

  -- Nested IF so NEW.city / NEW.state are never resolved on profiles /
  -- applications / service-location rows.
  if tg_table_name = 'vendors' then
    if not exists (
      select 1 from public.supported_cities city
      where city.id = selected_city_id
        and lower(btrim(new.city)) = lower(city.name)
        and lower(btrim(new.state)) = lower(city.state)
    ) then
      raise exception 'Vendor city and state must match the managed primary location';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.validate_managed_location_selection()
  from public, anon, authenticated;

commit;
