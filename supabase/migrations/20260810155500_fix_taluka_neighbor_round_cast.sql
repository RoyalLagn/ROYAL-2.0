begin;

-- Fix: round(double precision, integer) has no overload in Postgres; cast
-- the st_distance() result to numeric first.
create or replace function private.rebuild_taluka_neighbors_internal(
  p_state_id uuid default null,
  p_max_neighbors integer default 8,
  p_max_distance_km numeric default 150
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  taluka record;
begin
  if p_max_neighbors < 1 or p_max_neighbors > 25 then
    raise exception 'max_neighbors must be between 1 and 25';
  end if;

  for taluka in
    select t.id, t.centroid
    from public.geo_talukas t
    join public.geo_districts d on d.id = t.district_id
    where t.is_active
      and t.centroid is not null
      and (p_state_id is null or d.state_id = p_state_id)
  loop
    delete from public.geo_taluka_neighbors where taluka_id = taluka.id;

    insert into public.geo_taluka_neighbors (
      taluka_id, nearby_taluka_id, distance_km, priority, relationship_type, generated_at
    )
    select
      taluka.id,
      other.id,
      round((extensions.st_distance(taluka.centroid, other.centroid) / 1000.0)::numeric, 3),
      row_number() over (order by extensions.st_distance(taluka.centroid, other.centroid)),
      'centroid_distance',
      now()
    from public.geo_talukas other
    where other.is_active
      and other.id <> taluka.id
      and other.centroid is not null
      and extensions.st_distance(taluka.centroid, other.centroid) <= (p_max_distance_km * 1000)
    order by extensions.st_distance(taluka.centroid, other.centroid)
    limit p_max_neighbors;
  end loop;

  return (select count(*)::integer from public.geo_taluka_neighbors);
end;
$$;

revoke all on function private.rebuild_taluka_neighbors_internal(uuid, integer, numeric) from public, anon, authenticated;

commit;
