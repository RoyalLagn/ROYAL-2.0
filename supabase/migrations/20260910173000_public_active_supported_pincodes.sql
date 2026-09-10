begin;

grant select on table public.supported_pincodes to anon, authenticated;

drop policy if exists supported_pincodes_active_public_read on public.supported_pincodes;
create policy supported_pincodes_active_public_read
on public.supported_pincodes
for select
to anon, authenticated
using (
  is_active
  and exists (
    select 1
    from public.supported_cities city
    where city.id = supported_pincodes.city_id
      and city.is_active
  )
  and (
    area_id is null
    or exists (
      select 1
      from public.supported_areas area
      where area.id = supported_pincodes.area_id
        and area.is_active
    )
  )
);

commit;
