-- ============================================================================
-- PIN-based multi-locality vendor discovery (get_public_vendor_pincode_
-- locality_page_cards) DB/RPC test suite.
--
-- SAFE DRY-RUN DESIGN: this file creates the candidate function itself
-- (identical body to supabase/migrations/20260813000000_pincode_locality_
-- vendor_discovery.sql) INSIDE the same transaction as the fixture and
-- assertions, then always ROLLS BACK. Function creation is transactional in
-- Postgres, so nothing -- not the function, not the fixture rows -- is ever
-- persisted. This lets the RPC be validated against the live linked project
-- WITHOUT applying the migration first, per the explicit "do not push to
-- production yet" instruction.
--
-- Same environment/safety model as the other files in this directory: run
-- via the Supabase CLI, all fixture rows namespaced 'QA Pincode ...'.
--
-- RUN: npx supabase db query --linked --file scripts/location-tests/sql-pincode-locality-rpc.test.sql
-- ============================================================================

begin;

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
  order by average_rating desc, review_count desc, vendor_id asc
  limit greatest(p_limit, 0)
  offset greatest(p_offset, 0);
$$;

do $$
declare
  v_state_id uuid;
  v_district_id uuid;
  v_category_photographer uuid;
  v_category_decorator uuid;
  v_pincode text := '999999';
  v_loc_a uuid; v_loc_b uuid; v_loc_c uuid; v_loc_d uuid; v_loc_e uuid; v_loc_f uuid; v_loc_g uuid;
  v_vendor_a1 uuid; v_vendor_a2 uuid; v_vendor_b1 uuid; v_vendor_c1 uuid;
  v_vendor_d_decorator uuid; v_vendor_other_pin uuid;
  rows_all int;
  rows_single int;
  rows_multi int;
  rows_no_category int;
  found_wrong_locality int;
  page1 uuid[];
  page2 uuid[];
  overlap_count int;
  union_count int;
