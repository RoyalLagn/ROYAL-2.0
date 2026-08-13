begin;

-- ============================================================================
-- Completes the Maharashtra State -> District -> Taluka hierarchy.
--
-- Root cause of the reported bug: 20260810160000_geo_seed_maharashtra_pune.sql
-- only ever seeded ONE district (Pune) with its 15 talukas. Every other
-- Maharashtra district -- Nashik, Nagpur, Jalgaon, Kolhapur, Satara, etc. --
-- never existed as a row, so the District dropdown had nothing to show for
-- them and the Taluka dropdown could never surface Nashik/Nagpur/Jalgaon
-- talukas. This migration is purely additive: Pune and its talukas (already
-- corrected/enriched by 20260811010000_geo_provenance_and_pune_correction.sql)
-- are never touched, referenced, or duplicated below.
--
-- Coverage: all 35 remaining Maharashtra districts, each with its real
-- talukas (358 total statewide, per the State's own administrative count).
-- Mumbai City is intentionally seeded with zero talukas: unlike every other
-- Maharashtra district it has no taluka/tahsil subdivision of its own (its
-- revenue administration sits directly under the district Collector) --
-- Mumbai Suburban is the district that carries the 3 taluka-equivalent
-- revenue units (Andheri, Borivali, Kurla). Leaving Mumbai City's Taluka list
-- empty is the factually correct state, not a data gap.
--
-- Source: district/taluka names cross-referenced against the Maharashtra
-- Revenue Department's 2023/2024 district-renaming notifications (Aurangabad
-- -> Chhatrapati Sambhajinagar, Osmanabad -> Dharashiv, both gazetted
-- 2023-09-15; Ahmednagar -> Ahilyanagar, gazetted 2024) and a district-wise
-- taluka reference compiled from Maharashtra revenue-division listings.
-- Superseded names are kept as `aliases` so PIN/search matching still works.
-- Every row is additive/idempotent (`on conflict ... do nothing`) and
-- carries `verification_status = 'awaiting_lgd_verification'` like the
-- existing Pune rows, pending an LGD NAPIX export -- see
-- docs/locations-import.md "Backfilling LGD codes".
--
-- Taluka centroid coordinates are intentionally left NULL here (unlike
-- Pune's hand-verified headquarters points): assigning a per-taluka
-- coordinate for ~340 talukas without a licensed boundary dataset or a
-- verified geocode for each one would mean guessing points, which is exactly
-- the kind of invented geographic data this feature must not introduce.
-- District-level centroids (used only as an approximate anchor, never for
-- vendor-facing distance) are the well-established headquarters-town
-- coordinate. NULL-centroid talukas are simply skipped by
-- rebuild_taluka_neighbors_internal (it already filters on
-- `centroid is not null`) rather than being force-fit with a wrong point;
-- they still fully support the Admin State/District/Taluka hierarchy and
-- the accept_vendor_applications availability toggle this migration exists
-- to unblock. Coordinates can be backfilled per-taluka in a later,
-- independently reviewed migration without touching this one.
-- ============================================================================

insert into public.geo_districts (
  state_id, name, latitude, longitude, source_name, source_url,
  coordinate_source, coordinate_method, verification_status
)
select state.id, district.name, district.lat, district.lng,
  'Maharashtra Revenue Department district list (post 2023/2024 renaming notifications)',
  'https://revenue.maharashtra.gov.in',
  'District headquarters town, representative point', 'representative_headquarters',
  'awaiting_lgd_verification'
from public.geo_states state
cross join (values
  ('Ahilyanagar', 19.0952, 74.7496),
  ('Akola', 20.7002, 77.0082),
  ('Amravati', 20.9320, 77.7523),
  ('Chhatrapati Sambhajinagar', 19.8762, 75.3433),
  ('Beed', 18.9891, 75.7601),
  ('Bhandara', 21.1704, 79.6547),
  ('Buldhana', 20.5293, 76.1836),
  ('Chandrapur', 19.9615, 79.2961),
  ('Dhule', 20.9042, 74.7749),
  ('Gadchiroli', 20.1809, 80.0021),
  ('Gondia', 21.4602, 80.1922),
  ('Hingoli', 19.7160, 77.1490),
  ('Jalgaon', 21.0077, 75.5626),
  ('Jalna', 19.8410, 75.8864),
  ('Kolhapur', 16.7050, 74.2433),
  ('Latur', 18.4088, 76.5604),
  ('Mumbai City', 18.9388, 72.8354),
  ('Mumbai Suburban', 19.0760, 72.8777),
  ('Nagpur', 21.1458, 79.0882),
  ('Nanded', 19.1383, 77.3210),
  ('Nandurbar', 21.3667, 74.2400),
  ('Nashik', 19.9975, 73.7898),
  ('Dharashiv', 18.1667, 76.0333),
  ('Palghar', 19.6970, 72.7650),
  ('Parbhani', 19.2704, 76.7600),
  ('Raigad', 18.6414, 72.8722),
  ('Ratnagiri', 16.9902, 73.3120),
  ('Sangli', 16.8524, 74.5815),
  ('Satara', 17.6805, 74.0183),
  ('Sindhudurg', 16.0987, 73.6821),
  ('Solapur', 17.6599, 75.9064),
  ('Thane', 19.2183, 72.9781),
  ('Wardha', 20.7453, 78.6022),
  ('Washim', 20.1113, 77.1330),
  ('Yavatmal', 20.3888, 78.1204)
) as district(name, lat, lng)
where lower(state.name) = 'maharashtra'
on conflict (state_id, lower(name)) do nothing;

-- ----------------------------------------------------------------------------
-- Talukas, one district per block. `aliases` preserves the pre-rename or
-- commonly-seen name so lookup-india-pincode's alias-aware matching keeps
-- resolving PIN codes that reference the older name.
-- ----------------------------------------------------------------------------

insert into public.geo_talukas (district_id, name, aliases, is_active, source_name, verification_status)
select d.id, t.name, t.aliases, true,
  'Maharashtra Revenue Department district list (post 2023/2024 renaming notifications)',
  'awaiting_lgd_verification'
from public.geo_districts d
join public.geo_states s on s.id = d.state_id
cross join (values
  ('Ahilyanagar', array['Nagar','Ahmednagar']::text[]),
  ('Shevgaon', array[]::text[]), ('Pathardi', array[]::text[]), ('Parner', array[]::text[]),
  ('Sangamner', array[]::text[]), ('Kopargaon', array[]::text[]), ('Akole', array[]::text[]),
  ('Shrirampur', array[]::text[]), ('Nevasa', array[]::text[]), ('Rahata', array[]::text[]),
  ('Rahuri', array[]::text[]), ('Shrigonda', array[]::text[]), ('Karjat', array[]::text[]),
  ('Jamkhed', array[]::text[])
) as t(name, aliases)
where lower(s.name) = 'maharashtra' and lower(d.name) = 'ahilyanagar'
on conflict (district_id, lower(name)) do nothing;

insert into public.geo_talukas (district_id, name, aliases, is_active, source_name, verification_status)
select d.id, t.name, t.aliases, true,
  'Maharashtra Revenue Department district list', 'awaiting_lgd_verification'
from public.geo_districts d join public.geo_states s on s.id = d.state_id
cross join (values
  ('Akola', array[]::text[]), ('Akot', array[]::text[]), ('Telhara', array[]::text[]),
  ('Balapur', array[]::text[]), ('Patur', array[]::text[]), ('Murtajapur', array[]::text[]),
  ('Barshitakli', array[]::text[])
) as t(name, aliases)
where lower(s.name) = 'maharashtra' and lower(d.name) = 'akola'
on conflict (district_id, lower(name)) do nothing;

insert into public.geo_talukas (district_id, name, aliases, is_active, source_name, verification_status)
select d.id, t.name, t.aliases, true,
  'Maharashtra Revenue Department district list', 'awaiting_lgd_verification'
from public.geo_districts d join public.geo_states s on s.id = d.state_id
cross join (values
  ('Amravati', array[]::text[]), ('Bhatkuli', array[]::text[]),
  ('Nandgaon Khandeshwar', array[]::text[]), ('Chandur Railway', array[]::text[]),
  ('Dharni', array[]::text[]), ('Chikhaldara', array[]::text[]), ('Achalpur', array[]::text[]),
  ('Chandur Bazar', array[]::text[]), ('Morshi', array[]::text[]), ('Warud', array[]::text[]),
  ('Daryapur', array[]::text[]), ('Anjangaon Surji', array[]::text[]),
  ('Dhamangaon Railway', array[]::text[]), ('Teosa', array['Tiosa']::text[])
) as t(name, aliases)
where lower(s.name) = 'maharashtra' and lower(d.name) = 'amravati'
on conflict (district_id, lower(name)) do nothing;

insert into public.geo_talukas (district_id, name, aliases, is_active, source_name, verification_status)
select d.id, t.name, t.aliases, true,
  'Maharashtra Revenue Department district list (post 2023 renaming notification)', 'awaiting_lgd_verification'
from public.geo_districts d join public.geo_states s on s.id = d.state_id
cross join (values
  ('Chhatrapati Sambhajinagar', array['Aurangabad']::text[]), ('Kannad', array[]::text[]),
  ('Soegaon', array[]::text[]), ('Sillod', array[]::text[]), ('Phulambri', array[]::text[]),
  ('Khuldabad', array[]::text[]), ('Vaijapur', array[]::text[]), ('Gangapur', array[]::text[]),
  ('Paithan', array[]::text[])
) as t(name, aliases)
where lower(s.name) = 'maharashtra' and lower(d.name) = 'chhatrapati sambhajinagar'
on conflict (district_id, lower(name)) do nothing;

insert into public.geo_talukas (district_id, name, aliases, is_active, source_name, verification_status)
select d.id, t.name, t.aliases, true,
  'Maharashtra Revenue Department district list', 'awaiting_lgd_verification'
from public.geo_districts d join public.geo_states s on s.id = d.state_id
cross join (values
  ('Beed', array[]::text[]), ('Ashti', array[]::text[]), ('Patoda', array[]::text[]),
  ('Shirur Kasar', array[]::text[]), ('Georai', array[]::text[]), ('Majalgaon', array[]::text[]),
  ('Wadwani', array[]::text[]), ('Kaij', array[]::text[]), ('Dharur', array[]::text[]),
  ('Parli', array[]::text[]), ('Ambejogai', array[]::text[])
) as t(name, aliases)
where lower(s.name) = 'maharashtra' and lower(d.name) = 'beed'
on conflict (district_id, lower(name)) do nothing;

insert into public.geo_talukas (district_id, name, aliases, is_active, source_name, verification_status)
select d.id, t.name, t.aliases, true,
  'Maharashtra Revenue Department district list', 'awaiting_lgd_verification'
from public.geo_districts d join public.geo_states s on s.id = d.state_id
cross join (values
  ('Bhandara', array[]::text[]), ('Tumsar', array[]::text[]), ('Pauni', array[]::text[]),
  ('Mohadi', array[]::text[]), ('Sakoli', array[]::text[]), ('Lakhni', array[]::text[]),
  ('Lakhandur', array[]::text[])
) as t(name, aliases)
where lower(s.name) = 'maharashtra' and lower(d.name) = 'bhandara'
on conflict (district_id, lower(name)) do nothing;

insert into public.geo_talukas (district_id, name, aliases, is_active, source_name, verification_status)
select d.id, t.name, t.aliases, true,
  'Maharashtra Revenue Department district list', 'awaiting_lgd_verification'
from public.geo_districts d join public.geo_states s on s.id = d.state_id
cross join (values
  ('Buldhana', array[]::text[]), ('Chikhli', array[]::text[]), ('Deulgaon Raja', array[]::text[]),
  ('Jalgaon Jamod', array[]::text[]), ('Sangrampur', array[]::text[]), ('Malkapur', array[]::text[]),
  ('Motala', array[]::text[]), ('Nandura', array[]::text[]), ('Khamgaon', array[]::text[]),
  ('Shegaon', array[]::text[]), ('Mehkar', array[]::text[]), ('Sindkhed Raja', array[]::text[]),
  ('Lonar', array[]::text[])
) as t(name, aliases)
where lower(s.name) = 'maharashtra' and lower(d.name) = 'buldhana'
on conflict (district_id, lower(name)) do nothing;

insert into public.geo_talukas (district_id, name, aliases, is_active, source_name, verification_status)
select d.id, t.name, t.aliases, true,
  'Maharashtra Revenue Department district list', 'awaiting_lgd_verification'
from public.geo_districts d join public.geo_states s on s.id = d.state_id
cross join (values
  ('Chandrapur', array[]::text[]), ('Saoli', array[]::text[]), ('Mul', array[]::text[]),
  ('Ballarpur', array[]::text[]), ('Pombhurna', array[]::text[]), ('Gondpimpri', array[]::text[]),
  ('Warora', array[]::text[]), ('Chimur', array[]::text[]), ('Bhadravati', array[]::text[]),
  ('Brahmapuri', array['Bramhapuri']::text[]), ('Nagbhid', array[]::text[]),
  ('Sindewahi', array[]::text[]), ('Rajura', array[]::text[]), ('Korpana', array[]::text[]),
  ('Jivati', array[]::text[])
) as t(name, aliases)
where lower(s.name) = 'maharashtra' and lower(d.name) = 'chandrapur'
on conflict (district_id, lower(name)) do nothing;

insert into public.geo_talukas (district_id, name, aliases, is_active, source_name, verification_status)
select d.id, t.name, t.aliases, true,
  'Maharashtra Revenue Department district list', 'awaiting_lgd_verification'
from public.geo_districts d join public.geo_states s on s.id = d.state_id
cross join (values
  ('Dhule', array[]::text[]), ('Sakri', array[]::text[]), ('Sindkheda', array[]::text[]),
  ('Shirpur', array[]::text[])
) as t(name, aliases)
where lower(s.name) = 'maharashtra' and lower(d.name) = 'dhule'
on conflict (district_id, lower(name)) do nothing;

insert into public.geo_talukas (district_id, name, aliases, is_active, source_name, verification_status)
select d.id, t.name, t.aliases, true,
  'Maharashtra Revenue Department district list', 'awaiting_lgd_verification'
from public.geo_districts d join public.geo_states s on s.id = d.state_id
cross join (values
  ('Gadchiroli', array[]::text[]), ('Dhanora', array[]::text[]), ('Chamorshi', array[]::text[]),
  ('Mulchera', array[]::text[]), ('Desaiganj', array['Vadasa']::text[]), ('Armori', array[]::text[]),
  ('Kurkheda', array[]::text[]), ('Korchi', array[]::text[]), ('Aheri', array[]::text[]),
  ('Bhamragad', array[]::text[]), ('Sironcha', array[]::text[]), ('Etapalli', array[]::text[])
) as t(name, aliases)
where lower(s.name) = 'maharashtra' and lower(d.name) = 'gadchiroli'
on conflict (district_id, lower(name)) do nothing;

insert into public.geo_talukas (district_id, name, aliases, is_active, source_name, verification_status)
select d.id, t.name, t.aliases, true,
  'Maharashtra Revenue Department district list', 'awaiting_lgd_verification'
from public.geo_districts d join public.geo_states s on s.id = d.state_id
cross join (values
  ('Gondia', array[]::text[]), ('Tirora', array[]::text[]), ('Goregaon', array[]::text[]),
  ('Arjuni Morgaon', array[]::text[]), ('Amgaon', array[]::text[]), ('Salekasa', array[]::text[]),
  ('Sadak Arjuni', array[]::text[]), ('Deori', array[]::text[])
) as t(name, aliases)
where lower(s.name) = 'maharashtra' and lower(d.name) = 'gondia'
on conflict (district_id, lower(name)) do nothing;

insert into public.geo_talukas (district_id, name, aliases, is_active, source_name, verification_status)
select d.id, t.name, t.aliases, true,
  'Maharashtra Revenue Department district list', 'awaiting_lgd_verification'
from public.geo_districts d join public.geo_states s on s.id = d.state_id
cross join (values
  ('Hingoli', array[]::text[]), ('Sengaon', array[]::text[]), ('Kalamnuri', array[]::text[]),
  ('Basmath', array[]::text[]), ('Aundha Nagnath', array[]::text[])
) as t(name, aliases)
where lower(s.name) = 'maharashtra' and lower(d.name) = 'hingoli'
on conflict (district_id, lower(name)) do nothing;

insert into public.geo_talukas (district_id, name, aliases, is_active, source_name, verification_status)
select d.id, t.name, t.aliases, true,
  'Maharashtra Revenue Department district list', 'awaiting_lgd_verification'
from public.geo_districts d join public.geo_states s on s.id = d.state_id
cross join (values
  ('Jalgaon', array[]::text[]), ('Jamner', array[]::text[]), ('Erandol', array[]::text[]),
  ('Dharangaon', array[]::text[]), ('Bhusawal', array[]::text[]), ('Raver', array[]::text[]),
  ('Muktainagar', array['Edalabad']::text[]), ('Bodwad', array[]::text[]), ('Yawal', array[]::text[]),
  ('Amalner', array[]::text[]), ('Parola', array[]::text[]), ('Chopda', array[]::text[]),
  ('Pachora', array[]::text[]), ('Bhadgaon', array[]::text[]), ('Chalisgaon', array[]::text[])
) as t(name, aliases)
where lower(s.name) = 'maharashtra' and lower(d.name) = 'jalgaon'
on conflict (district_id, lower(name)) do nothing;

insert into public.geo_talukas (district_id, name, aliases, is_active, source_name, verification_status)
select d.id, t.name, t.aliases, true,
  'Maharashtra Revenue Department district list', 'awaiting_lgd_verification'
from public.geo_districts d join public.geo_states s on s.id = d.state_id
cross join (values
  ('Jalna', array[]::text[]), ('Bhokardan', array[]::text[]), ('Jafrabad', array[]::text[]),
  ('Badnapur', array[]::text[]), ('Ambad', array[]::text[]), ('Ghansawangi', array[]::text[]),
  ('Partur', array[]::text[]), ('Mantha', array[]::text[])
) as t(name, aliases)
where lower(s.name) = 'maharashtra' and lower(d.name) = 'jalna'
on conflict (district_id, lower(name)) do nothing;

insert into public.geo_talukas (district_id, name, aliases, is_active, source_name, verification_status)
select d.id, t.name, t.aliases, true,
  'Maharashtra Revenue Department district list', 'awaiting_lgd_verification'
from public.geo_districts d join public.geo_states s on s.id = d.state_id
cross join (values
  ('Karvir', array[]::text[]), ('Panhala', array[]::text[]), ('Shahuwadi', array[]::text[]),
  ('Kagal', array[]::text[]), ('Hatkanangale', array[]::text[]), ('Shirol', array[]::text[]),
  ('Radhanagari', array[]::text[]), ('Gaganbawada', array[]::text[]), ('Bhudargad', array[]::text[]),
  ('Gadhinglaj', array[]::text[]), ('Chandgad', array[]::text[]), ('Ajra', array[]::text[])
) as t(name, aliases)
where lower(s.name) = 'maharashtra' and lower(d.name) = 'kolhapur'
on conflict (district_id, lower(name)) do nothing;

insert into public.geo_talukas (district_id, name, aliases, is_active, source_name, verification_status)
select d.id, t.name, t.aliases, true,
  'Maharashtra Revenue Department district list', 'awaiting_lgd_verification'
from public.geo_districts d join public.geo_states s on s.id = d.state_id
cross join (values
  ('Latur', array[]::text[]), ('Renapur', array[]::text[]), ('Ahmedpur', array[]::text[]),
  ('Jalkot', array[]::text[]), ('Chakur', array[]::text[]), ('Shirur Anantpal', array[]::text[]),
  ('Ausa', array[]::text[]), ('Nilanga', array[]::text[]), ('Deoni', array[]::text[]),
  ('Udgir', array[]::text[])
) as t(name, aliases)
where lower(s.name) = 'maharashtra' and lower(d.name) = 'latur'
on conflict (district_id, lower(name)) do nothing;

-- Mumbai City intentionally has no taluka rows -- see header note.

insert into public.geo_talukas (district_id, name, aliases, is_active, source_name, verification_status)
select d.id, t.name, t.aliases, true,
  'Maharashtra Revenue Department district list', 'awaiting_lgd_verification'
from public.geo_districts d join public.geo_states s on s.id = d.state_id
cross join (values
  ('Andheri', array[]::text[]), ('Borivali', array[]::text[]), ('Kurla', array[]::text[])
) as t(name, aliases)
where lower(s.name) = 'maharashtra' and lower(d.name) = 'mumbai suburban'
on conflict (district_id, lower(name)) do nothing;

insert into public.geo_talukas (district_id, name, aliases, is_active, source_name, verification_status)
select d.id, t.name, t.aliases, true,
  'Maharashtra Revenue Department district list', 'awaiting_lgd_verification'
from public.geo_districts d join public.geo_states s on s.id = d.state_id
cross join (values
  ('Nagpur City', array['Nagpur Urban']::text[]), ('Nagpur Rural', array[]::text[]),
  ('Kamptee', array[]::text[]), ('Hingna', array[]::text[]), ('Katol', array[]::text[]),
  ('Narkhed', array[]::text[]), ('Savner', array[]::text[]), ('Kalameshwar', array[]::text[]),
  ('Ramtek', array[]::text[]), ('Mouda', array[]::text[]), ('Parseoni', array[]::text[]),
  ('Umred', array[]::text[]), ('Kuhi', array[]::text[]), ('Bhiwapur', array[]::text[])
) as t(name, aliases)
where lower(s.name) = 'maharashtra' and lower(d.name) = 'nagpur'
on conflict (district_id, lower(name)) do nothing;

insert into public.geo_talukas (district_id, name, aliases, is_active, source_name, verification_status)
select d.id, t.name, t.aliases, true,
  'Maharashtra Revenue Department district list', 'awaiting_lgd_verification'
from public.geo_districts d join public.geo_states s on s.id = d.state_id
cross join (values
  ('Nanded', array[]::text[]), ('Ardhapur', array[]::text[]), ('Mudkhed', array[]::text[]),
  ('Bhokar', array[]::text[]), ('Umri', array[]::text[]), ('Loha', array[]::text[]),
  ('Kandhar', array[]::text[]), ('Kinwat', array[]::text[]), ('Himayatnagar', array[]::text[]),
  ('Hadgaon', array[]::text[]), ('Mahur', array[]::text[]), ('Deglur', array[]::text[]),
  ('Mukhed', array[]::text[]), ('Dharmabad', array[]::text[]), ('Biloli', array[]::text[]),
  ('Naigaon', array['Naigaon Khairgaon']::text[])
) as t(name, aliases)
where lower(s.name) = 'maharashtra' and lower(d.name) = 'nanded'
on conflict (district_id, lower(name)) do nothing;

insert into public.geo_talukas (district_id, name, aliases, is_active, source_name, verification_status)
select d.id, t.name, t.aliases, true,
  'Maharashtra Revenue Department district list', 'awaiting_lgd_verification'
from public.geo_districts d join public.geo_states s on s.id = d.state_id
cross join (values
  ('Nandurbar', array[]::text[]), ('Navapur', array[]::text[]), ('Shahada', array[]::text[]),
  ('Taloda', array[]::text[]), ('Akkalkuwa', array[]::text[]), ('Akrani', array['Dhadgaon']::text[])
) as t(name, aliases)
where lower(s.name) = 'maharashtra' and lower(d.name) = 'nandurbar'
on conflict (district_id, lower(name)) do nothing;

insert into public.geo_talukas (district_id, name, aliases, is_active, source_name, verification_status)
select d.id, t.name, t.aliases, true,
  'Maharashtra Revenue Department district list', 'awaiting_lgd_verification'
from public.geo_districts d join public.geo_states s on s.id = d.state_id
cross join (values
  ('Nashik', array[]::text[]), ('Igatpuri', array[]::text[]), ('Dindori', array[]::text[]),
  ('Peth', array[]::text[]), ('Trimbakeshwar', array[]::text[]), ('Kalwan', array[]::text[]),
  ('Deola', array[]::text[]), ('Surgana', array[]::text[]), ('Baglan', array['Satana']::text[]),
  ('Malegaon', array[]::text[]), ('Nandgaon', array[]::text[]), ('Chandwad', array[]::text[]),
  ('Niphad', array[]::text[]), ('Sinnar', array[]::text[]), ('Yeola', array[]::text[])
) as t(name, aliases)
where lower(s.name) = 'maharashtra' and lower(d.name) = 'nashik'
on conflict (district_id, lower(name)) do nothing;

insert into public.geo_talukas (district_id, name, aliases, is_active, source_name, verification_status)
select d.id, t.name, t.aliases, true,
  'Maharashtra Revenue Department district list (post 2023 renaming notification)', 'awaiting_lgd_verification'
from public.geo_districts d join public.geo_states s on s.id = d.state_id
cross join (values
  ('Dharashiv', array['Osmanabad']::text[]), ('Tuljapur', array[]::text[]), ('Bhum', array[]::text[]),
  ('Paranda', array[]::text[]), ('Washi', array[]::text[]), ('Kalamb', array[]::text[]),
  ('Lohara', array[]::text[]), ('Umarga', array[]::text[])
) as t(name, aliases)
where lower(s.name) = 'maharashtra' and lower(d.name) = 'dharashiv'
on conflict (district_id, lower(name)) do nothing;

insert into public.geo_talukas (district_id, name, aliases, is_active, source_name, verification_status)
select d.id, t.name, t.aliases, true,
  'Maharashtra Revenue Department district list', 'awaiting_lgd_verification'
from public.geo_districts d join public.geo_states s on s.id = d.state_id
cross join (values
  ('Palghar', array[]::text[]), ('Vasai', array[]::text[]), ('Dahanu', array[]::text[]),
  ('Talasari', array[]::text[]), ('Jawhar', array[]::text[]), ('Mokhada', array[]::text[]),
  ('Wada', array[]::text[]), ('Vikramgad', array[]::text[])
) as t(name, aliases)
where lower(s.name) = 'maharashtra' and lower(d.name) = 'palghar'
on conflict (district_id, lower(name)) do nothing;

insert into public.geo_talukas (district_id, name, aliases, is_active, source_name, verification_status)
select d.id, t.name, t.aliases, true,
  'Maharashtra Revenue Department district list', 'awaiting_lgd_verification'
from public.geo_districts d join public.geo_states s on s.id = d.state_id
cross join (values
  ('Parbhani', array[]::text[]), ('Sonpeth', array[]::text[]), ('Gangakhed', array[]::text[]),
  ('Palam', array[]::text[]), ('Purna', array[]::text[]), ('Sailu', array[]::text[]),
  ('Jintur', array[]::text[]), ('Manwath', array[]::text[]), ('Pathri', array[]::text[])
) as t(name, aliases)
where lower(s.name) = 'maharashtra' and lower(d.name) = 'parbhani'
on conflict (district_id, lower(name)) do nothing;

insert into public.geo_talukas (district_id, name, aliases, is_active, source_name, verification_status)
select d.id, t.name, t.aliases, true,
  'Maharashtra Revenue Department district list', 'awaiting_lgd_verification'
from public.geo_districts d join public.geo_states s on s.id = d.state_id
cross join (values
  ('Pen', array[]::text[]), ('Alibaug', array[]::text[]), ('Murud', array[]::text[]),
  ('Panvel', array[]::text[]), ('Uran', array[]::text[]), ('Karjat', array['Matheran']::text[]),
  ('Khalapur', array[]::text[]), ('Mangaon', array[]::text[]), ('Tala', array[]::text[]),
  ('Roha', array[]::text[]), ('Sudhagad', array['Pali']::text[]), ('Mahad', array[]::text[]),
  ('Poladpur', array[]::text[]), ('Shrivardhan', array[]::text[]), ('Mhasla', array[]::text[])
) as t(name, aliases)
where lower(s.name) = 'maharashtra' and lower(d.name) = 'raigad'
on conflict (district_id, lower(name)) do nothing;

insert into public.geo_talukas (district_id, name, aliases, is_active, source_name, verification_status)
select d.id, t.name, t.aliases, true,
  'Maharashtra Revenue Department district list', 'awaiting_lgd_verification'
from public.geo_districts d join public.geo_states s on s.id = d.state_id
cross join (values
  ('Ratnagiri', array[]::text[]), ('Sangameshwar', array['Deorukh']::text[]),
  ('Lanja', array[]::text[]), ('Rajapur', array[]::text[]), ('Chiplun', array[]::text[]),
  ('Guhagar', array[]::text[]), ('Dapoli', array[]::text[]), ('Mandangad', array[]::text[]),
  ('Khed', array[]::text[])
) as t(name, aliases)
where lower(s.name) = 'maharashtra' and lower(d.name) = 'ratnagiri'
on conflict (district_id, lower(name)) do nothing;

insert into public.geo_talukas (district_id, name, aliases, is_active, source_name, verification_status)
select d.id, t.name, t.aliases, true,
  'Maharashtra Revenue Department district list', 'awaiting_lgd_verification'
from public.geo_districts d join public.geo_states s on s.id = d.state_id
cross join (values
  ('Miraj', array[]::text[]), ('Kavathe Mahankal', array[]::text[]), ('Tasgaon', array[]::text[]),
  ('Jat', array[]::text[]), ('Walwa', array['Islampur']::text[]), ('Shirala', array[]::text[]),
  ('Khanapur', array['Vita']::text[]), ('Atpadi', array[]::text[]), ('Palus', array[]::text[]),
  ('Kadegaon', array[]::text[])
) as t(name, aliases)
where lower(s.name) = 'maharashtra' and lower(d.name) = 'sangli'
on conflict (district_id, lower(name)) do nothing;

insert into public.geo_talukas (district_id, name, aliases, is_active, source_name, verification_status)
select d.id, t.name, t.aliases, true,
  'Maharashtra Revenue Department district list', 'awaiting_lgd_verification'
from public.geo_districts d join public.geo_states s on s.id = d.state_id
cross join (values
  ('Satara', array[]::text[]), ('Jaoli', array[]::text[]), ('Koregaon', array[]::text[]),
  ('Wai', array[]::text[]), ('Mahabaleshwar', array[]::text[]), ('Khandala', array[]::text[]),
  ('Phaltan', array[]::text[]), ('Man', array['Dahiwadi']::text[]), ('Khatav', array['Vaduj']::text[]),
  ('Patan', array[]::text[]), ('Karad', array[]::text[])
) as t(name, aliases)
where lower(s.name) = 'maharashtra' and lower(d.name) = 'satara'
on conflict (district_id, lower(name)) do nothing;

insert into public.geo_talukas (district_id, name, aliases, is_active, source_name, verification_status)
select d.id, t.name, t.aliases, true,
  'Maharashtra Revenue Department district list', 'awaiting_lgd_verification'
from public.geo_districts d join public.geo_states s on s.id = d.state_id
cross join (values
  ('Kankavli', array[]::text[]), ('Vaibhavwadi', array[]::text[]), ('Devgad', array[]::text[]),
  ('Malwan', array[]::text[]), ('Sawantwadi', array[]::text[]), ('Kudal', array[]::text[]),
  ('Vengurla', array[]::text[]), ('Dodamarg', array['Kasal']::text[])
) as t(name, aliases)
where lower(s.name) = 'maharashtra' and lower(d.name) = 'sindhudurg'
on conflict (district_id, lower(name)) do nothing;

insert into public.geo_talukas (district_id, name, aliases, is_active, source_name, verification_status)
select d.id, t.name, t.aliases, true,
  'Maharashtra Revenue Department district list', 'awaiting_lgd_verification'
from public.geo_districts d join public.geo_states s on s.id = d.state_id
cross join (values
  ('Solapur North', array[]::text[]), ('Barshi', array[]::text[]), ('Solapur South', array[]::text[]),
  ('Akkalkot', array[]::text[]), ('Madha', array[]::text[]), ('Karmala', array[]::text[]),
  ('Pandharpur', array[]::text[]), ('Mohol', array[]::text[]), ('Malshiras', array[]::text[]),
  ('Sangole', array[]::text[]), ('Mangalvedhe', array[]::text[])
) as t(name, aliases)
where lower(s.name) = 'maharashtra' and lower(d.name) = 'solapur'
on conflict (district_id, lower(name)) do nothing;

insert into public.geo_talukas (district_id, name, aliases, is_active, source_name, verification_status)
select d.id, t.name, t.aliases, true,
  'Maharashtra Revenue Department district list', 'awaiting_lgd_verification'
from public.geo_districts d join public.geo_states s on s.id = d.state_id
cross join (values
  ('Thane', array[]::text[]), ('Kalyan', array[]::text[]), ('Murbad', array[]::text[]),
  ('Bhiwandi', array[]::text[]), ('Shahapur', array[]::text[]), ('Ulhasnagar', array[]::text[]),
  ('Ambarnath', array[]::text[])
) as t(name, aliases)
where lower(s.name) = 'maharashtra' and lower(d.name) = 'thane'
on conflict (district_id, lower(name)) do nothing;

insert into public.geo_talukas (district_id, name, aliases, is_active, source_name, verification_status)
select d.id, t.name, t.aliases, true,
  'Maharashtra Revenue Department district list', 'awaiting_lgd_verification'
from public.geo_districts d join public.geo_states s on s.id = d.state_id
cross join (values
  ('Wardha', array[]::text[]), ('Deoli', array[]::text[]), ('Seloo', array[]::text[]),
  ('Arvi', array[]::text[]), ('Ashti', array[]::text[]), ('Karanja', array[]::text[]),
  ('Hinganghat', array[]::text[]), ('Samudrapur', array[]::text[])
) as t(name, aliases)
where lower(s.name) = 'maharashtra' and lower(d.name) = 'wardha'
on conflict (district_id, lower(name)) do nothing;

insert into public.geo_talukas (district_id, name, aliases, is_active, source_name, verification_status)
select d.id, t.name, t.aliases, true,
  'Maharashtra Revenue Department district list', 'awaiting_lgd_verification'
from public.geo_districts d join public.geo_states s on s.id = d.state_id
cross join (values
  ('Washim', array[]::text[]), ('Malegaon', array[]::text[]), ('Risod', array[]::text[]),
  ('Mangrulpir', array[]::text[]), ('Karanja', array[]::text[]), ('Manora', array[]::text[])
) as t(name, aliases)
where lower(s.name) = 'maharashtra' and lower(d.name) = 'washim'
on conflict (district_id, lower(name)) do nothing;

insert into public.geo_talukas (district_id, name, aliases, is_active, source_name, verification_status)
select d.id, t.name, t.aliases, true,
  'Maharashtra Revenue Department district list', 'awaiting_lgd_verification'
from public.geo_districts d join public.geo_states s on s.id = d.state_id
cross join (values
  ('Yavatmal', array[]::text[]), ('Arni', array[]::text[]), ('Babhulgaon', array[]::text[]),
  ('Kalamb', array[]::text[]), ('Darwha', array[]::text[]), ('Digras', array[]::text[]),
  ('Ner', array[]::text[]), ('Pusad', array[]::text[]), ('Umarkhed', array[]::text[]),
  ('Mahagaon', array[]::text[]), ('Kelapur', array['Pandharkawada']::text[]),
  ('Ralegaon', array[]::text[]), ('Ghatanji', array[]::text[]), ('Wani', array[]::text[]),
  ('Maregaon', array[]::text[]), ('Zari Jamani', array[]::text[])
) as t(name, aliases)
where lower(s.name) = 'maharashtra' and lower(d.name) = 'yavatmal'
on conflict (district_id, lower(name)) do nothing;

-- Regenerate Maharashtra's nearby-Taluka cache: Pune's talukas (which do
-- have centroids) get correct neighbours; the many now-NULL-centroid
-- talukas above are simply skipped by the function (see header note) rather
-- than assigned a guessed distance.
select private.rebuild_taluka_neighbors_internal(
  (select id from public.geo_states where lower(name) = 'maharashtra'),
  8,
  150
);

commit;
