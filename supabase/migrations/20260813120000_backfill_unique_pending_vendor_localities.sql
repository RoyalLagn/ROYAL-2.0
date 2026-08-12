begin;

-- The public PIN selector intentionally includes active fallback localities
-- while their hierarchy awaits Admin review. Existing vendors with the same
-- exact PIN + legacy primary-area name should therefore be discoverable in
-- those results too. Link only a unique exact match; the resolver preserves
-- needs_review for untrusted candidates instead of marking them verified.
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
