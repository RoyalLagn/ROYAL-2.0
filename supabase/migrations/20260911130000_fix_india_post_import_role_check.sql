-- Supabase's current PostgREST request context reliably exposes the JWT role
-- through auth.role(). The earlier request.jwt.claim.role setting is absent
-- for service-key RPC requests, which incorrectly blocked the trusted batch
-- importer even when invoked with the service-role key.
create or replace function public.import_india_post_pincode_batch(rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
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
  if auth.role() <> 'service_role' then
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
        source = case when geo_pincode_localities.admin_confirmed then geo_pincode_localities.source else excluded.source end,
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
$function$;

revoke all on function public.import_india_post_pincode_batch(jsonb)
  from public, anon, authenticated;
grant execute on function public.import_india_post_pincode_batch(jsonb) to service_role;
