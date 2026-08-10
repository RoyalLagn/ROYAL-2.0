begin;

-- Fix: the public marketplace uses a display category name that differs
-- from the raw categories.name value for several categories (e.g. the
-- category row is named "Photographer" but the public/display name is
-- "Photographers" -- see MARKETPLACE_CATEGORY_NAMES in
-- services/publicVendorListings.ts). The original single-name equality
-- match silently returned zero rows for every renamed category. The client
-- now resolves every raw category name that maps to the selected display
-- category (services/publicVendorListings.ts#databaseCategoryCandidates)
-- and passes them all here.
drop function if exists public.get_public_vendor_taluka_page(text, uuid, integer, integer);

create or replace function public.get_public_vendor_taluka_page(
  p_category_names text[],
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
      and lower(c.name) = any (select lower(name) from unnest(p_category_names) as name)
  )
  select vendor_id, tier, distance_km, taluka_id, taluka_name, district_name, state_name,
    is_featured, updated_at
  from eligible_vendors
  order by tier asc, is_featured desc, updated_at desc, vendor_id asc
  limit greatest(p_limit, 0)
  offset greatest(p_offset, 0);
$$;

revoke all on function public.get_public_vendor_taluka_page(text[], uuid, integer, integer) from public;
grant execute on function public.get_public_vendor_taluka_page(text[], uuid, integer, integer) to anon, authenticated;

commit;
