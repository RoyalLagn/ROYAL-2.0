begin;

-- Promote the three 411062 offices from the checked-in Department of Posts
-- directory. Their hierarchy was already matched; this adds the authoritative
-- office coordinates needed for exact vendor/current-location behavior.
update public.geo_pincode_localities
set latitude = source_row.latitude,
    longitude = source_row.longitude,
    source = 'india_post_ogd',
    source_trust = 4,
    is_trusted = true,
    verified_at = now()
from (values
  ('chikhali', 18.6710370::double precision, 73.8242620::double precision),
  ('talwade', 18.6658890::double precision, 73.7784240::double precision),
  ('rupeenagar', 18.6532222::double precision, 73.7679167::double precision)
) as source_row(normalized_name, latitude, longitude)
where geo_pincode_localities.pincode = '411062'
  and geo_pincode_localities.normalized_name = source_row.normalized_name;

select private.refresh_geo_pincode_aggregate('411062');

commit;
