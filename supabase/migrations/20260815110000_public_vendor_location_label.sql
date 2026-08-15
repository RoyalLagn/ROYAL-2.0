begin;

-- Expose only the customer-facing location hierarchy for an approved public
-- vendor. geo_pincode_localities remains protected from broad anonymous reads;
-- this function reveals a single vendor's selected locality and hierarchy only
-- when that vendor is currently eligible for the public marketplace.
create or replace function public.get_public_vendor_location(
  target_vendor_id uuid
)
returns table (
  locality_name text,
  taluka_name text,
  district_name text,
  state_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    locality.locality_name,
    taluka.name as taluka_name,
    district.name as district_name,
    state_row.name as state_name
  from public.vendors vendor
  left join public.geo_pincode_localities locality
    on locality.id = vendor.geo_pincode_locality_id
    and locality.is_active
  left join public.geo_talukas taluka
    on taluka.id = coalesce(locality.taluka_id, vendor.geo_taluka_id)
    and taluka.is_active
  left join public.geo_districts district
    on district.id = coalesce(locality.district_id, taluka.district_id)
    and district.is_active
  left join public.geo_states state_row
    on state_row.id = coalesce(locality.state_id, district.state_id)
    and state_row.is_active
  where vendor.id = target_vendor_id
    and vendor.is_verified
    and coalesce(vendor.public_profile_enabled, true)
    and coalesce(vendor.management_status, 'active') = 'active'
  limit 1;
$$;

revoke all on function public.get_public_vendor_location(uuid) from public;
grant execute on function public.get_public_vendor_location(uuid) to anon, authenticated;

comment on function public.get_public_vendor_location(uuid) is
  'Returns the saved locality/Taluka/District/State label for one approved, active public vendor.';

commit;
