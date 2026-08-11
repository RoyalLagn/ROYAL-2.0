begin;

-- ============================================================================
-- PIN-based multi-locality vendor discovery ("Search by Location").
--
-- Independent, additive discovery mode alongside GPS-based get_nearby_vendors
-- (20260812000000) and the Taluka-tiered get_public_vendor_taluka_page_cards
-- (20260811110000). Neither of those is modified.
--
-- This is explicitly LOCALITY-MEMBERSHIP based, not GPS/radius based: a
-- vendor belongs to a PIN search result if and only if
-- vendors.geo_pincode_locality_id is one of the localities being searched.
-- No coordinates, PostGIS, or distance calculation is involved anywhere in
-- this function, and geo_pincode_localities rows with null latitude/
-- longitude work identically to rows with coordinates -- this mode was
-- designed to work even before the coordinate backfill existed.
--
-- vendors.geo_pincode_locality_id already exists (20260811120000) as the
-- authoritative vendor -> locality relationship, set by
-- private.resolve_vendor_geo_from_pincode whenever a vendor's PIN resolves
-- to a single trusted locality (auto) or an explicit locality choice
-- (multi-candidate PINs). This is the existing FK this RPC uses -- no new
-- location hierarchy, no normalized-text matching fallback needed.
-- ============================================================================

create or replace function public.get_public_vendor_pincode_locality_page_cards(
  p_pincode text,
  p_category_names text[] default null,
  p_locality_ids uuid[] default null,
  p_min_rating numeric default null,
  p_max_price numeric default null,
  p_limit integer default 20,
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
  locality_id uuid,
  locality_name text,
  district_name text,
  state_name text,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with target_localities as (
    -- Every active locality for this PIN, optionally narrowed to a caller-
    -- selected subset. A p_locality_ids value that doesn't actually belong
    -- to p_pincode is silently excluded here rather than trusted blindly --
    -- the result set can never include a locality outside the searched PIN.
    select id
    from public.geo_pincode_localities
    where pincode = p_pincode
      and is_active
      and (p_locality_ids is null or id = any (p_locality_ids))
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
      locality.id as b_locality_id,
      locality.locality_name as b_locality_name,
      district.name as district_name,
      state.name as state_name,
      coalesce(services.starting_price, 0) as starting_price,
      coalesce(services.titles, array[]::text[]) as service_titles,
      coalesce(ratings.average_rating, 0) as average_rating,
      coalesce(ratings.review_count, 0) as review_count,
      membership.plan_name as membership_plan
    from target_localities target
    join public.geo_pincode_localities locality on locality.id = target.id
    left join public.geo_districts district on district.id = locality.district_id
    left join public.geo_states state on state.id = locality.state_id
    join public.vendors vendor on vendor.geo_pincode_locality_id = locality.id
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
      and (
        p_category_names is null or lower(category.name) = any (
          select lower(name) from unnest(p_category_names) as name
        )
      )
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
    membership_plan, b_locality_id, b_locality_name, district_name, state_name, updated_at
  from filtered
  -- Business-quality ranking (no GPS/distance signal exists in this mode):
  -- rating desc, review count desc, vendor id asc for a fully stable order
  -- across pages (no duplicates/gaps regardless of concurrent rating
  -- changes between page requests).
  order by average_rating desc, review_count desc, vendor_id asc
  limit greatest(p_limit, 0)
  offset greatest(p_offset, 0);
$$;

revoke all on function public.get_public_vendor_pincode_locality_page_cards(
  text, text[], uuid[], numeric, numeric, integer, integer
) from public;
grant execute on function public.get_public_vendor_pincode_locality_page_cards(
  text, text[], uuid[], numeric, numeric, integer, integer
) to anon, authenticated;

commit;
