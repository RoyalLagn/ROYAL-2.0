begin;

-- Near Me must never present a Taluka-centroid approximation as a vendor's
-- physical distance. Track provenance and only publish a point obtained from
-- the selected locality or its canonical PIN cache.
alter table public.vendors
  add column if not exists geo_coordinate_source text;

-- Official India Post directory coordinates already shipped with this
-- repository. Update only exact PIN + office-name matches, never overwrite a
-- coordinate, and retain the locality selection made by the vendor/Admin.
with official(pincode, locality_name, latitude, longitude) as (values
  ('410501', 'Ambethan', 18.7819700::double precision, 73.8178440::double precision),
  ('410501', 'Bahul', 18.7336290, 74.0123850),
  ('410501', 'Bhose', 18.7395660, 73.9154070),
  ('410501', 'Chakan', 18.7610616, 73.8601083),
  ('410501', 'Gadad', 18.9057010, 73.6124100),
  ('410501', 'Kalus', 18.7654590, 73.9168400),
  ('410501', 'Khalumbre', 18.7391750, 73.7801450),
  ('410501', 'Koyali', 18.7074870, 73.9771260),
  ('410501', 'Kuruli', 18.7176410, 73.8463170),
  ('410501', 'Mahalunge Ingale', 18.7496410, 73.8007340),
  ('410501', 'Nighoje', 18.7295340, 73.8190130),
  ('410501', 'Pimpalgaon Tarfe Chakan', 18.6446430, 73.9506770),
  ('410501', 'Rase', 18.7348770, 73.8948300),
  ('410501', 'Shive', 18.7637610, 73.8603310),
  ('410501', 'Vadgaon Ghenanad', 18.7159380, 73.9418600),
  ('410501', 'Vasuli', 18.7753170, 73.7624400),
  ('410501', 'Waki BK', 18.8009220, 73.8918900),
  ('411001', 'C D A (O)', 18.4997500, 73.8782500),
  ('411001', 'Dr.B.A. Chowk', 18.47558333, 73.79619444),
  ('411001', 'Ghorpuri Bazar', 18.52547222, 73.89416667),
  ('411001', 'Pune', 18.52322222, 73.87586111),
  ('411001', 'Pune Cantt East', 18.51152778, 73.88030556),
  ('411001', 'Pune New Bazar', 18.50683333, 73.87988889),
  ('411001', 'Sachapir Street', 18.51394444, 73.87658333)
)
update public.geo_pincode_localities locality
set latitude = official.latitude,
    longitude = official.longitude,
    updated_at = now()
from official
where locality.pincode = official.pincode
  and lower(btrim(locality.locality_name)) = lower(official.locality_name)
  and locality.latitude is null
  and locality.longitude is null;

create or replace function private.resolve_vendor_geo_from_pincode(
  target_vendor_id uuid,
  target_pincode text,
  target_locality_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  pin_row public.geo_pincodes%rowtype;
  locality_row public.geo_pincode_localities%rowtype;
  trusted_count integer := 0;
  hierarchy_resolved boolean := false;
  resolved_lat double precision;
  resolved_lng double precision;
  coordinate_source text;
begin
  if target_pincode ~ '^[1-9][0-9]{5}$' then
    select * into pin_row from public.geo_pincodes where pincode = target_pincode;
  end if;

  if target_locality_id is not null then
    select * into locality_row from public.geo_pincode_localities
    where id = target_locality_id and pincode = target_pincode and is_active;
    if not found then raise exception 'The selected locality does not belong to this PIN code'; end if;
  else
    select count(*) into trusted_count
    from public.geo_pincode_localities
    where pincode = target_pincode and is_active and is_trusted;
    if trusted_count = 1 then
      select * into locality_row from public.geo_pincode_localities
      where pincode = target_pincode and is_active and is_trusted limit 1;
    end if;
  end if;

  hierarchy_resolved := locality_row.id is not null
    and locality_row.is_trusted
    and locality_row.state_id is not null
    and locality_row.district_id is not null
    and locality_row.taluka_id is not null;

  if not hierarchy_resolved and pin_row.source = 'admin_verified'
      and pin_row.resolution_status = 'resolved' and not pin_row.ambiguous then
    hierarchy_resolved := true;
  end if;

  if hierarchy_resolved and locality_row.latitude is not null and locality_row.longitude is not null then
    resolved_lat := locality_row.latitude;
    resolved_lng := locality_row.longitude;
    coordinate_source := 'locality';
  elsif hierarchy_resolved and pin_row.latitude is not null and pin_row.longitude is not null then
    resolved_lat := pin_row.latitude;
    resolved_lng := pin_row.longitude;
    coordinate_source := 'pincode';
  end if;

  update public.vendors
  set geo_pincode_locality_id = case when locality_row.id is not null then locality_row.id else null end,
      geo_state_id = case when hierarchy_resolved then coalesce(locality_row.state_id, pin_row.state_id) else null end,
      geo_district_id = case when hierarchy_resolved then coalesce(locality_row.district_id, pin_row.district_id) else null end,
      geo_taluka_id = case when hierarchy_resolved then coalesce(locality_row.taluka_id, pin_row.taluka_id) else null end,
      geo_latitude = resolved_lat,
      geo_longitude = resolved_lng,
      geo_coordinate_source = coordinate_source,
      geo_resolution_status = case
        when hierarchy_resolved and coordinate_source is not null then 'resolved'
        when hierarchy_resolved then 'needs_review'
        when pin_row.pincode is null then 'unresolved'
        else 'needs_review'
      end,
      geo_review_reason = case
        when hierarchy_resolved and coordinate_source is null
          then 'The hierarchy is resolved but this exact locality/PIN has no verified coordinates for Near Me.'
        when hierarchy_resolved then null
        when pin_row.pincode is null then 'PIN code is not present in the canonical India Post dataset or does not match a selected locality.'
        when trusted_count > 1 and target_locality_id is null then 'Choose the post office/locality that matches the business address.'
        when locality_row.id is not null and not locality_row.is_trusted then 'The selected locality is an unofficial candidate awaiting Admin confirmation.'
        when locality_row.id is not null and locality_row.taluka_id is null then 'The selected locality has not been reconciled to a canonical Taluka.'
        else 'The PIN code hierarchy requires Admin review.'
      end,
      geo_resolved_at = now()
  where id = target_vendor_id;
end;
$$;

revoke all on function private.resolve_vendor_geo_from_pincode(uuid, text, uuid)
  from public, anon, authenticated;

-- Re-resolve every vendor so stale Taluka-centroid points disappear and
-- exact locality points become active immediately.
do $$
declare vendor_row record;
begin
  for vendor_row in
    select id, pincode, geo_pincode_locality_id
    from public.vendors
    where pincode ~ '^[1-9][0-9]{5}$'
  loop
    perform private.resolve_vendor_geo_from_pincode(
      vendor_row.id, vendor_row.pincode, vendor_row.geo_pincode_locality_id
    );
  end loop;
end;
$$;

commit;
