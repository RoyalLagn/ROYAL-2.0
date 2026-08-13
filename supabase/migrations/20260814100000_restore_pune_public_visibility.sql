begin;

-- Pune district (is_active = false since 2026-08-13, before the current
-- location-hierarchy repair) and its Ambegaon taluka were left publicly
-- hidden from a prior session, while Pune's other 15 talukas stayed active.
-- 3 real, verified vendors resolve to Pune talukas today -- with the
-- District row hidden, get_public_vendor_taluka_page_cards' explicit
-- State/District/Taluka chain check (and this repair's new
-- get_nearby_vendors chain check) both silently exclude them, which is
-- exactly the "accidentally hide currently working Pune locations" outcome
-- this repair must avoid. Pune is the one hierarchy branch this project
-- treats as already reviewed/production, not part of the unreviewed bulk
-- import -- so it is restored here rather than left to compound the
-- pre-existing hidden state.
update public.geo_districts
set is_active = true
where lower(name) = 'pune'
  and exists (select 1 from public.geo_states s where s.id = state_id and lower(s.name) = 'maharashtra');

update public.geo_talukas t
set is_active = true
where lower(t.name) = 'ambegaon'
  and exists (
    select 1 from public.geo_districts d
    where d.id = t.district_id and lower(d.name) = 'pune'
  );

commit;
