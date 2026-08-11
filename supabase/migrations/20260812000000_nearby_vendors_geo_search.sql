begin;

-- ============================================================================
-- GPS-based "Near Me" vendor discovery.
--
-- Additive only: does not touch the existing PIN-driven State/District/
-- Taluka hierarchy (geo_states/geo_districts/geo_talukas/geo_taluka_neighbors)
-- or its discovery RPC get_public_vendor_taluka_page_cards, which remain
-- fully intact. This layers a true point-to-point distance query on top of
-- the vendor geo_latitude/geo_longitude columns already populated by
-- private.resolve_vendor_geo_from_pincode whenever a vendor's PIN resolves
-- (see 20260811120000_india_wide_pincode_localities.sql) -- no new vendor
-- location input is required, this only exposes what already exists via
-- device GPS instead of a manually chosen Taluka.
-- ============================================================================

-- A vendor's resolved location as a geography point, generated the same way
-- geo_districts.centroid / geo_talukas.centroid already are (see
-- 20260810140000_geo_hierarchy_schema.sql). Gated on geo_resolution_status =
-- 'resolved' as defense-in-depth: the current writer (resolve_vendor_geo_
-- from_pincode) already nulls geo_latitude/geo_longitude for anything not
-- resolved, but a future writer bug must never be able to leak an
-- unconfirmed PIN match into "near me" results.
alter table public.vendors
  add column if not exists geo_location extensions.geography(Point, 4326)
    generated always as (
      case when geo_resolution_status = 'resolved'
            and geo_latitude is not null and geo_longitude is not null
        then extensions.geography(
          extensions.st_setsrid(extensions.st_makepoint(geo_longitude, geo_latitude), 4326)
        )
      end
    ) stored;

create index if not exists vendors_geo_location_gix on public.vendors using gist (geo_location);

-- Real point-to-point nearby search. p_category_names is nullable (unlike
-- get_public_vendor_taluka_page_cards, which always requires a Taluka +
-- category): "all categories near me" is a valid mode this feature supports
-- that the Taluka listing screen never needed to.
create or replace function public.get_nearby_vendors(
  user_lat double precision,
  user_lng double precision,
  p_category_names text[] default null,
  p_radius_km numeric default 10,
  p_min_rating numeric default null,
  p_max_price numeric default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  vendor_id uuid,
  business_name text,
  slug text,
  category_name text,
  logo_url text,
  tags text[],
  service_titles text[],
  description text,
  is_featured boolean,
  starting_price numeric,
  average_rating numeric,
  review_count integer,
  membership_plan text,
  city text,
  state text,
  distance_km numeric,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with origin as (
    select extensions.geography(
      extensions.st_setsrid(extensions.st_makepoint(user_lng, user_lat), 4326)
    ) as pt
  ),
  base as (
    select
      vendor.id as vendor_id,
      vendor.business_name,
      vendor.slug,
      category.name as category_name,
      vendor.logo_url,
      vendor.tags,
      vendor.description,
      vendor.is_featured,
      vendor.updated_at,
      vendor.city,
      vendor.state,
      (extensions.st_distance(vendor.geo_location, origin.pt) / 1000.0) as distance_km,
      coalesce(services.starting_price, 0) as starting_price,
      coalesce(services.titles, array[]::text[]) as service_titles,
      coalesce(ratings.average_rating, 0) as average_rating,
      coalesce(ratings.review_count, 0) as review_count,
      membership.plan_name as membership_plan
    from public.vendors vendor
    cross join origin
    join public.categories category on category.id = vendor.category_id
    left join lateral (
      select
        array_agg(service.title order by service.display_order) as titles,
        min(coalesce(service.discounted_price, service.price))
          filter (where coalesce(service.discounted_price, service.price) > 0) as starting_price
      from public.vendor_services service
      where service.vendor_id = vendor.id
        and service.is_active
        and coalesce(service.status, 'active') = 'active'
    ) services on true
    left join public.review_aggregates ratings on ratings.vendor_key = vendor.id::text
    left join lateral (
      select plan.name as plan_name
      from public.vendor_subscriptions subscription
      join public.subscription_plans plan on plan.id = subscription.plan_id
      where subscription.vendor_id = vendor.id
        and subscription.access_source = 'paid_subscription'
        and subscription.status in ('active', 'past_due', 'grace_period')
        and (subscription.expiry_date is null or subscription.expiry_date >= now())
        and lower(plan.name) in ('premium', 'elite')
      order by subscription.created_at desc
      limit 1
    ) membership on true
    where vendor.is_verified
      and coalesce(vendor.public_profile_enabled, true)
      and coalesce(vendor.management_status, 'active') = 'active'
      and vendor.geo_location is not null
      and (
        p_category_names is null or lower(category.name) = any (
          select lower(name) from unnest(p_category_names) as name
        )
      )
      and extensions.st_dwithin(vendor.geo_location, origin.pt, greatest(p_radius_km, 0) * 1000)
  ),
  filtered as (
    select *
    from base
    where (p_min_rating is null or average_rating >= p_min_rating)
      and (
        p_max_price is null or p_max_price <= 0
        or (starting_price > 0 and starting_price <= p_max_price)
      )
  )
  select
    vendor_id, business_name, slug, category_name, logo_url, tags, service_titles,
    description, is_featured, starting_price, average_rating, review_count,
    membership_plan, city, state, round(distance_km::numeric, 2), updated_at
  from filtered
  order by distance_km asc, average_rating desc, review_count desc, vendor_id asc
  limit greatest(p_limit, 0)
  offset greatest(p_offset, 0);
$$;

revoke all on function public.get_nearby_vendors(
  double precision, double precision, text[], numeric, numeric, numeric, integer, integer
) from public;
grant execute on function public.get_nearby_vendors(
  double precision, double precision, text[], numeric, numeric, numeric, integer, integer
) to anon, authenticated;

commit;
