begin;

-- Independent audit fixes for the State -> District -> Taluka discovery
-- feature. These changes are additive and leave supported_cities,
-- supported_areas, supported_pincodes and vendor_service_locations intact.

-- ---------------------------------------------------------------------------
-- Active hierarchy enforcement. A Taluka is public only when the Taluka,
-- its District and its State are all active. The listing RPCs are SECURITY
-- DEFINER functions, so they must enforce this explicitly instead of relying
-- on RLS. Direct public reads receive the same rule through these policies.
-- ---------------------------------------------------------------------------
drop policy if exists geo_talukas_active_or_admin_read on public.geo_talukas;
create policy geo_talukas_active_or_admin_read
on public.geo_talukas for select to anon, authenticated
using (
  (
    is_active
    and exists (
      select 1
      from public.geo_districts district
      join public.geo_states state on state.id = district.state_id
      where district.id = geo_talukas.district_id
        and district.is_active
        and state.is_active
    )
  )
  or private.is_admin()
);

drop policy if exists geo_taluka_neighbors_public_read on public.geo_taluka_neighbors;
create policy geo_taluka_neighbors_public_read
on public.geo_taluka_neighbors for select to anon, authenticated
using (
  (
    exists (
      select 1
      from public.geo_talukas taluka
      join public.geo_districts district on district.id = taluka.district_id
      join public.geo_states state on state.id = district.state_id
      where taluka.id = geo_taluka_neighbors.taluka_id
        and taluka.is_active and district.is_active and state.is_active
    )
    and exists (
      select 1
      from public.geo_talukas nearby
      join public.geo_districts district on district.id = nearby.district_id
      join public.geo_states state on state.id = district.state_id
      where nearby.id = geo_taluka_neighbors.nearby_taluka_id
        and nearby.is_active and district.is_active and state.is_active
    )
  )
  or private.is_admin()
);

-- Rebuild only active hierarchy members, remove stale rows for inactive
-- targets, use the PostGIS index-supported distance predicate/KNN operator,
-- and break equal distances by UUID so priority is stable across rebuilds.
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
begin
  if p_max_neighbors < 1 or p_max_neighbors > 25 then
    raise exception 'max_neighbors must be between 1 and 25';
  end if;
  if p_max_distance_km <= 0 or p_max_distance_km > 2000 then
    raise exception 'max_distance_km must be greater than 0 and at most 2000';
  end if;
  if p_state_id is not null and not exists (
    select 1 from public.geo_states where id = p_state_id
  ) then
    raise exception 'State not found';
  end if;

  delete from public.geo_taluka_neighbors neighbor
  using public.geo_talukas target, public.geo_districts target_district
  where neighbor.taluka_id = target.id
    and target_district.id = target.district_id
    and (p_state_id is null or target_district.state_id = p_state_id);

  for taluka in
    select target.id, target.centroid
    from public.geo_talukas target
    join public.geo_districts district
      on district.id = target.district_id and district.is_active
    join public.geo_states state
      on state.id = district.state_id and state.is_active
    where target.is_active
      and target.centroid is not null
      and (p_state_id is null or state.id = p_state_id)
  loop
    insert into public.geo_taluka_neighbors (
      taluka_id, nearby_taluka_id, distance_km, priority,
      relationship_type, generated_at
    )
    select
      taluka.id,
      other.id,
      round((extensions.st_distance(taluka.centroid, other.centroid) / 1000.0)::numeric, 3),
      row_number() over (
        order by taluka.centroid operator(extensions.<->) other.centroid, other.id
      )::integer,
      'centroid_distance',
      now()
    from public.geo_talukas other
    join public.geo_districts other_district
      on other_district.id = other.district_id and other_district.is_active
    join public.geo_states other_state
      on other_state.id = other_district.state_id and other_state.is_active
    where other.is_active
      and other.id <> taluka.id
      and other.centroid is not null
      and extensions.st_dwithin(
        taluka.centroid,
        other.centroid,
        p_max_distance_km * 1000
      )
    order by taluka.centroid operator(extensions.<->) other.centroid, other.id
    limit p_max_neighbors;
  end loop;

  return (select count(*)::integer from public.geo_taluka_neighbors);
end;
$$;

revoke all on function private.rebuild_taluka_neighbors_internal(uuid, integer, numeric)
  from public, anon, authenticated;

-- Coordinates and active hierarchy membership changed; rebuild the cache.
select private.rebuild_taluka_neighbors_internal(
  (select id from public.geo_states where lower(name) = 'maharashtra'),
  8,
  150
);

-- Legacy lightweight RPC retained for older clients, now with the same
-- active-hierarchy and public-vendor eligibility rules as the card RPC.
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
  )
  select
    vendor.id,
    ordered.tier,
    ordered.distance_km,
    taluka.id,
    taluka.name,
    district.name,
    state.name,
    vendor.is_featured,
    vendor.updated_at
  from ordered_talukas ordered
  join public.geo_talukas taluka
    on taluka.id = ordered.id and taluka.is_active
  join public.geo_districts district
    on district.id = taluka.district_id and district.is_active
  join public.geo_states state
    on state.id = district.state_id and state.is_active
  join public.vendors vendor on vendor.geo_taluka_id = taluka.id
  join public.categories category on category.id = vendor.category_id
  where vendor.is_verified
    and coalesce(vendor.public_profile_enabled, true)
    and coalesce(vendor.management_status, 'active') = 'active'
    and lower(category.name) = any (
      select lower(name) from unnest(p_category_names) as name
    )
  order by ordered.tier, vendor.is_featured desc, vendor.updated_at desc, vendor.id
  limit greatest(p_limit, 0)
  offset greatest(p_offset, 0);
