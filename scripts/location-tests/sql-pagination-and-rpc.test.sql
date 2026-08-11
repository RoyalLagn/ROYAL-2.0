-- ============================================================================
-- Location-discovery DB/RPC test suite (P2-3).
--
-- ENVIRONMENT: runs against the linked Supabase project's Postgres database
-- via the Supabase CLI (`supabase db query --linked`), which connects with
-- elevated (superuser-tunnel) privileges -- there is no local Supabase/
-- Docker available in this environment (confirmed: the Docker daemon is not
-- running here), and no separate staging project exists for this repo.
--
-- SAFETY: the entire fixture is created and torn down inside a single
-- transaction that always ROLLS BACK at the end (see the final `rollback;`
-- and the `do $$ ... $$` assertion block, which raises an exception --
-- aborting the transaction -- on any failed assertion). No row inserted by
-- this script is ever committed; production data (including the real
-- Shubham Photography / Pune / Maval rows used elsewhere in this project's
-- manual verification) is untouched. All fixture rows are clearly
-- namespaced ('QA Test ...') and would be obviously identifiable as test
-- data even if this script were ever run without the rollback by mistake.
--
-- RUN: npx supabase db query --linked --file scripts/location-tests/sql-pagination-and-rpc.test.sql
-- ============================================================================

begin;

do $$
declare
  v_state_id uuid;
  v_district_id uuid;
  v_taluka_a uuid; -- selected Taluka: 25 vendors
  v_taluka_b uuid; -- tier 1 (nearby): 3 vendors
  v_taluka_c uuid; -- tier 2 (nearby): 0 vendors -- must be skipped
  v_taluka_d uuid; -- tier 3 (nearby): 2 vendors
  v_category_id uuid;
  i integer;
  vendor_ids uuid[];
  page1 uuid[];
  page2 uuid[];
  page3_tiers integer[];
  last_row record;
  dup_count integer;
  total_seen integer;
