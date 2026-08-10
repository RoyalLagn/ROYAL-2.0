begin;

-- Extends the existing vendor-approval sync (private.sync_approved_vendor_location,
-- from 20260720100000_create_marketplace_schema.sql) to also enrich the new
-- geo hierarchy columns from the geo_pincodes cache, if the application's PIN
-- was already resolved (e.g. the applicant used the PIN lookup during
-- onboarding). This never guesses: a vendor is only marked "resolved" when a
-- cached, unambiguous Taluka match already exists; otherwise it is left as
-- "needs_review" for Admin, matching apply_vendor_geo_pincode's behaviour.
create or replace function private.sync_approved_vendor_location()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  application public.vendor_applications%rowtype;
  cached_pin public.geo_pincodes%rowtype;
begin
  if new.application_id is null then return new; end if;
  select * into application from public.vendor_applications where id = new.application_id;
  if application.city_id is null then return new; end if;

  update public.vendors
  set primary_city_id = application.city_id,
      primary_area_id = application.area_id
  where id = new.id;

  insert into public.vendor_service_locations (
    vendor_id, city_id, area_id, pincode, is_primary
  ) values (
    new.id, application.city_id, application.area_id, application.pincode, true
  )
  on conflict do nothing;
  insert into public.vendor_service_locations (
    vendor_id, city_id, area_id, is_primary
  )
  select new.id, application.city_id, service_area_id, false
  from unnest(coalesce(application.service_area_ids, array[]::uuid[])) service_area_id
  where service_area_id is distinct from application.area_id
  on conflict do nothing;

  if application.pincode ~ '^[1-9][0-9]{5}$' then
    select * into cached_pin from public.geo_pincodes where pincode = application.pincode;
    update public.vendors
    set geo_state_id = cached_pin.state_id,
        geo_district_id = cached_pin.district_id,
        geo_taluka_id = cached_pin.taluka_id,
        geo_latitude = cached_pin.latitude,
        geo_longitude = cached_pin.longitude,
        geo_resolution_status = case
          when found and cached_pin.taluka_id is not null and not cached_pin.ambiguous then 'resolved'
          when found then 'needs_review'
          else 'unresolved'
        end,
        geo_resolved_at = now()
    where id = new.id;
  end if;

  return new;
end;
$$;

commit;
