-- Make every array-derived identifier explicit. This avoids PL/pgSQL/PostgREST
-- resolving the unnest record alias as a composite value during validation.
create or replace function public.set_home_featured_vendors(p_vendor_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_count integer := cardinality(coalesce(p_vendor_ids, array[]::uuid[]));
  distinct_count integer;
  eligible_count integer;
begin
  if not private.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  if selected_count > 10 then
    raise exception 'A maximum of 10 featured vendors is allowed' using errcode = '22023';
  end if;

  select count(*)::integer
  into distinct_count
  from (
    select distinct selected.selected_id
    from unnest(coalesce(p_vendor_ids, array[]::uuid[])) as selected(selected_id)
  ) unique_selection;

  if distinct_count <> selected_count then
    raise exception 'Featured vendors must be unique' using errcode = '22023';
  end if;

  select count(*)::integer
  into eligible_count
  from public.vendors as vendor
  join unnest(coalesce(p_vendor_ids, array[]::uuid[])) as selected(selected_id)
    on selected.selected_id = vendor.id
  where vendor.is_verified
    and coalesce(vendor.public_profile_enabled, true)
    and coalesce(vendor.management_status, 'active') = 'active';

  if eligible_count <> selected_count then
    raise exception 'Only active, verified public vendors can be featured' using errcode = '22023';
  end if;

  delete from public.home_featured_vendors;

  insert into public.home_featured_vendors (vendor_id, display_order, updated_at)
  select selected.selected_id, (selected.ordinal_position - 1)::integer, now()
  from unnest(coalesce(p_vendor_ids, array[]::uuid[])) with ordinality
    as selected(selected_id, ordinal_position);
end;
$$;

revoke all on function public.set_home_featured_vendors(uuid[]) from public, anon;
grant execute on function public.set_home_featured_vendors(uuid[]) to authenticated;

