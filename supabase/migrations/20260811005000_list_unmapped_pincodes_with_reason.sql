begin;

-- Surface geo_review_reason alongside the existing unmapped-vendor list so
-- Admin can see *why* a vendor needs review, not just that it does.
drop function if exists public.list_unmapped_vendor_pincodes(integer);

create or replace function public.list_unmapped_vendor_pincodes(p_limit integer default 50)
returns table (
  vendor_id uuid,
  business_name text,
  pincode text,
  city text,
  state text,
  geo_resolution_status text,
  geo_review_reason text
)
language sql
stable
security definer
set search_path = ''
as $$
  select v.id, v.business_name, v.pincode, v.city, v.state, v.geo_resolution_status, v.geo_review_reason
  from public.vendors v
  where private.is_admin()
    and v.pincode is not null
    and v.geo_resolution_status <> 'resolved'
  order by v.updated_at desc
  limit greatest(p_limit, 0);
$$;

revoke all on function public.list_unmapped_vendor_pincodes(integer) from public, anon, authenticated;
grant execute on function public.list_unmapped_vendor_pincodes(integer) to authenticated;

commit;
