-- Versioned endpoint avoids PostgREST UUID-array coercion and any stale schema
-- cache entry for the original function. IDs are matched server-side.
create or replace function public.set_home_featured_vendors_v2(p_vendor_ids text[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_count integer := cardinality(coalesce(p_vendor_ids, array[]::text[]));
  inserted_count integer := 0;
begin
  if not private.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  if selected_count > 10 then
    raise exception 'A maximum of 10 featured vendors is allowed' using errcode = '22023';
  end if;

  if selected_count <> (
    select count(distinct input.vendor_id)::integer
    from unnest(coalesce(p_vendor_ids, array[]::text[])) as input(vendor_id)
  ) then
    raise exception 'Featured vendors must be unique' using errcode = '22023';
  end if;

  delete from public.home_featured_vendors;

  insert into public.home_featured_vendors (vendor_id, display_order, updated_at)
  select vendor.id, (input.ordinal_position - 1)::integer, now()
  from unnest(coalesce(p_vendor_ids, array[]::text[])) with ordinality
    as input(vendor_id, ordinal_position)
  join public.vendors as vendor on vendor.id::text = input.vendor_id
  where vendor.is_verified
    and coalesce(vendor.public_profile_enabled, true)
    and coalesce(vendor.management_status, 'active') = 'active'
  order by input.ordinal_position;

  get diagnostics inserted_count = row_count;
  if inserted_count <> selected_count then
    raise exception 'Only active, verified public vendors can be featured' using errcode = '22023';
  end if;

  return inserted_count;
end;
$$;

revoke all on function public.set_home_featured_vendors_v2(text[]) from public, anon;
grant execute on function public.set_home_featured_vendors_v2(text[]) to authenticated;

