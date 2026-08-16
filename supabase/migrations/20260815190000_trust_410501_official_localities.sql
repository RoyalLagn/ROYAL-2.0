begin;

-- The exact 410501 office coordinates were imported from the checked-in
-- India Post directory in 20260814000000, but that migration did not promote
-- the matching locality rows from the earlier postalpincode.in fallback.
-- Their State/District/Taluka hierarchy is already canonical (Khed, Pune,
-- Maharashtra), so keeping is_trusted=false produces a contradictory
-- "unofficial candidate" message for an official locality such as Bahul.
with official(locality_name) as (values
  ('Ambethan'),
  ('Bahul'),
  ('Bhose'),
  ('Chakan'),
  ('Gadad'),
  ('Kalus'),
  ('Khalumbre'),
  ('Koyali'),
  ('Kuruli'),
  ('Mahalunge Ingale'),
  ('Nighoje'),
  ('Pimpalgaon Tarfe Chakan'),
  ('Rase'),
  ('Shive'),
  ('Vadgaon Ghenanad'),
  ('Vasuli'),
  ('Waki BK')
)
update public.geo_pincode_localities locality
set source = case
      when locality.admin_confirmed then locality.source
      else 'india_post_ogd'
    end,
    source_trust = greatest(locality.source_trust, 3),
    is_trusted = true,
    verified_at = now(),
    updated_at = now()
from official,
     public.geo_talukas taluka,
     public.geo_districts district,
     public.geo_states state
where locality.pincode = '410501'
  and lower(btrim(locality.locality_name)) = lower(official.locality_name)
  and locality.latitude is not null
  and locality.longitude is not null
  and taluka.id = locality.taluka_id
  and lower(taluka.name) = 'khed'
  and district.id = locality.district_id
  and district.id = taluka.district_id
  and lower(district.name) = 'pune'
  and state.id = locality.state_id
  and state.id = district.state_id
  and lower(state.name) = 'maharashtra';

-- Recompute the PIN-level counts/status from the corrected locality rows so
-- every caller sees one consistent canonical result immediately.
select private.refresh_geo_pincode_aggregate('410501');

commit;
