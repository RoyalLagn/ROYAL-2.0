-- Admin-only list for the workspace detail screen. It returns the vendors
-- actually assigned to this workspace, independent of the category filters
-- used by the assignment picker.
create or replace function public.admin_crm_list_marketing_workspace_vendors(
  target_workspace_id uuid,
  search_text text default null,
  page_size integer default 8,
  page_offset integer default 0
) returns table (
  id uuid,
  business_name text,
  owner_name text,
  phone text,
  area text,
  category_name text,
  cluster_name text,
  status public.crm_vendor_status,
  assigned_at timestamptz,
  total_count bigint
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  return query
    with assigned as (
      select v.id, v.business_name, v.owner_name, v.phone, v.area,
        c.name as category_name, cl.name as cluster_name, v.status, mwv.assigned_at
      from public.crm_marketing_workspace_vendors mwv
      join public.crm_vendors v on v.id = mwv.vendor_id
      left join public.crm_vendor_categories c on c.id = v.category_id
      left join public.crm_clusters cl on cl.id = v.cluster_id
      where mwv.workspace_id = target_workspace_id
        and (
          nullif(btrim(search_text), '') is null
          or v.business_name ilike '%' || btrim(search_text) || '%'
          or v.owner_name ilike '%' || btrim(search_text) || '%'
          or v.phone ilike '%' || btrim(search_text) || '%'
        )
    )
    select a.*, count(*) over () as total_count
    from assigned a
    order by a.assigned_at desc, a.business_name
    limit least(greatest(page_size, 1), 50)
    offset greatest(page_offset, 0);
end;
$$;

revoke all on function public.admin_crm_list_marketing_workspace_vendors(uuid, text, integer, integer) from public, anon;
grant execute on function public.admin_crm_list_marketing_workspace_vendors(uuid, text, integer, integer) to authenticated;
