begin;

-- Fix: the server-side search predicate (P2-2) checked business_name,
-- description and tags, but not each vendor's active service titles (e.g.
-- "Candid Photography") -- the legacy client-side search included
-- vendor.services.join(" ") in its searchable text, so this was a real
-- regression: a search term that only matched a service title returned
-- zero results instead of the vendor offering that service.
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
      v.id as vendor_id, v.business_name, v.slug, c.name as category_name, v.logo_url,
      v.tags, v.description, v.is_featured, v.updated_at,
      ot.tier, ot.distance_km, t.id as b_taluka_id, t.name as taluka_name,
      d.name as district_name, s.name as state_name,
      coalesce(svc.starting_price, 0) as starting_price,
      coalesce(svc.titles, array[]::text[]) as service_titles,
      coalesce(ra.average_rating, 0) as average_rating,
      coalesce(ra.review_count, 0) as review_count,
      mp.plan_name as membership_plan
    from ordered_talukas ot
    join public.geo_talukas t on t.id = ot.id and t.is_active
    join public.geo_districts d on d.id = t.district_id
    join public.geo_states s on s.id = d.state_id
    join public.vendors v on v.geo_taluka_id = t.id
    join public.categories c on c.id = v.category_id
    left join lateral (
      select
        array_agg(vs.title order by vs.display_order) as titles,
        min(coalesce(vs.discounted_price, vs.price))
          filter (where coalesce(vs.discounted_price, vs.price) > 0) as starting_price
      from public.vendor_services vs
      where vs.vendor_id = v.id and vs.is_active and coalesce(vs.status, 'active') = 'active'
    ) svc on true
    left join public.review_aggregates ra on ra.vendor_key = v.id::text
    left join lateral (
      select plan.name as plan_name
      from public.vendor_subscriptions subscription
      join public.subscription_plans plan on plan.id = subscription.plan_id
      where subscription.vendor_id = v.id
        and subscription.access_source = 'paid_subscription'
        and subscription.status in ('active', 'past_due', 'grace_period')
        and (subscription.expiry_date is null or subscription.expiry_date >= now())
        and lower(plan.name) in ('premium', 'elite')
      order by subscription.created_at desc
      limit 1
    ) mp on true
    where v.is_verified
      and coalesce(v.public_profile_enabled, true)
      and coalesce(v.management_status, 'active') = 'active'
      and lower(c.name) = any (select lower(name) from unnest(p_category_names) as name)
      and (
        p_search is null or btrim(p_search) = '' or (
          v.business_name ilike '%' || p_search || '%'
          or v.description ilike '%' || p_search || '%'
          or exists (select 1 from unnest(v.tags) tag where tag ilike '%' || p_search || '%')
          or exists (
            select 1 from public.vendor_services vs
            where vs.vendor_id = v.id and vs.is_active and coalesce(vs.status, 'active') = 'active'
              and vs.title ilike '%' || p_search || '%'
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
      and (p_max_price is null or p_max_price <= 0 or (starting_price > 0 and starting_price <= p_max_price))
  )
  select
    vendor_id, business_name, slug, category_name, logo_url, tags, service_titles,
    description, is_featured, starting_price, average_rating, review_count, membership_plan,
    tier, distance_km, b_taluka_id, taluka_name, district_name, state_name, updated_at,
    featured_rank, neg_review_count, neg_rating, neg_updated_at
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
