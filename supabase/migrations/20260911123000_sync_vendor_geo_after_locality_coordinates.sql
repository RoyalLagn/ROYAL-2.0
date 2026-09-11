begin;

create or replace function private.sync_vendor_geo_after_locality_coordinates()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  vendor_row record;
begin
  if new.latitude is not distinct from old.latitude
     and new.longitude is not distinct from old.longitude then
    return new;
  end if;

  for vendor_row in
    select id, pincode, geo_pincode_locality_id
    from public.vendors
    where geo_pincode_locality_id = new.id
      and pincode = new.pincode
  loop
    perform private.resolve_vendor_geo_from_pincode(
      vendor_row.id,
      vendor_row.pincode,
      vendor_row.geo_pincode_locality_id
    );
  end loop;

  return new;
end;
$$;

revoke all on function private.sync_vendor_geo_after_locality_coordinates()
  from public, anon, authenticated;

drop trigger if exists geo_pincode_localities_sync_vendor_coordinates
  on public.geo_pincode_localities;
create trigger geo_pincode_localities_sync_vendor_coordinates
after update of latitude, longitude on public.geo_pincode_localities
for each row execute function private.sync_vendor_geo_after_locality_coordinates();

comment on function private.sync_vendor_geo_after_locality_coordinates() is
  'Re-resolves vendors immediately when their selected postal locality receives or changes exact coordinates.';

-- A small village may not have an exact OSM point. In that case the Edge
-- Function stores a verified PIN-centre point on geo_pincodes. Re-resolve
-- every vendor on that PIN immediately so Near Me works without requiring
-- a second manual save or any per-village hard-coding.
create or replace function private.sync_vendor_geo_after_pincode_coordinates()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  vendor_row record;
begin
  if new.latitude is not distinct from old.latitude
     and new.longitude is not distinct from old.longitude then
    return new;
  end if;

  for vendor_row in
    select id, pincode, geo_pincode_locality_id
    from public.vendors
    where pincode = new.pincode
  loop
    perform private.resolve_vendor_geo_from_pincode(
      vendor_row.id,
      vendor_row.pincode,
      vendor_row.geo_pincode_locality_id
    );
  end loop;

  return new;
end;
$$;

revoke all on function private.sync_vendor_geo_after_pincode_coordinates()
  from public, anon, authenticated;

drop trigger if exists geo_pincodes_sync_vendor_coordinates
  on public.geo_pincodes;
create trigger geo_pincodes_sync_vendor_coordinates
after update of latitude, longitude on public.geo_pincodes
for each row execute function private.sync_vendor_geo_after_pincode_coordinates();

comment on function private.sync_vendor_geo_after_pincode_coordinates() is
  'Re-resolves vendors immediately when a verified PIN-centre fallback receives or changes coordinates.';

commit;
