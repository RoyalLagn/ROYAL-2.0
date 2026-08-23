-- Registered conversions from marketing workspace links. Vendors are deduped
-- even if they appeared in multiple campaigns, while workspace_names retains
-- the source context for the admin.
create function public.admin_crm_list_marketing_registered_vendors(
  target_category_id uuid default null,
  search_text text default null,
  page_size integer default 30,
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
  workspace_names text[],
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
    with registered_vendors as (
      select v.id, v.business_name, v.owner_name, v.phone, v.area,
        c.name as category_name, cl.name as cluster_name, v.status,
        max(mwv.assigned_at) as assigned_at,
        array_agg(distinct mw.name order by mw.name) as workspace_names
      from public.crm_marketing_workspace_vendors mwv
      join public.crm_vendors v on v.id = mwv.vendor_id
      join public.crm_marketing_workspaces mw on mw.id = mwv.workspace_id
      left join public.crm_vendor_categories c on c.id = v.category_id
      left join public.crm_clusters cl on cl.id = v.cluster_id
      where mwv.registered
        and (target_category_id is null or v.category_id = target_category_id)
        and (
          nullif(btrim(search_text), '') is null
          or v.business_name ilike '%' || btrim(search_text) || '%'
          or v.owner_name ilike '%' || btrim(search_text) || '%'
          or v.phone ilike '%' || btrim(search_text) || '%'
        )
      group by v.id, v.business_name, v.owner_name, v.phone, v.area, c.name, cl.name, v.status
    )
    select r.*, count(*) over () as total_count
    from registered_vendors r
    order by r.assigned_at desc, r.business_name
    limit least(greatest(page_size, 1), 100)
    offset greatest(page_offset, 0);
end;
$$;

revoke all on function public.admin_crm_list_marketing_registered_vendors(uuid, text, integer, integer) from public, anon;
grant execute on function public.admin_crm_list_marketing_registered_vendors(uuid, text, integer, integer) to authenticated;
