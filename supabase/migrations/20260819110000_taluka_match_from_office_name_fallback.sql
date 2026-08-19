begin;

-- ============================================================================
-- Root cause of "many Talukas can't be signed up in even when their toggle
-- is ON" (Indapur and others): the official India Post import
-- (import_india_post_pincode_batch) only ever assigns a locality's Taluka
-- from an explicit `taluk`/`block` source field. For a large share of real
-- offices that field arrives blank from the source data (common for Sub/
-- Branch Post Offices, which is most offices) even though the office's OWN
-- name literally names its Taluka -- e.g. "Indapur S.O." / "Indapur Bazar
-- S.O." under PIN 413106 came in trusted (official source) but with
-- taluka_id = null, because the row's `taluk` field was empty. Since the PIN
-- as a whole then had zero resolved Talukas, it stayed "unresolved" even
-- though Indapur's own headquarters office is right there under that PIN.
--
-- Fix: when the explicit taluk field is blank, fall back to matching the
-- office name itself (with the standard Indian postal designator suffix --
-- "S.O.", "B.O.", "H.O.", "G.P.O.", or the spelled-out forms -- stripped)
-- against the District's known Taluka names/aliases. This only ever assigns
-- a Taluka when the office's own name equals a real Taluka name/alias in
-- the SAME District -- generic pattern matching, never a hardcoded PIN or
-- Taluka name, and never invents a Taluka that wasn't already imported.
-- A B.O./S.O. named after its own *village* (not the Taluka headquarters)
-- still correctly gets no direct match here -- it inherits the Taluka via
-- the existing PIN-level aggregate once at least one office under the same
-- PIN resolves (see private.refresh_geo_pincode_aggregate), same as any
-- other single-Taluka PIN.
-- ============================================================================
create or replace function private.strip_post_office_suffix(value text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select trim(regexp_replace(
    coalesce(value, ''),
    '\s*[\(\[]?\b(S\.?\s*O\.?|B\.?\s*O\.?|H\.?\s*O\.?|G\.?\s*P\.?\s*O\.?|Sub\s+Post\s+Office|Branch\s+Post\s+Office|Head\s+Post\s+Office|Sub\s+Office|Branch\s+Office|Head\s+Office)\b[\)\]]?\s*$',
    '',
    'gi'
  ));
$$;

revoke all on function private.strip_post_office_suffix(text) from public, anon, authenticated;

-- One-time backfill for localities already imported with no Taluka.
-- Scoped to the same District as the Taluka being matched, so it can never
-- assign a Taluka from a different District, and only touches rows that
-- currently have no Taluka at all (never overwrites an existing match, and
-- never touches an admin_confirmed row).
create temporary table _office_name_taluka_backfill_touched (pincode text) on commit drop;

with matches as (
  select loc.id as locality_id, t.id as taluka_id, loc.pincode
  from public.geo_pincode_localities loc
  join public.geo_talukas t
    on t.district_id = loc.district_id
   and (
     public.normalize_geo_name(private.strip_post_office_suffix(loc.locality_name)) = public.normalize_geo_name(t.name)
     or exists (
       select 1 from unnest(t.aliases) alias
       where public.normalize_geo_name(private.strip_post_office_suffix(loc.locality_name)) = public.normalize_geo_name(alias)
     )
   )
  where loc.taluka_id is null
    and loc.district_id is not null
    and not loc.admin_confirmed
),
updated as (
  update public.geo_pincode_localities loc
  set taluka_id = matches.taluka_id,
      updated_at = now()
  from matches
  where loc.id = matches.locality_id
  returning matches.pincode
)
insert into _office_name_taluka_backfill_touched (pincode)
select distinct pincode from updated;

-- Re-derive the PIN-level aggregate (resolution_status/taluka_id/ambiguous)
-- for exactly the PINs the backfill above actually touched.
do $$
declare touched_pincode text;
begin
  for touched_pincode in select pincode from _office_name_taluka_backfill_touched
  loop
    perform private.refresh_geo_pincode_aggregate(touched_pincode);
  end loop;
end $$;

-- Apply the same fallback going forward, so future official-import batches
-- don't reproduce the gap for a Taluka's own headquarters office.
create or replace function public.import_india_post_pincode_batch(rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  item jsonb;
  pin text;
  state_name text;
  district_name text;
  taluka_name text;
  office_name text;
  state_row public.geo_states%rowtype;
  district_row public.geo_districts%rowtype;
  taluka_row public.geo_talukas%rowtype;
  touched_pins text[] := '{}';
  imported integer := 0;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'Service role required for official PIN import';
  end if;
  if jsonb_typeof(rows) <> 'array' or jsonb_array_length(rows) > 1000 then
    raise exception 'Import rows must be a JSON array of at most 1000 records';
  end if;

  for item in select value from jsonb_array_elements(rows)
  loop
    pin := btrim(item->>'pincode');
    state_name := btrim(item->>'statename');
    district_name := btrim(item->>'districtname');
    taluka_name := btrim(item->>'taluk');
    office_name := btrim(item->>'officename');
    if pin !~ '^[1-9][0-9]{5}$' or state_name = '' or district_name = '' or office_name = '' then
      continue;
    end if;

    select * into state_row from public.geo_states
    where public.normalize_geo_name(name) = public.normalize_geo_name(state_name)
    limit 1;
    if not found then
      insert into public.geo_states(name, code, country, is_active)
      values (state_name, 'POST-' || upper(substr(md5(public.normalize_geo_name(state_name)), 1, 8)), 'India', true)
      returning * into state_row;
    end if;

    select * into district_row from public.geo_districts
    where state_id = state_row.id
      and public.normalize_geo_name(name) = public.normalize_geo_name(district_name)
    limit 1;
    if not found then
      insert into public.geo_districts(state_id, name, is_active)
      values (state_row.id, district_name, true)
      returning * into district_row;
    end if;

    taluka_row := null;
    if taluka_name <> '' then
      select * into taluka_row from public.geo_talukas
      where district_id = district_row.id
        and (
          public.normalize_geo_name(name) = public.normalize_geo_name(taluka_name)
          or exists (
            select 1 from unnest(aliases) alias
            where public.normalize_geo_name(alias) = public.normalize_geo_name(taluka_name)
          )
        )
      limit 1;
    end if;
    -- Fallback: the explicit taluk/block field was blank, but this office's
    -- own name (its Taluka headquarters office, e.g. "Indapur S.O.") may
    -- directly name a real, already-imported Taluka in this District.
    if taluka_row.id is null then
      select * into taluka_row from public.geo_talukas
      where district_id = district_row.id
        and (
          public.normalize_geo_name(private.strip_post_office_suffix(office_name)) = public.normalize_geo_name(name)
          or exists (
            select 1 from unnest(aliases) alias
            where public.normalize_geo_name(private.strip_post_office_suffix(office_name)) = public.normalize_geo_name(alias)
          )
        )
      limit 1;
    end if;
    if taluka_row.id is null and taluka_name <> '' then
      insert into public.geo_talukas(
        district_id, name, aliases, is_active,
        source_name, source_url, source_version, coordinate_source,
        coordinate_method, verification_status
      ) values (
        district_row.id, taluka_name, '{}'::text[], true,
        'India Post / Open Government Data Platform India',
        'https://www.data.gov.in/catalog/all-india-pincode-directory-through-webservice',
        'monthly official import',
        'India Post OGD hierarchy import (no centroid supplied)',
        null, 'awaiting_lgd_verification'
      ) returning * into taluka_row;
    end if;

    insert into public.geo_pincodes(
      pincode, state_id, district_id, taluka_id, resolution_status,
      ambiguous, source, raw_response, verified_at
    ) values (
      pin, state_row.id, district_row.id, taluka_row.id,
      case when taluka_row.id is null then 'needs_review' else 'resolved' end,
      false, 'india_post_ogd', jsonb_build_object('imported_record', item), now()
    )
    on conflict (pincode) do update
    set state_id = excluded.state_id,
        district_id = excluded.district_id,
        taluka_id = excluded.taluka_id,
        resolution_status = excluded.resolution_status,
        ambiguous = false,
        source = 'india_post_ogd',
        raw_response = excluded.raw_response,
        verified_at = excluded.verified_at
    where geo_pincodes.source not in ('admin_verified');

    insert into public.geo_pincode_localities(
      pincode, locality_name, normalized_name, office_type, delivery_status,
      state_id, district_id, taluka_id, latitude, longitude,
      source, source_trust, is_trusted, raw_response, verified_at
    ) values (
      pin, office_name, public.normalize_geo_name(office_name),
      nullif(item->>'officetype', ''), nullif(item->>'deliverystatus', ''),
      state_row.id, district_row.id, taluka_row.id,
      nullif(item->>'latitude', '')::double precision,
      nullif(item->>'longitude', '')::double precision,
      'india_post_ogd', 3, true, item, now()
    )
    on conflict (pincode, normalized_name) do update
    set locality_name = case when geo_pincode_localities.admin_confirmed then geo_pincode_localities.locality_name else excluded.locality_name end,
        office_type = case when geo_pincode_localities.admin_confirmed then geo_pincode_localities.office_type else excluded.office_type end,
        delivery_status = case when geo_pincode_localities.admin_confirmed then geo_pincode_localities.delivery_status else excluded.delivery_status end,
        state_id = case when geo_pincode_localities.admin_confirmed then geo_pincode_localities.state_id else excluded.state_id end,
        district_id = case when geo_pincode_localities.admin_confirmed then geo_pincode_localities.district_id else excluded.district_id end,
        taluka_id = case
          when geo_pincode_localities.admin_confirmed then geo_pincode_localities.taluka_id
          when geo_pincode_localities.taluka_id is not null then geo_pincode_localities.taluka_id
          else excluded.taluka_id
        end,
        latitude = case when geo_pincode_localities.admin_confirmed then geo_pincode_localities.latitude else excluded.latitude end,
        longitude = case when geo_pincode_localities.admin_confirmed then geo_pincode_localities.longitude else excluded.longitude end,
        source = case
          when geo_pincode_localities.admin_confirmed then geo_pincode_localities.source
          else excluded.source
        end,
        source_trust = greatest(geo_pincode_localities.source_trust, excluded.source_trust),
        is_trusted = geo_pincode_localities.is_trusted or excluded.is_trusted,
        raw_response = case when geo_pincode_localities.admin_confirmed then geo_pincode_localities.raw_response else excluded.raw_response end,
        verified_at = excluded.verified_at;

    touched_pins := array_append(touched_pins, pin);
    imported := imported + 1;
  end loop;

  for pin in select distinct value from unnest(touched_pins) value
  loop
    perform private.refresh_geo_pincode_aggregate(pin);
  end loop;

  return jsonb_build_object(
    'records_imported', imported,
    'pincodes_refreshed', (select count(distinct value) from unnest(touched_pins) value)
  );
end;
$$;

revoke all on function public.import_india_post_pincode_batch(jsonb)
  from public, anon, authenticated;
grant execute on function public.import_india_post_pincode_batch(jsonb) to service_role;

commit;
