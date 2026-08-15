begin;

-- Full category discovery for VendorsListing. The 20 km value is a ranking
-- boundary, never a filter: eligible vendors beyond it remain pageable.
create or replace function public.get_location_ranked_vendors(
  user_lat double precision,
  user_lng double precision,
  p_category_names text[] default null,
  p_min_rating numeric default null,
  p_max_price numeric default null,
  p_limit integer default 20,
  p_offset integer default 0,
  p_search text default null,
  p_nearby_threshold_km numeric default 20,
  p_sort text default 'popular'
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
    join public.geo_talukas taluka
      on taluka.id = vendor.geo_taluka_id and taluka.is_active
    join public.geo_districts district
      on district.id = taluka.district_id and district.is_active
    join public.geo_states state_row
      on state_row.id = district.state_id and state_row.is_active
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
    left join public.review_aggregates ratings
      on ratings.vendor_key = vendor.id::text
    left join lateral (
      select plan.name as plan_name
      from public.vendor_subscriptions subscription
      join public.subscription_plans plan on plan.id = subscription.plan_id
      where subscription.vendor_id = vendor.id
        and subscription.access_source = 'paid_subscription'
        and subscription.status in ('active', 'past_due', 'grace_period')
        and (subscription.expiry_date is null or subscription.expiry_date >= now())
        and lower(plan.name) in ('premium', 'elite')
      order by
        case lower(plan.name) when 'elite' then 0 when 'premium' then 1 else 2 end,
        subscription.created_at desc
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
  ),
  filtered as (
    select
      *,
      case
        when distance_km <= greatest(p_nearby_threshold_km, 0) then 0
        else 1
      end as distance_bucket,
      case lower(coalesce(membership_plan, ''))
        when 'elite' then 0
        when 'premium' then 1
        else 2
      end as membership_rank
    from base
    where (p_min_rating is null or average_rating >= p_min_rating)
      and (
        p_max_price is null or p_max_price <= 0
        or (starting_price > 0 and starting_price <= p_max_price)
      )
      and (
        nullif(btrim(p_search), '') is null
        or concat_ws(
          ' ', business_name, category_name, description, city, state,
          array_to_string(tags, ' '), array_to_string(service_titles, ' ')
        ) ilike '%' || btrim(p_search) || '%'
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
    city,
    state,
    round(distance_km::numeric, 2),
    updated_at
  from filtered
  order by
    distance_bucket asc,
    membership_rank asc,
    (case when lower(coalesce(p_sort, 'popular')) = 'rating' then average_rating end) desc nulls last,
    (case when lower(coalesce(p_sort, 'popular')) = 'rating' then review_count end) desc nulls last,
    (case when lower(coalesce(p_sort, 'popular')) = 'price' then nullif(starting_price, 0) end) asc nulls last,
    (case when lower(coalesce(p_sort, 'popular')) = 'popular' then is_featured::integer end) desc nulls last,
    (case when lower(coalesce(p_sort, 'popular')) = 'popular' then review_count end) desc nulls last,
    (case when lower(coalesce(p_sort, 'popular')) = 'popular' then average_rating end) desc nulls last,
    distance_km asc,
    updated_at desc,
    vendor_id asc
  limit greatest(p_limit, 0)
  offset greatest(p_offset, 0);
$$;

revoke all on function public.get_location_ranked_vendors(
  double precision, double precision, text[], numeric, numeric, integer,
  integer, text, numeric, text
) from public;
grant execute on function public.get_location_ranked_vendors(
  double precision, double precision, text[], numeric, numeric, integer,
  integer, text, numeric, text
) to anon, authenticated;

commit;
