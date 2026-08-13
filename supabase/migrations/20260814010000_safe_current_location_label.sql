begin;

-- Resolve web GPS to RoyalLagn's own trusted locality data. Return no row
-- outside 5 km rather than guessing from a Taluka or District centroid.
create or replace function public.reverse_geocode_known_locality(
  customer_latitude double precision,
  customer_longitude double precision
)
returns table (locality_name text, district_name text, state_name text, distance_m double precision)
language sql
stable
security definer
set search_path = ''
as $$
  select locality.locality_name, district.name, state.name,
    extensions.st_distance(
      extensions.geography(extensions.st_setsrid(extensions.st_makepoint(customer_longitude, customer_latitude), 4326)),
      extensions.geography(extensions.st_setsrid(extensions.st_makepoint(locality.longitude, locality.latitude), 4326))
    ) as distance_m
  from public.geo_pincode_localities locality
  join public.geo_districts district on district.id = locality.district_id
  join public.geo_states state on state.id = locality.state_id
  where customer_latitude between -90 and 90
    and customer_longitude between -180 and 180
    and locality.is_active and locality.is_trusted
    and locality.latitude is not null and locality.longitude is not null
    and extensions.st_dwithin(
      extensions.geography(extensions.st_setsrid(extensions.st_makepoint(customer_longitude, customer_latitude), 4326)),
      extensions.geography(extensions.st_setsrid(extensions.st_makepoint(locality.longitude, locality.latitude), 4326)),
      5000
    )
  order by distance_m, locality.locality_name
  limit 1;
$$;

revoke all on function public.reverse_geocode_known_locality(double precision, double precision) from public;
grant execute on function public.reverse_geocode_known_locality(double precision, double precision) to anon, authenticated;

comment on function public.reverse_geocode_known_locality(double precision, double precision) is
  'Nearest trusted exact PIN locality within 5 km for a consented current-device coordinate; returns no row rather than guessing.';

commit;