begin
  select id into v_category_photographer from categories where lower(name) = 'photographer' limit 1;
  select id into v_category_decorator from categories where lower(name) = 'decorator' limit 1;
  if v_category_photographer is null or v_category_decorator is null then
    raise exception 'Fixture precondition failed: Photographer/Decorator categories not found';
  end if;

  ------------------------------------------------------------------------
  -- Fixture: an isolated QA State/District + a single QA PIN with 7
  -- localities (A..G), mirroring the "410507 -> 7 localities" scenario
  -- from the spec. No lat/lng anywhere in this fixture -- proves the RPC
  -- needs no coordinates at all.
  ------------------------------------------------------------------------
  insert into geo_states (name, code, country, is_active)
  values ('QA Pincode State', 'QAP', 'India', true)
  returning id into v_state_id;

  insert into geo_districts (state_id, name, is_active)
  values (v_state_id, 'QA Pincode District', true)
  returning id into v_district_id;

  insert into geo_pincodes (pincode, state_id, district_id, resolution_status, source, verified_at)
  values (v_pincode, v_state_id, v_district_id, 'resolved', 'admin', now());

  insert into geo_pincode_localities (pincode, locality_name, normalized_name, state_id, district_id, source, source_trust, is_trusted, is_active)
  values (v_pincode, 'QA Locality A', 'qa locality a', v_state_id, v_district_id, 'admin', 4, true, true) returning id into v_loc_a;
  insert into geo_pincode_localities (pincode, locality_name, normalized_name, state_id, district_id, source, source_trust, is_trusted, is_active)
  values (v_pincode, 'QA Locality B', 'qa locality b', v_state_id, v_district_id, 'admin', 4, true, true) returning id into v_loc_b;
  insert into geo_pincode_localities (pincode, locality_name, normalized_name, state_id, district_id, source, source_trust, is_trusted, is_active)
  values (v_pincode, 'QA Locality C', 'qa locality c', v_state_id, v_district_id, 'admin', 4, true, true) returning id into v_loc_c;
  insert into geo_pincode_localities (pincode, locality_name, normalized_name, state_id, district_id, source, source_trust, is_trusted, is_active)
  values (v_pincode, 'QA Locality D', 'qa locality d', v_state_id, v_district_id, 'admin', 4, true, true) returning id into v_loc_d;
  insert into geo_pincode_localities (pincode, locality_name, normalized_name, state_id, district_id, source, source_trust, is_trusted, is_active)
  values (v_pincode, 'QA Locality E', 'qa locality e', v_state_id, v_district_id, 'admin', 4, true, true) returning id into v_loc_e;
  insert into geo_pincode_localities (pincode, locality_name, normalized_name, state_id, district_id, source, source_trust, is_trusted, is_active)
  values (v_pincode, 'QA Locality F', 'qa locality f', v_state_id, v_district_id, 'admin', 4, true, true) returning id into v_loc_f;
  insert into geo_pincode_localities (pincode, locality_name, normalized_name, state_id, district_id, source, source_trust, is_trusted, is_active)
  values (v_pincode, 'QA Locality G', 'qa locality g', v_state_id, v_district_id, 'admin', 4, true, true) returning id into v_loc_g;

  ------------------------------------------------------------------------
  -- Vendors: 2 photographers in Locality A, 1 in B, 1 in C, 1 decorator in
  -- D (must never appear in Photographer-filtered results), and 1
  -- photographer on a completely different PIN (must never leak in).
  ------------------------------------------------------------------------
  insert into vendors (business_name, owner_name, category_id, city, state, country, is_verified, is_featured, public_profile_enabled, management_status, geo_pincode_locality_id, created_at, updated_at)
  values ('QA Pincode Vendor A1', 'QA Owner', v_category_photographer, 'QA City', 'QA State', 'India', true, false, true, 'active', v_loc_a, now(), now())
  returning id into v_vendor_a1;
  insert into vendors (business_name, owner_name, category_id, city, state, country, is_verified, is_featured, public_profile_enabled, management_status, geo_pincode_locality_id, created_at, updated_at)
  values ('QA Pincode Vendor A2', 'QA Owner', v_category_photographer, 'QA City', 'QA State', 'India', true, false, true, 'active', v_loc_a, now(), now())
  returning id into v_vendor_a2;
  insert into vendors (business_name, owner_name, category_id, city, state, country, is_verified, is_featured, public_profile_enabled, management_status, geo_pincode_locality_id, created_at, updated_at)
  values ('QA Pincode Vendor B1', 'QA Owner', v_category_photographer, 'QA City', 'QA State', 'India', true, false, true, 'active', v_loc_b, now(), now())
  returning id into v_vendor_b1;
  insert into vendors (business_name, owner_name, category_id, city, state, country, is_verified, is_featured, public_profile_enabled, management_status, geo_pincode_locality_id, created_at, updated_at)
  values ('QA Pincode Vendor C1', 'QA Owner', v_category_photographer, 'QA City', 'QA State', 'India', true, false, true, 'active', v_loc_c, now(), now())
  returning id into v_vendor_c1;
  insert into vendors (business_name, owner_name, category_id, city, state, country, is_verified, is_featured, public_profile_enabled, management_status, geo_pincode_locality_id, created_at, updated_at)
  values ('QA Pincode Vendor D-Decorator', 'QA Owner', v_category_decorator, 'QA City', 'QA State', 'India', true, false, true, 'active', v_loc_d, now(), now())
  returning id into v_vendor_d_decorator;
  -- Unrelated vendor with no geo_pincode_locality_id at all -- must never
  -- appear (proves the join, not an accidental cross-join/cartesian leak).
  insert into vendors (business_name, owner_name, category_id, city, state, country, is_verified, is_featured, public_profile_enabled, management_status, created_at, updated_at)
  values ('QA Pincode Vendor Unassigned', 'QA Owner', v_category_photographer, 'QA City', 'QA State', 'India', true, false, true, 'active', now(), now())
  returning id into v_vendor_other_pin;

  ------------------------------------------------------------------------
  -- Test 1: All Locations + Photographer -> vendors from every locality
  -- that has a photographer (A, A, B, C = 4), decorator and unassigned
  -- vendor excluded.
  ------------------------------------------------------------------------
  select count(*) into rows_all
  from get_public_vendor_pincode_locality_page_cards(v_pincode, array['photographer'], null, null, null, 50, 0);
  if rows_all <> 4 then
    raise exception 'Test 1 failed: expected 4 photographers across all localities, got %', rows_all;
  end if;

  select count(*) into found_wrong_locality
  from get_public_vendor_pincode_locality_page_cards(v_pincode, array['photographer'], null, null, null, 50, 0)
  where vendor_id in (v_vendor_d_decorator, v_vendor_other_pin);
  if found_wrong_locality <> 0 then
    raise exception 'Test 1 failed: decorator or unassigned vendor leaked into "All Locations" Photographer results';
  end if;

  ------------------------------------------------------------------------
  -- Test 2: single locality (A) -> only A's 2 photographers.
  ------------------------------------------------------------------------
  select count(*) into rows_single
  from get_public_vendor_pincode_locality_page_cards(v_pincode, array['photographer'], array[v_loc_a], null, null, 50, 0);
  if rows_single <> 2 then
    raise exception 'Test 2 failed: expected 2 photographers in Locality A only, got %', rows_single;
  end if;

  select count(*) into found_wrong_locality
  from get_public_vendor_pincode_locality_page_cards(v_pincode, array['photographer'], array[v_loc_a], null, null, 50, 0)
  where vendor_id in (v_vendor_b1, v_vendor_c1);
  if found_wrong_locality <> 0 then
    raise exception 'Test 2 failed: a Locality B/C vendor leaked into a Locality-A-only search';
  end if;

  ------------------------------------------------------------------------
  -- Test 3: multiple selected localities (A + C) -> union (A's 2 + C's 1 = 3).
  ------------------------------------------------------------------------
  select count(*) into rows_multi
  from get_public_vendor_pincode_locality_page_cards(v_pincode, array['photographer'], array[v_loc_a, v_loc_c], null, null, 50, 0);
  if rows_multi <> 3 then
    raise exception 'Test 3 failed: expected 3 photographers across Locality A + C, got %', rows_multi;
  end if;

  select count(*) into found_wrong_locality
  from get_public_vendor_pincode_locality_page_cards(v_pincode, array['photographer'], array[v_loc_a, v_loc_c], null, null, 50, 0)
  where vendor_id = v_vendor_b1;
  if found_wrong_locality <> 0 then
    raise exception 'Test 3 failed: a Locality B vendor leaked into an A+C search';
  end if;

  ------------------------------------------------------------------------
  -- Test 4: no category (null) + All Locations -> every eligible vendor
  -- across all localities for this PIN (4 photographers + 1 decorator = 5).
  ------------------------------------------------------------------------
  select count(*) into rows_no_category
  from get_public_vendor_pincode_locality_page_cards(v_pincode, null, null, null, null, 50, 0);
  if rows_no_category <> 5 then
    raise exception 'Test 4 failed: expected 5 vendors with no category filter across all localities, got %', rows_no_category;
  end if;

  ------------------------------------------------------------------------
  -- Test 5: pagination completeness/no-overlap over the 5 all-category
  -- vendors (limit 3 offset 0, then limit 3 offset 3).
  ------------------------------------------------------------------------
  select array_agg(vendor_id) into page1
  from get_public_vendor_pincode_locality_page_cards(v_pincode, null, null, null, null, 3, 0);
  select array_agg(vendor_id) into page2
  from get_public_vendor_pincode_locality_page_cards(v_pincode, null, null, null, null, 3, 3);

  select count(*) into overlap_count
  from unnest(coalesce(page1, array[]::uuid[])) a
  where a = any (coalesce(page2, array[]::uuid[]));
  if overlap_count <> 0 then
    raise exception 'Test 5 failed: paginated pages overlap';
  end if;

  select count(*) into union_count
  from (
    select unnest(coalesce(page1, array[]::uuid[]))
    union
    select unnest(coalesce(page2, array[]::uuid[]))
  ) u;
  if union_count <> 5 then
    raise exception 'Test 5 failed: paginated pages do not cover all 5 fixture vendors (got %)', union_count;
  end if;

  raise notice 'All get_public_vendor_pincode_locality_page_cards tests passed.';
end $$;

rollback;
