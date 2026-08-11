-- ============================================================================
-- GPS-based "Near Me" (get_nearby_vendors) DB/RPC test suite.
--
-- Same environment/safety model as sql-pagination-and-rpc.test.sql: runs
-- against the linked Supabase project via the Supabase CLI, entirely inside
-- one transaction that always ROLLS BACK, all fixture rows namespaced
-- 'QA Nearby ...'.
--
-- RUN: npx supabase db query --linked --file scripts/location-tests/sql-nearby-vendors-rpc.test.sql
-- ============================================================================

begin;

do $$
declare
  v_category_photographer uuid;
  v_category_decorator uuid;
  v_near_id uuid;      -- ~2km from origin, high rating
  v_mid_id uuid;       -- ~6km from origin, low rating
  v_far_in_id uuid;    -- ~50km from origin (inside 100km, outside 10km)
  v_far_out_id uuid;   -- ~500km from origin (outside every radius tested)
  v_other_category_id uuid; -- ~3km, different category
  v_unresolved_id uuid;     -- no geo_latitude/geo_longitude at all
  origin_lat double precision := 20.0;
  origin_lng double precision := 80.0;
  rows_10km int;
  rows_100km int;
  found_far boolean;
  found_other_category int;
  found_all_category int;
  ordering_ok boolean;
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
  -- Fixture vendors, placed at known approximate distances from
  -- (origin_lat, origin_lng) using ~111km per degree of latitude.
  ------------------------------------------------------------------------
  insert into vendors (
    business_name, owner_name, category_id, city, state, country,
    is_verified, is_featured, public_profile_enabled, management_status,
    geo_latitude, geo_longitude, geo_resolution_status, created_at, updated_at
  ) values (
    'QA Nearby Vendor Near', 'QA Owner', v_category_photographer, 'QA City', 'QA State', 'India',
    true, false, true, 'active', origin_lat + (2.0 / 111.0), origin_lng, 'resolved', now(), now()
  ) returning id into v_near_id;

  insert into vendors (
    business_name, owner_name, category_id, city, state, country,
    is_verified, is_featured, public_profile_enabled, management_status,
    geo_latitude, geo_longitude, geo_resolution_status, created_at, updated_at
  ) values (
    'QA Nearby Vendor Mid', 'QA Owner', v_category_photographer, 'QA City', 'QA State', 'India',
    true, false, true, 'active', origin_lat + (6.0 / 111.0), origin_lng, 'resolved', now(), now()
  ) returning id into v_mid_id;

  insert into vendors (
    business_name, owner_name, category_id, city, state, country,
    is_verified, is_featured, public_profile_enabled, management_status,
    geo_latitude, geo_longitude, geo_resolution_status, created_at, updated_at
  ) values (
    'QA Nearby Vendor FarIn', 'QA Owner', v_category_photographer, 'QA City', 'QA State', 'India',
    true, false, true, 'active', origin_lat + (50.0 / 111.0), origin_lng, 'resolved', now(), now()
  ) returning id into v_far_in_id;

  insert into vendors (
    business_name, owner_name, category_id, city, state, country,
    is_verified, is_featured, public_profile_enabled, management_status,
    geo_latitude, geo_longitude, geo_resolution_status, created_at, updated_at
  ) values (
    'QA Nearby Vendor FarOut', 'QA Owner', v_category_photographer, 'QA City', 'QA State', 'India',
    true, false, true, 'active', origin_lat + (500.0 / 111.0), origin_lng, 'resolved', now(), now()
  ) returning id into v_far_out_id;

  insert into vendors (
    business_name, owner_name, category_id, city, state, country,
    is_verified, is_featured, public_profile_enabled, management_status,
    geo_latitude, geo_longitude, geo_resolution_status, created_at, updated_at
  ) values (
    'QA Nearby Vendor OtherCategory', 'QA Owner', v_category_decorator, 'QA City', 'QA State', 'India',
    true, false, true, 'active', origin_lat + (3.0 / 111.0), origin_lng, 'resolved', now(), now()
  ) returning id into v_other_category_id;

  -- No geo_latitude/geo_longitude at all -- geo_location must be null and
  -- this vendor must never appear, and the RPC must never error on it.
  insert into vendors (
    business_name, owner_name, category_id, city, state, country,
    is_verified, is_featured, public_profile_enabled, management_status,
    geo_resolution_status, created_at, updated_at
  ) values (
    'QA Nearby Vendor Unresolved', 'QA Owner', v_category_photographer, 'QA City', 'QA State', 'India',
    true, false, true, 'active', 'unresolved', now(), now()
  ) returning id into v_unresolved_id;

  ------------------------------------------------------------------------
  -- Test 1: radius filtering.
  ------------------------------------------------------------------------
  select count(*) into rows_10km
  from get_nearby_vendors(origin_lat, origin_lng, array['photographer'], 10, null, null, 50, 0)
  where vendor_id in (v_near_id, v_mid_id, v_far_in_id, v_far_out_id);
  if rows_10km <> 2 then
    raise exception 'Test 1 failed: expected 2 vendors within 10km (near+mid), got %', rows_10km;
  end if;

  select count(*) into rows_100km
  from get_nearby_vendors(origin_lat, origin_lng, array['photographer'], 100, null, null, 50, 0)
  where vendor_id in (v_near_id, v_mid_id, v_far_in_id, v_far_out_id);
  if rows_100km <> 3 then
    raise exception 'Test 1 failed: expected 3 vendors within 100km (near+mid+farIn), got %', rows_100km;
  end if;

  select exists (
    select 1 from get_nearby_vendors(origin_lat, origin_lng, array['photographer'], 1000, null, null, 50, 0)
    where vendor_id = v_far_out_id
  ) into found_far;
  if not found_far then
    raise exception 'Test 1 failed: expected the 500km vendor to appear within a 1000km radius';
  end if;

  ------------------------------------------------------------------------
  -- Test 2: category filtering (explicit + "all categories" null case).
  ------------------------------------------------------------------------
  select count(*) into found_other_category
  from get_nearby_vendors(origin_lat, origin_lng, array['photographer'], 10, null, null, 50, 0)
  where vendor_id = v_other_category_id;
  if found_other_category <> 0 then
    raise exception 'Test 2 failed: Decorator vendor leaked into Photographer-filtered results';
  end if;

  select count(*) into found_all_category
  from get_nearby_vendors(origin_lat, origin_lng, null, 10, null, null, 50, 0)
  where vendor_id = v_other_category_id;
  if found_all_category <> 1 then
    raise exception 'Test 2 failed: Decorator vendor missing from unfiltered ("all categories") results';
  end if;

  ------------------------------------------------------------------------
  -- Test 3: vendors with no resolved geo_location never appear/never error.
  ------------------------------------------------------------------------
  perform 1 from get_nearby_vendors(origin_lat, origin_lng, null, 20000, null, null, 100, 0);
  select count(*) into found_other_category
  from get_nearby_vendors(origin_lat, origin_lng, null, 20000, null, null, 100, 0)
  where vendor_id = v_unresolved_id;
  if found_other_category <> 0 then
    raise exception 'Test 3 failed: unresolved-location vendor must never appear in nearby results';
  end if;

  ------------------------------------------------------------------------
  -- Test 4: ordering is distance-primary (near before mid regardless of
  -- rating -- neither has reviews in this fixture, so this also confirms
  -- distance ordering doesn't depend on review_aggregates existing).
  ------------------------------------------------------------------------
  select (array_agg(vendor_id order by distance_km))[1] = v_near_id
    and (array_agg(vendor_id order by distance_km))[2] = v_mid_id
  into ordering_ok
  from get_nearby_vendors(origin_lat, origin_lng, array['photographer'], 100, null, null, 50, 0)
  where vendor_id in (v_near_id, v_mid_id, v_far_in_id);
  if not ordering_ok then
    raise exception 'Test 4 failed: results are not ordered nearest-first';
  end if;

  ------------------------------------------------------------------------
  -- Test 5: pagination completeness/no-overlap over the 3 in-radius
  -- Photographer fixtures (near, mid, farIn) at a 100km radius.
  ------------------------------------------------------------------------
  select array_agg(vendor_id) into page1
  from get_nearby_vendors(origin_lat, origin_lng, array['photographer'], 100, null, null, 2, 0)
  where vendor_id in (v_near_id, v_mid_id, v_far_in_id);
  select array_agg(vendor_id) into page2
  from get_nearby_vendors(origin_lat, origin_lng, array['photographer'], 100, null, null, 2, 2)
  where vendor_id in (v_near_id, v_mid_id, v_far_in_id);

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
  if union_count <> 3 then
    raise exception 'Test 5 failed: paginated pages do not cover all 3 fixture vendors (got %)', union_count;
  end if;

  raise notice 'All get_nearby_vendors tests passed.';
end $$;

rollback;
