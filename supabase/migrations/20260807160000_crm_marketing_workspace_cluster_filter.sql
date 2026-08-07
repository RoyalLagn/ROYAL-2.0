begin;

-- ============================================================================
-- Cluster filter for the Marketing Workspace "Assign Categories & Vendors"
-- screen. Adds an optional target_cluster_ids array to the existing
-- assignable-vendors picker RPC — server-side, so it composes correctly
-- with the existing category filter, search text and pagination (matters
-- for "Select All" correctness and for performance on large vendor lists,
-- both of which rely on the RPC's total_count being accurate for the exact
-- filter combination in effect).
--
-- New parameter is appended at the end (not inserted before the existing
-- ones) and the function is dropped + recreated rather than replaced in
-- place — same reasoning as the parameter-list change in
-- 20260807140000_fix_marketing_workspace_pipeline_gaps.sql: safer and more
-- explicit than relying on CREATE OR REPLACE FUNCTION's append-only rule.
-- ============================================================================

drop function if exists public.admin_crm_list_assignable_vendors(uuid, uuid[], text, integer, integer);

create function public.admin_crm_list_assignable_vendors(
  target_workspace_id uuid,
  target_category_ids uuid[] default null,
  search_text text default null,
  page_size integer default 50,
  page_offset integer default 0,
  target_cluster_ids uuid[] default null
) returns table (
  id uuid,
  business_name text,
  owner_name text,
  phone text,
  area text,
  category_id uuid,
  category_name text,
  cluster_name text,
  status public.crm_vendor_status,
  is_assigned boolean,
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
    with scoped as (
      select v.id, v.business_name, v.owner_name, v.phone, v.area, v.category_id,
        c.name as category_name, cl.name as cluster_name, v.status,
        exists (
          select 1 from public.crm_marketing_workspace_vendors mwv
          where mwv.workspace_id = target_workspace_id and mwv.vendor_id = v.id
        ) as is_assigned
      from public.crm_vendors v
      left join public.crm_vendor_categories c on c.id = v.category_id
      left join public.crm_clusters cl on cl.id = v.cluster_id
      where (target_category_ids is null or array_length(target_category_ids, 1) is null or v.category_id = any(target_category_ids))
        and (target_cluster_ids is null or array_length(target_cluster_ids, 1) is null or v.cluster_id = any(target_cluster_ids))
        and (
          nullif(btrim(search_text), '') is null
          or v.business_name ilike '%' || btrim(search_text) || '%'
          or v.owner_name ilike '%' || btrim(search_text) || '%'
          or v.phone ilike '%' || btrim(search_text) || '%'
        )
    )
    select s.*, count(*) over () as total_count
    from scoped s
    order by s.is_assigned desc, s.business_name
    limit least(greatest(page_size, 1), 200)
    offset greatest(page_offset, 0);
end;
$$;

revoke all on function public.admin_crm_list_assignable_vendors(uuid, uuid[], text, integer, integer, uuid[]) from public, anon;
grant execute on function public.admin_crm_list_assignable_vendors(uuid, uuid[], text, integer, integer, uuid[]) to authenticated;

commit;
