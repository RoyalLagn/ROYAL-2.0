create function public.admin_crm_list_live_dashboard_vendors(target_metric text, search_text text default null, page_size integer default 30, page_offset integer default 0)
returns table (id uuid, business_name text, owner_name text, phone text, area text, category_name text, cluster_name text, status public.crm_vendor_status, assigned_at timestamptz, workspace_name text, total_count bigint)
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Administrator access required' using errcode = '42501'; end if;
  if target_metric not in ('interested','calls_today','meetings_today','followups_pending') then raise exception 'Unsupported dashboard metric' using errcode = '22023'; end if;
  return query with scoped as (
    select v.id,v.business_name,v.owner_name,v.phone,v.area,c.name category_name,cl.name cluster_name,v.status,mwv.assigned_at,mw.name workspace_name
    from public.crm_marketing_workspace_vendors mwv join public.crm_vendors v on v.id=mwv.vendor_id join public.crm_marketing_workspaces mw on mw.id=mwv.workspace_id
    left join public.crm_vendor_categories c on c.id=v.category_id left join public.crm_clusters cl on cl.id=v.cluster_id
    where (target_metric='interested' and mwv.interest_status='interested') or (target_metric='calls_today' and mwv.contacted_at::date=current_date) or (target_metric='meetings_today' and mwv.meeting_done_at::date=current_date) or (target_metric='followups_pending' and mwv.next_followup_date<=current_date and not mwv.registered and mwv.interest_status<>'not_interested')
  ), filtered as (select * from scoped s where nullif(btrim(search_text),'') is null or s.business_name ilike '%'||btrim(search_text)||'%' or s.owner_name ilike '%'||btrim(search_text)||'%' or s.phone ilike '%'||btrim(search_text)||'%')
  select f.*,count(*) over() total_count from filtered f order by f.assigned_at desc,f.business_name limit least(greatest(page_size,1),100) offset greatest(page_offset,0);
end; $$;
revoke all on function public.admin_crm_list_live_dashboard_vendors(text,text,integer,integer) from public,anon;
grant execute on function public.admin_crm_list_live_dashboard_vendors(text,text,integer,integer) to authenticated;
