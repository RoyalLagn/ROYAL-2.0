begin;

-- ============================================================================
-- Initial data seed: Maharashtra only, Pune district's talukas, matching the
-- "Maharashtra first, India ready" business phase. No PIN-code rows are
-- seeded here — PIN -> Taluka resolution is populated live from the
-- official India Post / data.gov.in providers already wired into the
-- lookup-india-pincode edge function (see the accompanying edge-function
-- change), so no PIN data is invented by hand.
--
-- Taluka centroid coordinates below are the well-established coordinates of
-- each Taluka's headquarters town, used as a practical proxy for a
-- representative point per LGD's own convention and this project's stated
-- fallback (Section 5: "centroid/representative coordinate ... geographic
-- distance") since licensed Survey of India boundary polygons are not
-- available in this environment. See docs/locations-import.md for the
-- upgrade path to true polygon centroids.
-- ============================================================================

insert into public.geo_states (name, code, country, is_active)
values ('Maharashtra', 'MH', 'India', true)
on conflict (lower(name)) do nothing;

insert into public.geo_districts (state_id, name, latitude, longitude, is_active)
select state.id, 'Pune', 18.5204, 73.8567, true
from public.geo_states state
where lower(state.name) = 'maharashtra'
on conflict (state_id, lower(name)) do nothing;

insert into public.geo_talukas (district_id, name, latitude, longitude, is_active)
select district.id, taluka.name, taluka.lat, taluka.lng, true
from public.geo_districts district
join public.geo_states state on state.id = district.state_id
cross join (values
  ('Pune City', 18.5204, 73.8567),
  ('Pimpri-Chinchwad', 18.6298, 73.7997),
  ('Haveli', 18.5679, 73.9143),
  ('Mulshi', 18.5314, 73.5478),
  ('Velhe', 18.3814, 73.6472),
  ('Bhor', 18.1487, 73.8432),
  ('Purandar', 18.3435, 74.0296),
  ('Baramati', 18.1514, 74.5815),
  ('Daund', 18.4645, 74.5815),
  ('Indapur', 18.1187, 75.0197),
  ('Maval', 18.6885, 73.5133),
  ('Khed', 18.8667, 73.8833),
  ('Shirur', 18.8266, 74.3777),
  ('Ambegaon', 19.0930, 73.7550),
  ('Junnar', 19.2073, 73.8737)
) as taluka(name, lat, lng)
where lower(state.name) = 'maharashtra'
  and lower(district.name) = 'pune'
on conflict (district_id, lower(name)) do nothing;

-- Generate the initial nearby-Taluka cache for Maharashtra now that Pune's
-- Talukas have centroids. Safe to re-run: rebuild deletes-then-reinserts
-- per Taluka, so running the import again never duplicates rows.
select private.rebuild_taluka_neighbors_internal(
  (select id from public.geo_states where lower(name) = 'maharashtra'),
  8,
  150
);

commit;
