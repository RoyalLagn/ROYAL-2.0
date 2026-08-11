begin;

-- Fix: the service-role gate in public.backfill_geo_pincode_locality_coordinates
-- (20260812010000) checked current_setting('request.jwt.claim.role', true),
-- which depends on PostgREST's legacy per-claim GUC exploding and doesn't
-- resolve on this project. Switch to auth.role(), the same check already
-- used successfully elsewhere in this codebase (see
-- 20260810090000_vendor_registration_control.sql:97). No other behavior
-- changes; the function body, matching logic, and safety guarantees are
-- unchanged.
create or replace function public.backfill_geo_pincode_locality_coordinates(
  rows jsonb,
  p_dry_run boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  item jsonb;
  pin text;
  office_name text;
  base_name text;
  src_lat double precision;
  src_lng double precision;
  candidate_ids uuid[];
  target_id uuid;
  existing_lat double precision;
  existing_lng double precision;
  touched_ids uuid[] := '{}';
  rows_scanned integer := 0;
  rows_matched integer := 0;
  rows_updated integer := 0;
  rows_skipped_already_set integer := 0;
  rows_skipped_invalid_source integer := 0;
  rows_not_matched integer := 0;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required for the coordinate backfill';
  end if;
  if jsonb_typeof(rows) <> 'array' or jsonb_array_length(rows) > 1000 then
    raise exception 'Backfill rows must be a JSON array of at most 1000 records';
  end if;

  for item in select value from jsonb_array_elements(rows)
  loop
    rows_scanned := rows_scanned + 1;
    pin := btrim(item->>'pincode');
    office_name := btrim(item->>'officename');
    if pin !~ '^[1-9][0-9]{5}$' or office_name = '' then
      rows_not_matched := rows_not_matched + 1;
      continue;
    end if;

    base_name := public.geo_office_base_name(office_name);

    select array_agg(id) into candidate_ids
    from public.geo_pincode_localities
    where pincode = pin
      and public.geo_office_base_name(locality_name) = base_name;

    if candidate_ids is null or array_length(candidate_ids, 1) <> 1 then
      rows_not_matched := rows_not_matched + 1;
      continue;
    end if;

    target_id := candidate_ids[1];
    rows_matched := rows_matched + 1;

    src_lat := private.geo_try_parse_coordinate(item->>'latitude');
    src_lng := private.geo_try_parse_coordinate(item->>'longitude');
    if src_lat is null or src_lng is null then
      rows_skipped_invalid_source := rows_skipped_invalid_source + 1;
      continue;
    end if;

    if target_id = any (touched_ids) then
      rows_skipped_already_set := rows_skipped_already_set + 1;
      continue;
    end if;

    select latitude, longitude into existing_lat, existing_lng
    from public.geo_pincode_localities where id = target_id;

    if existing_lat is not null or existing_lng is not null then
      rows_skipped_already_set := rows_skipped_already_set + 1;
      continue;
    end if;

    rows_updated := rows_updated + 1;
    touched_ids := array_append(touched_ids, target_id);

    if not p_dry_run then
      update public.geo_pincode_localities
      set latitude = src_lat, longitude = src_lng
      where id = target_id
        and latitude is null and longitude is null;
    end if;
  end loop;

  return jsonb_build_object(
    'dry_run', p_dry_run,
    'rows_scanned', rows_scanned,
    'rows_matched', rows_matched,
    'rows_updated', rows_updated,
    'rows_skipped_already_set', rows_skipped_already_set,
    'rows_skipped_invalid_source', rows_skipped_invalid_source,
    'rows_not_matched', rows_not_matched,
    'rows_inserted', 0,
    'rows_deleted', 0
  );
end;
$$;

revoke all on function public.backfill_geo_pincode_locality_coordinates(jsonb, boolean)
  from public, anon, authenticated;
grant execute on function public.backfill_geo_pincode_locality_coordinates(jsonb, boolean) to service_role;

commit;
