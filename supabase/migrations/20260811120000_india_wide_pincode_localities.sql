begin;

-- Generic India-wide PIN -> Post Office/Locality -> Taluka -> District ->
-- State resolution. No PIN or place names are embedded in this migration.
-- Official Department of Posts rows are imported through the restricted
-- batch RPC below; live providers may add candidates but cannot mark them
-- trusted unless their source is explicitly authoritative.

create or replace function public.normalize_geo_name(value text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select trim(regexp_replace(lower(coalesce(value, '')), '[^a-z0-9]+', ' ', 'g'));
$$;

create table public.geo_pincode_localities (
  id uuid primary key default gen_random_uuid(),
  pincode text not null references public.geo_pincodes(pincode) on delete cascade,
  locality_name text not null,
  normalized_name text not null,
  office_type text,
  delivery_status text,
  state_id uuid references public.geo_states(id) on delete restrict,
  district_id uuid references public.geo_districts(id) on delete restrict,
  taluka_id uuid references public.geo_talukas(id) on delete restrict,
  latitude double precision,
  longitude double precision,
  source text not null,
  source_trust smallint not null default 0,
  is_trusted boolean not null default false,
  admin_confirmed boolean not null default false,
  is_active boolean not null default true,
  raw_response jsonb not null default '{}'::jsonb,
  verified_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint geo_pincode_localities_pin_format check (pincode ~ '^[1-9][0-9]{5}$'),
  constraint geo_pincode_localities_name_not_blank check (btrim(locality_name) <> ''),
  constraint geo_pincode_localities_normalized_not_blank check (btrim(normalized_name) <> ''),
  constraint geo_pincode_localities_trust_range check (source_trust between 0 and 4),
  constraint geo_pincode_localities_lat_range check (latitude is null or latitude between -90 and 90),
  constraint geo_pincode_localities_lng_range check (longitude is null or longitude between -180 and 180)
);

create unique index geo_pincode_localities_pin_name_unique_idx
  on public.geo_pincode_localities(pincode, normalized_name);
create index geo_pincode_localities_pin_active_idx
  on public.geo_pincode_localities(pincode, is_active, is_trusted, locality_name);
create index geo_pincode_localities_taluka_idx
  on public.geo_pincode_localities(taluka_id) where taluka_id is not null;

create trigger geo_pincode_localities_set_updated_at
before update on public.geo_pincode_localities
for each row execute function private.set_updated_at();

alter table public.geo_pincodes
  add column if not exists locality_count integer not null default 0,
  add column if not exists trusted_locality_count integer not null default 0,
  add column if not exists locality_selection_required boolean not null default false;

alter table public.vendors
  add column if not exists geo_pincode_locality_id uuid
    references public.geo_pincode_localities(id) on delete set null;
alter table public.vendor_applications
  add column if not exists geo_pincode_locality_id uuid
    references public.geo_pincode_localities(id) on delete set null;

create index vendors_geo_pincode_locality_idx
  on public.vendors(geo_pincode_locality_id) where geo_pincode_locality_id is not null;
create index vendor_applications_geo_pincode_locality_idx
  on public.vendor_applications(geo_pincode_locality_id) where geo_pincode_locality_id is not null;

alter table public.geo_pincode_localities enable row level security;
revoke all on public.geo_pincode_localities from anon, authenticated;
grant select, insert, update, delete on public.geo_pincode_localities to authenticated;
grant select, insert, update, delete on public.geo_pincode_localities to service_role;
create policy geo_pincode_localities_admin_all
on public.geo_pincode_localities for all to authenticated
using (private.is_admin()) with check (private.is_admin());

-- Recompute the PIN aggregate without choosing one locality. A unique
-- trusted hierarchy can be canonical even when the vendor still needs to
-- choose among multiple post offices in that hierarchy.
create or replace function private.refresh_geo_pincode_aggregate(target_pincode text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  total_count integer;
  trusted_count integer;
  distinct_states integer;
  distinct_districts integer;
  distinct_talukas integer;
  selected_state uuid;
  selected_district uuid;
  selected_taluka uuid;
  only_locality text;
begin
  select
    count(*) filter (where is_active),
    count(*) filter (where is_active and is_trusted),
    count(distinct state_id) filter (where is_active and is_trusted and state_id is not null),
    count(distinct district_id) filter (where is_active and is_trusted and district_id is not null),
    count(distinct taluka_id) filter (where is_active and is_trusted and taluka_id is not null),
    (min(state_id::text) filter (where is_active and is_trusted))::uuid,
    (min(district_id::text) filter (where is_active and is_trusted))::uuid,
    (min(taluka_id::text) filter (where is_active and is_trusted))::uuid,
    min(locality_name) filter (where is_active and is_trusted)
  into total_count, trusted_count, distinct_states, distinct_districts,
       distinct_talukas, selected_state, selected_district, selected_taluka,
       only_locality
  from public.geo_pincode_localities
  where pincode = target_pincode;

  update public.geo_pincodes pin
  set locality_count = coalesce(total_count, 0),
      trusted_locality_count = coalesce(trusted_count, 0),
      locality_selection_required = coalesce(trusted_count, 0) > 1,
      state_id = case when distinct_states = 1 then selected_state else pin.state_id end,
      district_id = case when distinct_districts = 1 then selected_district else pin.district_id end,
      taluka_id = case when distinct_talukas = 1 then selected_taluka else null end,
      area = case when trusted_count = 1 then only_locality else null end,
      office_name = case when trusted_count = 1 then only_locality else null end,
      resolution_status = case
        when trusted_count > 0 and distinct_states = 1
          and distinct_districts = 1 and distinct_talukas = 1 then 'resolved'
        when total_count > 0 then 'needs_review'
        else 'unresolved'
      end,
      ambiguous = distinct_talukas > 1,
      verified_at = now()
  where pin.pincode = target_pincode
    and pin.source <> 'admin_verified';
end;
$$;

revoke all on function private.refresh_geo_pincode_aggregate(text)
  from public, anon, authenticated;

-- Import one bounded batch from the official India Post/OGD directory.
-- Expected JSON fields are pincode, officename, officetype, deliverystatus,
-- taluk, districtname, statename, latitude and longitude. Alternate current
-- field spellings are accepted by the importer script before this RPC.
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
      if not found then
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
        taluka_id = case when geo_pincode_localities.admin_confirmed then geo_pincode_localities.taluka_id else excluded.taluka_id end,
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

-- Resolve a vendor from a selected locality. With no selection, exactly one
-- trusted locality is selected automatically; multiple trusted localities
-- require an explicit vendor choice. Admin-confirmed PIN-level mappings
-- remain a supported higher-precedence fallback.
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
  is_resolved boolean := false;
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

  is_resolved := locality_row.id is not null
    and locality_row.is_trusted
    and locality_row.state_id is not null
    and locality_row.district_id is not null
    and locality_row.taluka_id is not null;

  if not is_resolved and pin_row.source = 'admin_verified'
      and pin_row.resolution_status = 'resolved' and not pin_row.ambiguous then
    is_resolved := true;
  end if;

  update public.vendors
  set geo_pincode_locality_id = case when locality_row.id is not null then locality_row.id else null end,
      geo_state_id = case when is_resolved then coalesce(locality_row.state_id, pin_row.state_id) else null end,
      geo_district_id = case when is_resolved then coalesce(locality_row.district_id, pin_row.district_id) else null end,
      geo_taluka_id = case when is_resolved then coalesce(locality_row.taluka_id, pin_row.taluka_id) else null end,
      geo_latitude = case when is_resolved then coalesce(locality_row.latitude, pin_row.latitude) else null end,
      geo_longitude = case when is_resolved then coalesce(locality_row.longitude, pin_row.longitude) else null end,
      geo_resolution_status = case
        when is_resolved then 'resolved'
        when pin_row.pincode is null then 'unresolved'
        else 'needs_review'
      end,
      geo_review_reason = case
        when is_resolved then null
        when pin_row.pincode is null then 'PIN code is not present in the canonical India Post dataset.'
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

create or replace function private.resolve_vendor_geo_from_pincode(
  target_vendor_id uuid,
  target_pincode text
)
returns void language sql security definer set search_path = ''
as $$ select private.resolve_vendor_geo_from_pincode(target_vendor_id, target_pincode, null); $$;

drop function if exists public.replace_vendor_service_locations(uuid, uuid, uuid, uuid[], text);
create function public.replace_vendor_service_locations(
  target_vendor_id uuid,
  target_primary_city_id uuid,
  target_primary_area_id uuid default null,
  target_service_area_ids uuid[] default array[]::uuid[],
  target_pincode text default null,
  target_geo_locality_id uuid default null
)
returns setof public.vendor_service_locations
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_city public.supported_cities%rowtype;
  selected_area_id uuid;
  effective_pincode text;
begin
  if not private.owns_vendor(target_vendor_id) and not private.is_admin() then
    raise exception 'You cannot manage service locations for this Vendor';
  end if;
  if target_pincode is not null and target_pincode !~ '^[1-9][0-9]{5}$' then
    raise exception 'Enter a valid six-digit Indian PIN code';
  end if;
  if target_primary_city_id is not null then
    select * into selected_city from public.supported_cities
    where id = target_primary_city_id and is_active;
    if not found then raise exception 'This city is not currently supported by RoyalLagn'; end if;
  end if;

  if target_primary_city_id is null and (
    target_primary_area_id is not null or cardinality(coalesce(target_service_area_ids, array[]::uuid[])) > 0
  ) then raise exception 'Service areas require a supported primary city'; end if;
  if target_primary_area_id is not null and not exists (
    select 1 from public.supported_areas where id = target_primary_area_id
      and city_id = target_primary_city_id and is_active
  ) then raise exception 'The primary area is not active in the selected city'; end if;
  foreach selected_area_id in array coalesce(target_service_area_ids, array[]::uuid[])
  loop
    if not exists (
      select 1 from public.supported_areas where id = selected_area_id
        and city_id = target_primary_city_id and is_active
    ) then raise exception 'A selected service area is not active in the primary city'; end if;
  end loop;

  delete from public.vendor_service_locations where vendor_id = target_vendor_id;
  if target_primary_city_id is not null then
    insert into public.vendor_service_locations(vendor_id, city_id, area_id, pincode, is_primary)
    values (target_vendor_id, target_primary_city_id, target_primary_area_id, nullif(target_pincode, ''), true);
    insert into public.vendor_service_locations(vendor_id, city_id, area_id, is_primary)
    select target_vendor_id, target_primary_city_id, area_id, false
    from unnest(coalesce(target_service_area_ids, array[]::uuid[])) area_id
    where area_id is distinct from target_primary_area_id on conflict do nothing;
  end if;

  update public.vendors
  set primary_city_id = target_primary_city_id,
      primary_area_id = target_primary_area_id,
      city = case when target_primary_city_id is not null then selected_city.name else city end,
      state = case when target_primary_city_id is not null then selected_city.state else state end,
      pincode = coalesce(nullif(target_pincode, ''), pincode)
  where id = target_vendor_id returning pincode into effective_pincode;

  perform private.resolve_vendor_geo_from_pincode(
    target_vendor_id, effective_pincode, target_geo_locality_id
  );
  return query select * from public.vendor_service_locations
    where vendor_id = target_vendor_id order by is_primary desc, created_at;
end;
$$;

revoke all on function public.replace_vendor_service_locations(uuid, uuid, uuid, uuid[], text, uuid)
  from public, anon;
grant execute on function public.replace_vendor_service_locations(uuid, uuid, uuid, uuid[], text, uuid)
  to authenticated;

create or replace function public.apply_vendor_geo_pincode(
  target_vendor_id uuid,
  target_pincode text,
  target_geo_locality_id uuid
)
returns public.vendors
language plpgsql
security definer
set search_path = ''
as $$
declare updated public.vendors%rowtype;
begin
  if not (private.owns_vendor(target_vendor_id) or private.is_admin()) then
    raise exception 'You cannot manage location for this Vendor';
  end if;
  if target_pincode !~ '^[1-9][0-9]{5}$' then
    raise exception 'Enter a valid six-digit Indian PIN code';
  end if;
  update public.vendors set pincode = target_pincode where id = target_vendor_id;
  if not found then raise exception 'Vendor not found'; end if;
  perform private.resolve_vendor_geo_from_pincode(target_vendor_id, target_pincode, target_geo_locality_id);
  select * into updated from public.vendors where id = target_vendor_id;
  return updated;
end;
$$;

revoke all on function public.apply_vendor_geo_pincode(uuid, text, uuid) from public, anon;
grant execute on function public.apply_vendor_geo_pincode(uuid, text, uuid) to authenticated;

create or replace function public.apply_vendor_geo_pincode(
  target_vendor_id uuid,
  target_pincode text
)
returns public.vendors language sql security definer set search_path = ''
as $$ select public.apply_vendor_geo_pincode(target_vendor_id, target_pincode, null); $$;
revoke all on function public.apply_vendor_geo_pincode(uuid, text) from public, anon;
grant execute on function public.apply_vendor_geo_pincode(uuid, text) to authenticated;

create or replace function private.sync_approved_vendor_location()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare application public.vendor_applications%rowtype;
begin
  if new.application_id is null then return new; end if;
  select * into application from public.vendor_applications where id = new.application_id;
  if application.city_id is not null then
    update public.vendors set primary_city_id = application.city_id,
      primary_area_id = application.area_id where id = new.id;
    insert into public.vendor_service_locations(vendor_id, city_id, area_id, pincode, is_primary)
    values (new.id, application.city_id, application.area_id, application.pincode, true)
    on conflict do nothing;
    insert into public.vendor_service_locations(vendor_id, city_id, area_id, is_primary)
    select new.id, application.city_id, service_area_id, false
    from unnest(coalesce(application.service_area_ids, array[]::uuid[])) service_area_id
    where service_area_id is distinct from application.area_id on conflict do nothing;
  end if;
  if application.pincode ~ '^[1-9][0-9]{5}$' then
    perform private.resolve_vendor_geo_from_pincode(
      new.id, application.pincode, application.geo_pincode_locality_id
    );
  end if;
  return new;
end;
$$;

commit;
