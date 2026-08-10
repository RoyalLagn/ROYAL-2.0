begin;

-- ============================================================================
-- Functions powering the State -> District -> Taluka discovery flow:
--   1. apply_vendor_geo_pincode   – enrich a vendor from the geo_pincodes cache
--   2. rebuild_taluka_neighbors   – auto-generate nearby-Taluka ordering from
--                                   centroid geography distance (no manual
--                                   Admin-authored adjacency required)
--   3. get_public_vendor_taluka_page – tiered, paginated public vendor query:
--                                   selected Taluka first, then nearby Talukas
--                                   in the generated proximity order
--   4. get_geo_admin_overview / list_unmapped_vendor_pincodes – Admin tools
-- ============================================================================

create or replace function public.apply_vendor_geo_pincode(
  target_vendor_id uuid,
  target_pincode text
)
returns public.vendors
language plpgsql
security definer
set search_path = ''
as $$
declare
  cached public.geo_pincodes%rowtype;
  updated public.vendors%rowtype;
begin
  if not (private.owns_vendor(target_vendor_id) or private.is_admin()) then
    raise exception 'You cannot manage location for this Vendor';
  end if;
  if target_pincode !~ '^[1-9][0-9]{5}$' then
    raise exception 'Enter a valid six-digit Indian PIN code';
  end if;

  select * into cached from public.geo_pincodes where pincode = target_pincode;

  if not found then
    -- No cached resolution yet (lookup-india-pincode has not resolved this
    -- PIN against the imported geo hierarchy). Keep the vendor's own PIN but
    -- flag the location as needing review rather than guessing.
    update public.vendors
    set pincode = target_pincode,
        geo_state_id = null,
        geo_district_id = null,
        geo_taluka_id = null,
        geo_latitude = null,
        geo_longitude = null,
        geo_resolution_status = 'unresolved',
        geo_resolved_at = now()
    where id = target_vendor_id
    returning * into updated;
    if not found then raise exception 'Vendor not found'; end if;
    return updated;
  end if;

  update public.vendors
  set pincode = target_pincode,
      geo_state_id = cached.state_id,
      geo_district_id = cached.district_id,
      geo_taluka_id = cached.taluka_id,
      geo_latitude = cached.latitude,
      geo_longitude = cached.longitude,
      geo_resolution_status = case
        when cached.taluka_id is not null and not cached.ambiguous then 'resolved'
        else 'needs_review'
      end,
      geo_resolved_at = now()
  where id = target_vendor_id
  returning * into updated;
  if not found then raise exception 'Vendor not found'; end if;
  return updated;
end;
$$;

