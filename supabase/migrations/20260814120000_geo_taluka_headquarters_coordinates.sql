begin;

-- ============================================================================
-- Nearby-Taluka fallback currently only works for Pune (the only District
-- whose Talukas were ever given individually-verified centroids). Every
-- other Maharashtra Taluka imported by 20260814050000_geo_seed_maharashtra_full.sql
-- was deliberately left with NULL coordinates rather than guessed ones --
-- this migration adds real, sourced coordinates for the one Taluka per
-- District that IS that District's own headquarters town, reusing the
-- District-level headquarters coordinate that migration already sourced
-- (same source, same representative_headquarters method). This is not a
-- new geocode and not a guess: it is the same verified point, attached to
-- the Taluka that is, definitionally, the town the District coordinate
-- already represents.
--
-- Two cases need an explicit name mapping instead of the automatic
-- exact-match below, because the Taluka's own name differs from the
-- District's name even though it unambiguously *is* the headquarters:
--   - Nagpur district's headquarters Taluka is "Nagpur City" (district has
--     two Talukas, Nagpur City and Nagpur Rural -- the city one is the seat).
--   - Raigad district's administrative headquarters town is Alibaug, not a
--     town called "Raigad" -- "Alibaug" is the Taluka.
--
-- Every other Maharashtra Taluka (the large majority) still has NULL
-- coordinates after this migration and is correctly excluded from nearby
-- generation below -- this is the honest, documented state per
-- docs/locations-import.md, not a bug: importing polygon-accurate or
-- individually-geocoded points for ~330 remaining Talukas needs a licensed
-- boundary dataset or a dedicated, independently-reviewed geocoding pass,
-- not a guess made here.
-- ============================================================================

-- Automatic case: Taluka name is an exact match for its District's name
-- (27 Districts in the current Maharashtra import, including Nashik,
-- Jalgaon, Ahilyanagar, Chhatrapati Sambhajinagar, Dharashiv, ...).
update public.geo_talukas t
set
  latitude = d.latitude,
  longitude = d.longitude,
  coordinate_source = 'Reuses this District''s already-sourced headquarters-town coordinate (see 20260814050000_geo_seed_maharashtra_full.sql) -- this Taluka is that District''s headquarters town',
  coordinate_method = 'representative_headquarters'
from public.geo_districts d
join public.geo_states s on s.id = d.state_id
where t.district_id = d.id
  and lower(s.name) = 'maharashtra'
  and lower(t.name) = lower(d.name)
  and d.latitude is not null
  and d.longitude is not null
  and t.latitude is null;

-- Explicit, well-established headquarters mappings where the names differ.
update public.geo_talukas t
set
  latitude = d.latitude,
  longitude = d.longitude,
  coordinate_source = 'Reuses Nagpur District''s already-sourced headquarters-town coordinate -- Nagpur City Taluka is the District headquarters seat (Nagpur Rural is the separate, larger surrounding Taluka)',
  coordinate_method = 'representative_headquarters'
from public.geo_districts d
join public.geo_states s on s.id = d.state_id
where t.district_id = d.id
  and lower(s.name) = 'maharashtra' and lower(d.name) = 'nagpur' and lower(t.name) = 'nagpur city'
  and d.latitude is not null and t.latitude is null;

update public.geo_talukas t
set
  latitude = d.latitude,
  longitude = d.longitude,
  coordinate_source = 'Reuses Raigad District''s already-sourced headquarters coordinate -- Alibaug is Raigad District''s administrative headquarters town/Taluka',
  coordinate_method = 'representative_headquarters'
from public.geo_districts d
join public.geo_states s on s.id = d.state_id
where t.district_id = d.id
  and lower(s.name) = 'maharashtra' and lower(d.name) = 'raigad' and lower(t.name) = 'alibaug'
  and d.latitude is not null and t.latitude is null;

-- Rebuild the nearby-Taluka cache atomically now that more Talukas carry a
-- verified centroid. rebuild_taluka_neighbors_internal only ever considers
-- Talukas with a non-null centroid (private function, already filters
-- `t.centroid is not null`) -- Talukas still missing coordinates are simply
-- skipped, never assigned a guessed distance, and selected-Taluka results
-- for them keep working (tier 0 only, no nearby fallback available).
select private.rebuild_taluka_neighbors_internal(
  (select id from public.geo_states where lower(name) = 'maharashtra'),
  8,
  150
);

commit;
