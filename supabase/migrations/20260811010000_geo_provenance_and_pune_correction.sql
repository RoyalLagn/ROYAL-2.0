begin;

-- ============================================================================
-- P1-1 + P1-2 corrective migration.
--
-- P1-1: The originally deployed seed (20260810160000) had 15 Pune tahsils
-- and was missing "Loni Kalbhor", which pune.gov.in's official tahsil page
-- (https://pune.gov.in/en/tahsils/, re-verified 2026-08-11) lists as the
-- district's 16th tahsil. That same page spells the Velhe tahsil "Velha" --
-- corrected here, with "Velhe" kept as a searchable alias since it's the
-- common spelling used elsewhere (e.g. Wikipedia). Pimpri-Chinchwad is
-- confirmed present on the official list as its own tahsil (no change
-- needed there).
--
-- P1-2: adds auditable provenance to every imported District/Taluka row --
-- source name/URL, when it was imported, where the *coordinate* came from
-- and by what method, and a verification_status that is never silently
-- promoted to "verified" just because a row has a coordinate. LGD numeric
-- codes remain NULL and verification_status stays 'awaiting_lgd_verification'
-- for every row in this migration: LGD's machine-readable
-- district/sub-district export requires a NAPIX API key or an interactive
-- login session at lgdirectory.gov.in that is not obtainable from this
-- environment. No LGD code is invented here.
-- ============================================================================

alter table public.geo_districts
  add column if not exists source_name text,
  add column if not exists source_url text,
  add column if not exists source_record_code text,
  add column if not exists source_version text,
  add column if not exists imported_at timestamptz not null default now(),
  add column if not exists coordinate_source text,
  add column if not exists coordinate_method text,
  add column if not exists verification_status text not null default 'awaiting_lgd_verification';

alter table public.geo_talukas
  add column if not exists source_name text,
  add column if not exists source_url text,
  add column if not exists source_record_code text,
  add column if not exists source_version text,
  add column if not exists imported_at timestamptz not null default now(),
  add column if not exists coordinate_source text,
  add column if not exists coordinate_method text,
  add column if not exists verification_status text not null default 'awaiting_lgd_verification',
  -- "store aliases separately" (P1-1): the canonical name follows the
  -- official pune.gov.in spelling; other commonly-seen spellings (Velhe vs
  -- Velha, Mawal vs Maval, Purandhar vs Purandar) are kept here so search
  -- and future PIN-office-name matching aren't broken by spelling drift,
  -- without making any alias the canonical record.
  add column if not exists aliases text[] not null default '{}'::text[];

alter table public.geo_talukas
  add constraint geo_talukas_coordinate_method_check check (
    coordinate_method is null or coordinate_method in (
      'official_polygon_centroid', 'official_point', 'representative_headquarters', 'manually_reviewed'
    )
  ),
  add constraint geo_talukas_verification_status_check check (
    verification_status in ('verified', 'awaiting_lgd_verification', 'needs_review')
  );
alter table public.geo_districts
  add constraint geo_districts_coordinate_method_check check (
    coordinate_method is null or coordinate_method in (
      'official_polygon_centroid', 'official_point', 'representative_headquarters', 'manually_reviewed'
    )
  ),
  add constraint geo_districts_verification_status_check check (
    verification_status in ('verified', 'awaiting_lgd_verification', 'needs_review')
  );

-- ----------------------------------------------------------------------------
-- Pune district provenance
-- ----------------------------------------------------------------------------
update public.geo_districts
set source_name = 'pune.gov.in (official Pune District Government portal)',
    source_url = 'https://pune.gov.in/en/tahsils/',
    source_version = 'fetched 2026-08-11',
    coordinate_source = 'OpenStreetMap Nominatim geocoding of "Pune City", queried 2026-08-11',
    coordinate_method = 'representative_headquarters',
    verification_status = 'awaiting_lgd_verification'
where lower(name) = 'pune'
  and exists (select 1 from public.geo_states s where s.id = geo_districts.state_id and lower(s.name) = 'maharashtra');

-- ----------------------------------------------------------------------------
-- Correct/re-source the 15 originally-seeded Talukas. Coordinates below are
-- OpenStreetMap Nominatim geocodes of each Taluka's headquarters town,
-- queried 2026-08-11 (User-Agent identified, single request per town,
-- rate-limited per Nominatim's usage policy) -- replacing the previous
-- unsourced approximate values with cited ones. Names/spellings are
-- cross-checked against pune.gov.in's official tahsil list.
-- ----------------------------------------------------------------------------
with corrections (taluka_name, alias_names, hq_lat, hq_lng, hq_source) as (
  values
    ('Ambegaon', array['Ghodegaon']::text[], 19.0466022, 73.8386714, 'Ghodegaon (Ambegaon HQ town)'),
    ('Baramati', array[]::text[], 18.2198538, 74.4534054, 'Baramati town'),
    ('Bhor', array[]::text[], 18.2127607, 73.8163663, 'Bhor town'),
    ('Daund', array[]::text[], 18.4834351, 74.3621686, 'Daund town'),
    ('Haveli', array[]::text[], 18.5105199, 74.0609353, 'Haveli sub-district reference point'),
    ('Indapur', array[]::text[], 18.1125305, 74.9238654, 'Indapur town'),
    ('Junnar', array[]::text[], 19.2006808, 73.9768190, 'Junnar town'),
    ('Khed', array['Rajgurunagar']::text[], 18.8555378, 73.8863954, 'Rajgurunagar (Khed HQ town)'),
    ('Maval', array['Mawal']::text[], 18.7503694, 73.4069436, 'Lonavala (largest town in Maval; the tehsil-office town of Vadgaon Maval did not resolve via Nominatim)'),
    ('Mulshi', array['Paud']::text[], 18.5242717, 73.6155138, 'Paud (Mulshi HQ town)'),
    ('Pimpri-Chinchwad', array[]::text[], 18.6279288, 73.8009829, 'Pimpri-Chinchwad'),
    ('Pune City', array[]::text[], 18.5213738, 73.8545071, 'Pune (Pune City sub-district)'),
    ('Purandar', array['Purandhar', 'Saswad']::text[], 18.3444347, 74.0295234, 'Saswad (Purandar HQ town)'),
    ('Shirur', array[]::text[], 18.7610989, 74.2095290, 'Shirur town'),
    ('Velha', array['Velhe']::text[], 18.3036029, 73.5824636, 'Velhe town')
)
update public.geo_talukas t
set name = c.taluka_name,
    aliases = c.alias_names,
    latitude = c.hq_lat,
    longitude = c.hq_lng,
    source_name = 'pune.gov.in (official Pune District Government portal)',
    source_url = 'https://pune.gov.in/en/tahsils/',
    source_version = 'fetched 2026-08-11',
    coordinate_source = 'OpenStreetMap Nominatim geocoding: ' || c.hq_source || ', queried 2026-08-11',
    coordinate_method = 'representative_headquarters',
    verification_status = 'awaiting_lgd_verification'
from corrections c
join public.geo_districts d on lower(d.name) = 'pune'
join public.geo_states s on s.id = d.state_id and lower(s.name) = 'maharashtra'
where t.district_id = d.id
  -- match the row being renamed by its *old* name for the Velhe->Velha
  -- rename; every other row already has the correct canonical name.
  and (lower(t.name) = lower(c.taluka_name) or (lower(t.name) = 'velhe' and c.taluka_name = 'Velha'));

-- ----------------------------------------------------------------------------
-- Add the missing 16th tahsil: Loni Kalbhor.
-- ----------------------------------------------------------------------------
insert into public.geo_talukas (
  district_id, name, latitude, longitude, is_active,
  source_name, source_url, source_version,
  coordinate_source, coordinate_method, verification_status
)
select
  d.id, 'Loni Kalbhor', 18.4883530, 74.0221934, true,
  'pune.gov.in (official Pune District Government portal)',
  'https://pune.gov.in/en/tahsils/',
  'fetched 2026-08-11',
  'OpenStreetMap Nominatim geocoding: Loni Kalbhor town, queried 2026-08-11',
  'representative_headquarters',
  'awaiting_lgd_verification'
from public.geo_districts d
join public.geo_states s on s.id = d.state_id
where lower(d.name) = 'pune' and lower(s.name) = 'maharashtra'
on conflict (district_id, lower(name)) do nothing;

-- ----------------------------------------------------------------------------
-- Coordinates changed for every existing Taluka and a new Taluka was added:
-- regenerate the nearby-Taluka cache so it reflects the corrected data.
-- ----------------------------------------------------------------------------
select private.rebuild_taluka_neighbors_internal(
  (select id from public.geo_states where lower(name) = 'maharashtra'),
  8,
  150
);

commit;