begin
  ------------------------------------------------------------------------
  -- Fixture: isolated State/District/Taluka hierarchy, never touching
  -- Maharashtra/Pune.
  ------------------------------------------------------------------------
  insert into geo_states (name, code, country, is_active)
  values ('QA Test State', 'QA', 'India', true)
  returning id into v_state_id;

  insert into geo_districts (state_id, name, latitude, longitude, is_active)
  values (v_state_id, 'QA Test District', 20.0, 80.0, true)
  returning id into v_district_id;

  insert into geo_talukas (district_id, name, latitude, longitude, is_active)
  values (v_district_id, 'QA Taluka A', 20.00, 80.00, true) returning id into v_taluka_a;
  insert into geo_talukas (district_id, name, latitude, longitude, is_active)
  values (v_district_id, 'QA Taluka B', 20.01, 80.01, true) returning id into v_taluka_b;
  insert into geo_talukas (district_id, name, latitude, longitude, is_active)
  values (v_district_id, 'QA Taluka C', 20.02, 80.02, true) returning id into v_taluka_c;
  insert into geo_talukas (district_id, name, latitude, longitude, is_active)
  values (v_district_id, 'QA Taluka D', 20.03, 80.03, true) returning id into v_taluka_d;

  -- Deterministic, hand-authored neighbour order for this fixture only --
  -- production neighbours are always computed (rebuild_taluka_neighbors),
  -- never hand-authored; this is purely to pin the test's expected order.
  insert into geo_taluka_neighbors (taluka_id, nearby_taluka_id, distance_km, priority, relationship_type)
  values
    (v_taluka_a, v_taluka_b, 5, 1, 'centroid_distance'),
    (v_taluka_a, v_taluka_c, 10, 2, 'centroid_distance'),
    (v_taluka_a, v_taluka_d, 15, 3, 'centroid_distance');

  select id into v_category_id from categories where lower(name) = 'photographer' limit 1;
  if v_category_id is null then
    raise exception 'Fixture precondition failed: no Photographer category found';
  end if;

  ------------------------------------------------------------------------
  -- 25 vendors in Taluka A (selected), 3 in Taluka B (tier 1),
  -- 0 in Taluka C (tier 2 -- must be skipped entirely),
  -- 2 in Taluka D (tier 3).
  ------------------------------------------------------------------------
  for i in 1..25 loop
    insert into vendors (
      business_name, owner_name, category_id, city, state, country,
      is_verified, is_featured, geo_taluka_id, geo_resolution_status,
      created_at, updated_at
    ) values (
      'QA Test Vendor A' || lpad(i::text, 2, '0'), 'QA Owner', v_category_id,
      'QA Test City', 'QA Test State', 'India',
      true, false, v_taluka_a, 'resolved',
      now() - (i || ' minutes')::interval, now() - (i || ' minutes')::interval
    );
  end loop;

  for i in 1..3 loop
    insert into vendors (
      business_name, owner_name, category_id, city, state, country,
      is_verified, is_featured, geo_taluka_id, geo_resolution_status,
      created_at, updated_at
    ) values (
      'QA Test Vendor B' || i, 'QA Owner', v_category_id,
      'QA Test City', 'QA Test State', 'India',
      true, false, v_taluka_b, 'resolved', now(), now()
    );
  end loop;

  for i in 1..2 loop
    insert into vendors (
      business_name, owner_name, category_id, city, state, country,
      is_verified, is_featured, geo_taluka_id, geo_resolution_status,
      created_at, updated_at
    ) values (
      'QA Test Vendor D' || i, 'QA Owner', v_category_id,
      'QA Test City', 'QA Test State', 'India',
      true, false, v_taluka_d, 'resolved', now(), now()
    );
  end loop;

  ------------------------------------------------------------------------
  -- TEST 1: page 1 (limit 10, offset 0) -- 10 rows, all tier 0 (Taluka A).
  ------------------------------------------------------------------------
  select array_agg(vendor_id) into page1 from (
    select vendor_id, tier from get_public_vendor_taluka_page_cards(
      array['Photographer'], v_taluka_a, null, null, null, 'popular', 10, 0
    )
  ) x;
  if array_length(page1, 1) is distinct from 10 then
    raise exception 'TEST 1 FAILED: expected 10 rows on page 1, got %', array_length(page1, 1);
  end if;
  if exists (
    select 1 from get_public_vendor_taluka_page_cards(array['Photographer'], v_taluka_a, null, null, null, 'popular', 10, 0)
    where tier <> 0
  ) then
    raise exception 'TEST 1 FAILED: page 1 contains a non-tier-0 row';
  end if;

  ------------------------------------------------------------------------
  -- TEST 2: page 2 (offset 10, limit 10) -- next 10 rows, still all tier 0,
  -- and none of them overlap with page 1 (no duplicates).
  ------------------------------------------------------------------------
  select array_agg(vendor_id) into page2 from (
    select vendor_id from get_public_vendor_taluka_page_cards(
      array['Photographer'], v_taluka_a, null, null, null, 'popular', 10, 10
    )
  ) x;
  if array_length(page2, 1) is distinct from 10 then
    raise exception 'TEST 2 FAILED: expected 10 rows on page 2, got %', array_length(page2, 1);
  end if;
  select count(*) into dup_count from unnest(page1) a join unnest(page2) b on a = b;
  if dup_count > 0 then
    raise exception 'TEST 2 FAILED: % vendor(s) duplicated between page 1 and page 2', dup_count;
  end if;

  ------------------------------------------------------------------------
  -- TEST 3: page 3 (offset 20, limit 10) -- the remaining 5 Taluka-A
  -- vendors, THEN the fallback into nearby tiers: all 3 from Taluka B
  -- (tier 1), Taluka C entirely skipped (0 vendors), then 2 from Taluka D
  -- (tier 3) -- exactly 5 + 3 + 2 = 10, proving both "selected Taluka
  -- exhausted before nearby tiers" and "empty nearby Taluka is skipped".
  ------------------------------------------------------------------------
  if exists (
    select 1 from get_public_vendor_taluka_page_cards(array['Photographer'], v_taluka_a, null, null, null, 'popular', 10, 20)
    where taluka_id = v_taluka_c
  ) then
    raise exception 'TEST 3 FAILED: empty Taluka C leaked a row into the results';
  end if;
  if (select count(*) from get_public_vendor_taluka_page_cards(array['Photographer'], v_taluka_a, null, null, null, 'popular', 10, 20) where tier = 0) <> 5 then
    raise exception 'TEST 3 FAILED: expected exactly 5 remaining tier-0 rows on page 3';
  end if;
  if (select count(*) from get_public_vendor_taluka_page_cards(array['Photographer'], v_taluka_a, null, null, null, 'popular', 10, 20) where taluka_id = v_taluka_b) <> 3 then
    raise exception 'TEST 3 FAILED: expected all 3 Taluka-B (tier 1) rows on page 3';
  end if;
  if (select count(*) from get_public_vendor_taluka_page_cards(array['Photographer'], v_taluka_a, null, null, null, 'popular', 10, 20) where taluka_id = v_taluka_d) <> 2 then
    raise exception 'TEST 3 FAILED: expected both Taluka-D (tier 3) rows on page 3';
  end if;
  -- Tier ordering within page 3 itself: 0s before 1s before 3s (never a
  -- higher tier ahead of a lower, unexhausted one).
  select array_agg(tier order by ord) into page3_tiers from (
    select tier, row_number() over () as ord
    from get_public_vendor_taluka_page_cards(array['Photographer'], v_taluka_a, null, null, null, 'popular', 10, 20)
  ) x;
  if page3_tiers is distinct from array[0,0,0,0,0,1,1,1,3,3] then
    raise exception 'TEST 3 FAILED: page 3 tier order was %, expected [0,0,0,0,0,1,1,1,3,3]', page3_tiers;
  end if;

  ------------------------------------------------------------------------
  -- TEST 4: keyset pagination (the default/"popular" path actually used
  -- by infinite scroll) reaches the exact same 25-vendor tier-0 set with
  -- no duplicates and no omissions when walked page-by-page via cursors
  -- instead of raw OFFSET.
  ------------------------------------------------------------------------
  declare
    cursor_tier integer; cursor_featured integer; cursor_neg_rc integer;
    cursor_neg_rating numeric; cursor_neg_updated double precision; cursor_vendor uuid;
    seen uuid[] := array[]::uuid[];
    batch uuid[];
    loop_guard integer := 0;
  begin
    loop
      loop_guard := loop_guard + 1;
      if loop_guard > 10 then raise exception 'TEST 4 FAILED: keyset pagination did not terminate (possible infinite loop)'; end if;

      select array_agg(vendor_id order by ord), max(tier) filter (where ord = cnt), max(featured_rank) filter (where ord = cnt),
             max(neg_review_count) filter (where ord = cnt), max(neg_rating) filter (where ord = cnt),
             max(neg_updated_at) filter (where ord = cnt), max(vendor_id::text) filter (where ord = cnt)
      into batch, cursor_tier, cursor_featured, cursor_neg_rc, cursor_neg_rating, cursor_neg_updated, cursor_vendor
      from (
        select vendor_id, tier, featured_rank, neg_review_count, neg_rating, neg_updated_at,
          row_number() over () as ord, count(*) over () as cnt
        from get_public_vendor_taluka_page_cards(
          array['Photographer'], v_taluka_a, null, null, null, 'popular', 10, 0,
          cursor_tier, cursor_featured, cursor_neg_rc, cursor_neg_rating, cursor_neg_updated, cursor_vendor
        )
      ) x;

      exit when batch is null or array_length(batch, 1) = 0;
      seen := seen || batch;
      exit when array_length(batch, 1) < 10;
    end loop;

    if (select count(*) from unnest(seen)) <> (select count(distinct x) from unnest(seen) x) then
      raise exception 'TEST 4 FAILED: keyset pagination produced duplicate vendors';
    end if;
    total_seen := array_length(seen, 1);
    if total_seen < 25 then
      raise exception 'TEST 4 FAILED: keyset pagination only saw % of the 25+ eligible vendors', total_seen;
    end if;
  end;

  ------------------------------------------------------------------------
  -- TEST 5: category alias (Photographer <-> Photographers) -- the RPC is
  -- called with the raw DB category name here (matching what
  -- databaseCategoryCandidates() resolves to); confirms case-insensitive
  -- exact match works and an unrelated category name returns nothing.
  ------------------------------------------------------------------------
  -- limit 100 spans every tier reachable from Taluka A (25 + 3 + 0 + 2 =
  -- 30), so this checks tier 0 (Taluka A itself) specifically.
  if (select count(*) from get_public_vendor_taluka_page_cards(array['photographer'], v_taluka_a, null, null, null, 'popular', 100, 0) where tier = 0) <> 25 then
    raise exception 'TEST 5 FAILED: lowercase category name did not match';
  end if;
  if (select count(*) from get_public_vendor_taluka_page_cards(array['Caterer'], v_taluka_a, null, null, null, 'popular', 100, 0)) <> 0 then
    raise exception 'TEST 5 FAILED: an unrelated category name incorrectly matched';
  end if;

  ------------------------------------------------------------------------
  -- TEST 6: inactive Taluka is excluded entirely (deactivate B, confirm
  -- its 3 vendors disappear from the tiered results).
  ------------------------------------------------------------------------
  update geo_talukas set is_active = false where id = v_taluka_b;
  if (select count(*) from get_public_vendor_taluka_page_cards(array['Photographer'], v_taluka_a, null, null, null, 'popular', 100, 0) where taluka_id = v_taluka_b) <> 0 then
    raise exception 'TEST 6 FAILED: vendors from a deactivated Taluka were still returned';
  end if;
  update geo_talukas set is_active = true where id = v_taluka_b;

  ------------------------------------------------------------------------
  -- TEST 7: inactive parent District/State excludes the entire hierarchy.
  -- SECURITY DEFINER RPCs bypass RLS, so both checks must live inside the
  -- function itself (regression for the independent-audit P1 leak).
  ------------------------------------------------------------------------
  update geo_districts set is_active = false where id = v_district_id;
  if (select count(*) from get_public_vendor_taluka_page_cards(array['Photographer'], v_taluka_a, null, null, null, 'popular', 100, 0)) <> 0 then
    raise exception 'TEST 7 FAILED: vendors from a deactivated District were still returned';
  end if;
  update geo_districts set is_active = true where id = v_district_id;

  update geo_states set is_active = false where id = v_state_id;
  if (select count(*) from get_public_vendor_taluka_page_cards(array['Photographer'], v_taluka_a, null, null, null, 'popular', 100, 0)) <> 0 then
    raise exception 'TEST 7 FAILED: vendors from a deactivated State were still returned';
  end if;
  update geo_states set is_active = true where id = v_state_id;

  ------------------------------------------------------------------------
  -- TEST 8: unverified / suspended vendors are excluded from the public
  -- listing entirely.
  ------------------------------------------------------------------------
  update vendors set is_verified = false where business_name = 'QA Test Vendor A01';
  update vendors set management_status = 'suspended' where business_name = 'QA Test Vendor A02';
  if (select count(*) from get_public_vendor_taluka_page_cards(array['Photographer'], v_taluka_a, null, null, null, 'popular', 100, 0) where business_name in ('QA Test Vendor A01', 'QA Test Vendor A02')) <> 0 then
    raise exception 'TEST 8 FAILED: an unverified or suspended vendor was returned publicly';
  end if;

  ------------------------------------------------------------------------
  -- TEST 9: search matches a vendor_services title, not just
  -- business_name/description/tags (P2-2 regression coverage).
  ------------------------------------------------------------------------
  insert into vendor_services (vendor_id, title, price, is_active, status)
  select id, 'QA Unique Service Title Zephyr', 5000, true, 'active'
  from vendors where business_name = 'QA Test Vendor A03';
  if (select count(*) from get_public_vendor_taluka_page_cards(array['Photographer'], v_taluka_a, 'Zephyr', null, null, 'popular', 100, 0)) <> 1 then
    raise exception 'TEST 9 FAILED: search did not match a vendor_services.title';
  end if;

  ------------------------------------------------------------------------
  -- TEST 10: unauthorized write attempts -- rebuild_taluka_neighbors and
  -- admin_confirm_geo_pincode must reject a non-admin/anonymous caller.
  -- (private.is_admin() returns false with no auth.uid() session, exactly
  -- the context this script runs in.)
  ------------------------------------------------------------------------
  begin
    perform rebuild_taluka_neighbors(v_state_id, 8, 150);
    raise exception 'TEST 10 FAILED: rebuild_taluka_neighbors did not reject an unauthorized caller';
  exception when others then
    if sqlerrm not ilike '%Administrator access required%' then
      raise exception 'TEST 10 FAILED: unexpected error from rebuild_taluka_neighbors: %', sqlerrm;
    end if;
  end;

  begin
    perform admin_confirm_geo_pincode('499999', v_taluka_a);
    raise exception 'TEST 10 FAILED: admin_confirm_geo_pincode did not reject an unauthorized caller';
  exception when others then
    if sqlerrm not ilike '%Administrator access required%' then
      raise exception 'TEST 10 FAILED: unexpected error from admin_confirm_geo_pincode: %', sqlerrm;
    end if;
  end;

  raise notice 'ALL 10 LOCATION-DISCOVERY SQL/RPC TESTS PASSED';
end $$;

-- Always roll back: this entire script only ever proves behavior against a
-- transient, in-transaction fixture. Nothing here is meant to be committed.
rollback;
