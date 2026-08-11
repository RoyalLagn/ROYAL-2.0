begin;

-- ============================================================================
-- Targeted, low-risk coordinate backfill for public.geo_pincode_localities.
--
-- Scope, deliberately narrow: this ONLY fills latitude/longitude on EXISTING
-- locality rows that are currently missing them. It never inserts a new
-- locality row, never deletes a row, never overwrites a non-null coordinate,
-- and never touches vendors/vendor_applications, geo_pincodes, the Taluka
-- hierarchy, or the get_nearby_vendors RPC. This is intentionally a
-- completely separate code path from public.import_india_post_pincode_batch
-- (20260811120000_india_wide_pincode_localities.sql) -- that function is not
-- modified, patched, or invoked here, and its known NA/malformed-coordinate
-- parsing gap is out of scope for this migration.
--
-- Matching key: (pincode, base office/locality name), where "base name" is
-- the existing normalize_geo_name() collapse *plus* stripping a single
-- trailing India-Post office-type suffix token (S.O / B.O). This is the only
-- normalization difference from normalize_geo_name() -- no other fuzzy
-- matching, no same-PIN fallback to a different office's coordinate (a real
-- CSV row was found during investigation with a ~700km-wrong coordinate for
-- a different office sharing the same PIN, so that kind of fallback is
-- deliberately never implemented).
-- ============================================================================

-- Pure, immutable, no-imports helper (mirrors normalize_geo_name's style) --
-- used only for matching an incoming CSV office name against an existing
-- locality_name; never stored, never changes what's persisted as
-- locality_name/normalized_name.
create or replace function public.geo_office_base_name(value text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select regexp_replace(public.normalize_geo_name(value), '\s+(s o|b o)$', '');
$$;

-- Safe numeric parse: returns null for blank, "NA" (any case), or any other
-- non-numeric text (degree-symbol / DMS strings etc. -- a handful of these
-- exist in the real India Post CSV) instead of raising a cast error.
create or replace function private.geo_try_parse_coordinate(value text)
returns double precision
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  trimmed text := btrim(coalesce(value, ''));
  result double precision;
begin
  if trimmed = '' or upper(trimmed) = 'NA' then
    return null;
  end if;
  begin
    result := trimmed::double precision;
  exception when others then
    return null;
  end;
  return result;
end;
$$;

-- Backfills latitude/longitude on existing geo_pincode_localities rows only.
-- rows: jsonb array of {pincode, officename, latitude, longitude} (same
-- shape produced by scripts/import-india-post-pincodes.mjs's
-- normalizeIndiaPostRow, reused by the companion backfill script). Matching
-- is by (pincode, geo_office_base_name(officename)) against
-- geo_office_base_name(locality_name); ambiguous matches (zero or more than
-- one candidate) are safely skipped rather than guessed.
--
-- p_dry_run: when true, computes and returns the exact same counts the real
-- run would produce, WITHOUT executing any UPDATE -- same code path, so the
-- dry-run report can be trusted to match the real run exactly. Duplicate
-- input rows targeting the same locality within one call are only counted
-- once (tracked via touched_ids), so dry-run counts never double-count.
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
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
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
      -- Already handled by an earlier row in this same batch (duplicate
      -- CSV entry for the same office) -- never double-count, in either
      -- dry-run or real mode.
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
        and latitude is null and longitude is null; -- re-check at write time
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

revoke all on function public.geo_office_base_name(text) from public, anon, authenticated;
grant execute on function public.geo_office_base_name(text) to service_role, authenticated, anon;

commit;