$$;

revoke all on function public.get_public_vendor_taluka_page(text[], uuid, integer, integer)
  from public;
grant execute on function public.get_public_vendor_taluka_page(text[], uuid, integer, integer)
  to anon, authenticated;

-- Current bounded card RPC. The only behavioral change from the previous
-- definition is explicit active State/District enforcement.
create or replace function public.get_public_vendor_taluka_page_cards(
  p_category_names text[],
  p_taluka_id uuid,
  p_search text default null,
  p_min_rating numeric default null,
  p_max_price numeric default null,
  p_sort text default 'popular',
  p_limit integer default 20,
  p_offset integer default 0,
  p_after_tier integer default null,
  p_after_featured_rank integer default null,
  p_after_neg_review_count integer default null,
  p_after_neg_rating numeric default null,
  p_after_neg_updated_at double precision default null,
  p_after_vendor_id uuid default null
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
  tier integer,
  distance_km numeric,
  taluka_id uuid,
  taluka_name text,
  district_name text,
  state_name text,
  updated_at timestamptz,
  featured_rank integer,
  neg_review_count integer,
  neg_rating numeric,
  neg_updated_at double precision
)
language sql
stable
security definer
set search_path = ''
as $$
  with params as (
    select (p_sort = 'popular' and p_after_vendor_id is not null) as use_keyset
  ),
  ordered_talukas as (
    select p_taluka_id as id, 0 as tier, 0::numeric as distance_km
    union all
    select nearby_taluka_id, priority, distance_km
    from public.geo_taluka_neighbors
    where taluka_id = p_taluka_id
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
      ordered.tier,
      ordered.distance_km,
      taluka.id as b_taluka_id,
      taluka.name as taluka_name,
      district.name as district_name,
      state.name as state_name,
      coalesce(services.starting_price, 0) as starting_price,
      coalesce(services.titles, array[]::text[]) as service_titles,
      coalesce(ratings.average_rating, 0) as average_rating,
      coalesce(ratings.review_count, 0) as review_count,
      membership.plan_name as membership_plan
    from ordered_talukas ordered
    join public.geo_talukas taluka
      on taluka.id = ordered.id and taluka.is_active
    join public.geo_districts district
      on district.id = taluka.district_id and district.is_active
    join public.geo_states state
      on state.id = district.state_id and state.is_active
    join public.vendors vendor on vendor.geo_taluka_id = taluka.id
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
      and lower(category.name) = any (
        select lower(name) from unnest(p_category_names) as name
      )
      and (
        p_search is null or btrim(p_search) = '' or (
          vendor.business_name ilike '%' || p_search || '%'
          or vendor.description ilike '%' || p_search || '%'
          or exists (
            select 1 from unnest(vendor.tags) tag
            where tag ilike '%' || p_search || '%'
          )
          or exists (
            select 1
            from public.vendor_services service
            where service.vendor_id = vendor.id
              and service.is_active
              and coalesce(service.status, 'active') = 'active'
              and service.title ilike '%' || p_search || '%'
          )
        )
      )
  ),
  filtered as (
    select *,
      (case when is_featured then 0 else 1 end) as featured_rank,
      (-review_count) as neg_review_count,
      (-average_rating) as neg_rating,
      (-extract(epoch from updated_at)) as neg_updated_at
    from base
    where (p_min_rating is null or average_rating >= p_min_rating)
      and (
        p_max_price is null or p_max_price <= 0
        or (starting_price > 0 and starting_price <= p_max_price)
      )
  )
  select
    vendor_id,
    business_name,
    slug,
    category_name,
    logo_url,
    tags,
    service_titles,
    description,
    is_featured,
    starting_price,
    average_rating,
    review_count,
    membership_plan,
    tier,
    distance_km,
    b_taluka_id,
    taluka_name,
    district_name,
    state_name,
    updated_at,
    featured_rank,
    neg_review_count,
    neg_rating,
    neg_updated_at
  from filtered
  where not (select use_keyset from params) or (
    (tier, featured_rank, neg_review_count, neg_rating, neg_updated_at, vendor_id)
    > (
      coalesce(p_after_tier, -2147483648),
      coalesce(p_after_featured_rank, -2147483648),
      coalesce(p_after_neg_review_count, -2147483648),
      coalesce(p_after_neg_rating, -1e308),
      coalesce(p_after_neg_updated_at, -1e308),
      coalesce(p_after_vendor_id, '00000000-0000-0000-0000-000000000000'::uuid)
    )
  )
  order by
    tier asc,
    (case when p_sort = 'rating' then average_rating end) desc nulls last,
    (case when p_sort = 'rating' then review_count end) desc nulls last,
    (case when p_sort = 'price' then nullif(starting_price, 0) end) asc nulls last,
    featured_rank asc,
    neg_review_count asc,
    neg_rating asc,
    neg_updated_at asc,
    vendor_id asc
  limit greatest(p_limit, 0)
  offset (case when (select use_keyset from params) then 0 else greatest(p_offset, 0) end);
$$;

revoke all on function public.get_public_vendor_taluka_page_cards(
  text[], uuid, text, numeric, numeric, text, integer, integer,
  integer, integer, integer, numeric, double precision, uuid
) from public;
grant execute on function public.get_public_vendor_taluka_page_cards(
  text[], uuid, text, numeric, numeric, text, integer, integer,
  integer, integer, integer, numeric, double precision, uuid
) to anon, authenticated;

commit;
