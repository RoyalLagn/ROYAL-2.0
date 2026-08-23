-- One list endpoint for each interactive workspace progress count. The
-- predicates intentionally mirror admin_crm_marketing_workspace_stats so a
-- tile count always reconciles with the vendors shown after tapping it.
drop function if exists public.admin_crm_list_marketing_workspace_vendors(uuid, text, integer, integer);

create function public.admin_crm_list_marketing_workspace_vendors(
  target_workspace_id uuid,
  search_text text default null,
  page_size integer default 8,
  page_offset integer default 0,
  target_filter text default 'assigned'
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
  if target_filter not in ('assigned', 'contacted', 'meeting_done', 'interested', 'not_interested', 'registered', 'pending') then
    raise exception 'Unsupported workspace vendor filter' using errcode = '22023';
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
          target_filter = 'assigned'
          or (target_filter = 'contacted' and mwv.contacted)
          or (target_filter = 'meeting_done' and mwv.meeting_done)
          or (target_filter = 'interested' and mwv.interest_status = 'interested')
          or (target_filter = 'not_interested' and mwv.interest_status = 'not_interested')
          or (target_filter = 'registered' and mwv.registered)
          or (target_filter = 'pending' and not mwv.registered and mwv.interest_status <> 'not_interested')
        )
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

revoke all on function public.admin_crm_list_marketing_workspace_vendors(uuid, text, integer, integer, text) from public, anon;
grant execute on function public.admin_crm_list_marketing_workspace_vendors(uuid, text, integer, integer, text) to authenticated;