revoke all on function public.apply_vendor_geo_pincode(uuid, text) from public, anon;
grant execute on function public.apply_vendor_geo_pincode(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- Nearby-Taluka generation. Uses each Taluka's centroid (extensions.geography
-- point) and PostGIS's KNN `<->` operator to find the closest other active
-- Talukas nationwide (not restricted to the same District, so border Talukas
-- of different Districts/States correctly neighbour each other). Results are
-- cached in geo_taluka_neighbors so the public listing query never has to
-- compute distances at request time.
-- ----------------------------------------------------------------------------
create or replace function private.rebuild_taluka_neighbors_internal(
  p_state_id uuid default null,
  p_max_neighbors integer default 8,
  p_max_distance_km numeric default 150
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  taluka record;
  inserted_count integer := 0;
begin
  if p_max_neighbors < 1 or p_max_neighbors > 25 then
    raise exception 'max_neighbors must be between 1 and 25';
  end if;

  for taluka in
    select t.id, t.centroid
    from public.geo_talukas t
    join public.geo_districts d on d.id = t.district_id
    where t.is_active
      and t.centroid is not null
      and (p_state_id is null or d.state_id = p_state_id)
  loop
    delete from public.geo_taluka_neighbors where taluka_id = taluka.id;

    insert into public.geo_taluka_neighbors (
      taluka_id, nearby_taluka_id, distance_km, priority, relationship_type, generated_at
    )
    select
      taluka.id,
      other.id,
      round(extensions.st_distance(taluka.centroid, other.centroid) / 1000.0, 3),
      row_number() over (order by extensions.st_distance(taluka.centroid, other.centroid)),
      'centroid_distance',
      now()
    from public.geo_talukas other
    join public.geo_districts other_district on other_district.id = other.district_id
    where other.is_active
      and other.id <> taluka.id
      and other.centroid is not null
      and extensions.st_distance(taluka.centroid, other.centroid) <= (p_max_distance_km * 1000)
    order by extensions.st_distance(taluka.centroid, other.centroid)
    limit p_max_neighbors;

    get diagnostics inserted_count = row_count;
  end loop;

  return (select count(*)::integer from public.geo_taluka_neighbors);
end;
$$;

revoke all on function private.rebuild_taluka_neighbors_internal(uuid, integer, numeric) from public, anon, authenticated;

create or replace function public.rebuild_taluka_neighbors(
  p_state_id uuid default null,
  p_max_neighbors integer default 8,
  p_max_distance_km numeric default 150
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then raise exception 'Administrator access required'; end if;
  return private.rebuild_taluka_neighbors_internal(p_state_id, p_max_neighbors, p_max_distance_km);
end;
$$;

revoke all on function public.rebuild_taluka_neighbors(uuid, integer, numeric) from public, anon, authenticated;
grant execute on function public.rebuild_taluka_neighbors(uuid, integer, numeric) to authenticated;

-- ----------------------------------------------------------------------------
-- Tiered, paginated public vendor listing for a selected Taluka.
-- Tier 0 = vendors whose primary Taluka is the selected one.
-- Tier 1..N = vendors in the generated nearby-Taluka order.
-- A nearby vendor does not need to declare that it serves the selected
-- Taluka (current business rule) — membership in the tier list is enough.
-- Ordering within a tier: featured vendors first, then most recently
-- updated, with vendor id as a final stable tiebreaker so pagination never
-- skips or repeats a row across pages.
-- ----------------------------------------------------------------------------
create or replace function public.get_public_vendor_taluka_page(
  p_category text,
  p_taluka_id uuid,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  vendor_id uuid,
  tier integer,
  distance_km numeric,
  taluka_id uuid,
  taluka_name text,
  district_name text,
  state_name text,
  is_featured boolean,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with ordered_talukas as (
    select p_taluka_id as id, 0 as tier, 0::numeric as distance_km
    union all
    select nearby_taluka_id, priority, distance_km
    from public.geo_taluka_neighbors
    where taluka_id = p_taluka_id
  ),
  eligible_vendors as (
    select
      v.id as vendor_id,
      ot.tier,
      ot.distance_km,
      t.id as taluka_id,
      t.name as taluka_name,
      d.name as district_name,
      s.name as state_name,
      v.is_featured,
      v.updated_at
    from ordered_talukas ot
    join public.geo_talukas t on t.id = ot.id and t.is_active
    join public.geo_districts d on d.id = t.district_id
    join public.geo_states s on s.id = d.state_id
    join public.vendors v on v.geo_taluka_id = t.id
    join public.categories c on c.id = v.category_id
    where v.is_verified
      and lower(c.name) = lower(p_category)
  )
  select vendor_id, tier, distance_km, taluka_id, taluka_name, district_name, state_name,
    is_featured, updated_at
  from eligible_vendors
  order by tier asc, is_featured desc, updated_at desc, vendor_id asc
  limit greatest(p_limit, 0)
  offset greatest(p_offset, 0);
$$;

revoke all on function public.get_public_vendor_taluka_page(text, uuid, integer, integer) from public;
grant execute on function public.get_public_vendor_taluka_page(text, uuid, integer, integer) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- Admin tools
-- ----------------------------------------------------------------------------
create or replace function public.get_geo_admin_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not private.is_admin() then raise exception 'Administrator access required'; end if;
  select jsonb_build_object(
    'states_total', (select count(*) from public.geo_states),
    'states_active', (select count(*) from public.geo_states where is_active),
    'districts_total', (select count(*) from public.geo_districts),
    'districts_active', (select count(*) from public.geo_districts where is_active),
    'talukas_total', (select count(*) from public.geo_talukas),
    'talukas_active', (select count(*) from public.geo_talukas where is_active),
    'talukas_without_neighbors', (
      select count(*) from public.geo_talukas t
      where t.is_active and not exists (
        select 1 from public.geo_taluka_neighbors n where n.taluka_id = t.id
      )
    ),
    'pincodes_total', (select count(*) from public.geo_pincodes),
    'pincodes_resolved', (select count(*) from public.geo_pincodes where resolution_status = 'resolved'),
    'pincodes_needs_review', (select count(*) from public.geo_pincodes where resolution_status = 'needs_review'),
    'pincodes_unresolved', (select count(*) from public.geo_pincodes where resolution_status = 'unresolved'),
    'vendors_resolved', (select count(*) from public.vendors where geo_resolution_status = 'resolved'),
    'vendors_needs_review', (select count(*) from public.vendors where geo_resolution_status = 'needs_review'),
    'vendors_unresolved', (select count(*) from public.vendors where geo_resolution_status = 'unresolved' and pincode is not null),
    'neighbors_generated_at', (select max(generated_at) from public.geo_taluka_neighbors)
  ) into result;
  return result;
end;
$$;

revoke all on function public.get_geo_admin_overview() from public, anon, authenticated;
grant execute on function public.get_geo_admin_overview() to authenticated;

create or replace function public.list_unmapped_vendor_pincodes(p_limit integer default 50)
returns table (
  vendor_id uuid,
  business_name text,
  pincode text,
  city text,
  state text,
  geo_resolution_status text
)
language sql
stable
security definer
set search_path = ''
as $$
  select v.id, v.business_name, v.pincode, v.city, v.state, v.geo_resolution_status
  from public.vendors v
  where private.is_admin()
    and v.pincode is not null
    and v.geo_resolution_status <> 'resolved'
  order by v.updated_at desc
  limit greatest(p_limit, 0);
$$;

revoke all on function public.list_unmapped_vendor_pincodes(integer) from public, anon, authenticated;
grant execute on function public.list_unmapped_vendor_pincodes(integer) to authenticated;

commit;
