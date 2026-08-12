begin;

-- Existing vendor profiles may predate the canonical India Post locality
-- selector. They can have a valid PIN and legacy primary area while their
-- geo_pincode_locality_id is still null, which makes them invisible to the
-- PIN/locality public-discovery RPC. Backfill only unambiguous, trusted
-- PIN + area-name matches; anything uncertain remains available for manual
-- verification in VendorEditLocation.
do $$
declare
  candidate record;
begin
  for candidate in
    with matches as (
      select
        vendor.id as vendor_id,
        vendor.pincode,
        min(locality.id::text)::uuid as locality_id,
        count(*) as match_count
      from public.vendors vendor
      join public.supported_areas area
        on area.id = vendor.primary_area_id
      join public.geo_pincode_localities locality
        on locality.pincode = vendor.pincode
       and locality.is_active
       and locality.is_trusted
       and lower(trim(locality.locality_name)) = lower(trim(area.name))
      where vendor.geo_pincode_locality_id is null
        and vendor.pincode ~ '^[1-9][0-9]{5}$'
      group by vendor.id, vendor.pincode
    )
    select vendor_id, pincode, locality_id
    from matches
    where match_count = 1
  loop
    perform private.resolve_vendor_geo_from_pincode(
      candidate.vendor_id,
      candidate.pincode,
      candidate.locality_id
    );
  end loop;
end;
$$;

commit;
