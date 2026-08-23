-- Registration is the final pipeline stage. A historical interested flag may
-- remain stored, but registered vendors must not be counted or listed as an
-- active interested lead.
create or replace function public.admin_crm_marketing_workspace_stats(target_workspace_id uuid)
returns table (assigned bigint, contacted bigint, meeting_done bigint, interested bigint, not_interested bigint, registered bigint, pending bigint, weighted_completion integer)
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Administrator access required' using errcode = '42501'; end if;
  return query select count(*),count(*) filter(where mwv.contacted),count(*) filter(where mwv.meeting_done),count(*) filter(where mwv.interest_status='interested' and not mwv.registered),count(*) filter(where mwv.interest_status='not_interested'),count(*) filter(where mwv.registered),count(*) filter(where not mwv.registered and mwv.interest_status <> 'not_interested'),case when count(*)=0 then 0 else round(avg(case when mwv.registered then 100 when mwv.interest_status='interested' then 75 when mwv.meeting_done then 50 when mwv.contacted then 25 else 0 end))::integer end from public.crm_marketing_workspace_vendors mwv where mwv.workspace_id=target_workspace_id;
end; $$;

create or replace function public.admin_crm_live_dashboard_metrics()
returns table (premium bigint, interested bigint, calls_today bigint, meetings_today bigint, followups_pending bigint)
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Administrator access required' using errcode = '42501'; end if;
  return query select (select count(*) from public.crm_vendors where status='premium_customer')::bigint,(select count(distinct vendor_id) from public.crm_marketing_workspace_vendors where interest_status='interested' and not registered)::bigint,(select count(distinct vendor_id) from public.crm_marketing_workspace_vendors where contacted_at::date=current_date)::bigint,(select count(distinct vendor_id) from public.crm_marketing_workspace_vendors where meeting_done_at::date=current_date)::bigint,(select count(distinct vendor_id) from public.crm_marketing_workspace_vendors where next_followup_date<=current_date and not registered and interest_status<>'not_interested')::bigint;
end; $$;

create or replace function public.admin_crm_list_live_dashboard_vendors(target_metric text, search_text text default null, page_size integer default 30, page_offset integer default 0)
returns table (id uuid,business_name text,owner_name text,phone text,area text,category_name text,cluster_name text,status public.crm_vendor_status,assigned_at timestamptz,workspace_name text,total_count bigint)
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Administrator access required' using errcode='42501'; end if;
  if target_metric not in ('interested','calls_today','meetings_today','followups_pending') then raise exception 'Unsupported dashboard metric' using errcode='22023'; end if;
  return query with scoped as (select v.id,v.business_name,v.owner_name,v.phone,v.area,c.name category_name,cl.name cluster_name,v.status,mwv.assigned_at,mw.name workspace_name from public.crm_marketing_workspace_vendors mwv join public.crm_vendors v on v.id=mwv.vendor_id join public.crm_marketing_workspaces mw on mw.id=mwv.workspace_id left join public.crm_vendor_categories c on c.id=v.category_id left join public.crm_clusters cl on cl.id=v.cluster_id where (target_metric='interested' and mwv.interest_status='interested' and not mwv.registered) or (target_metric='calls_today' and mwv.contacted_at::date=current_date) or (target_metric='meetings_today' and mwv.meeting_done_at::date=current_date) or (target_metric='followups_pending' and mwv.next_followup_date<=current_date and not mwv.registered and mwv.interest_status<>'not_interested')),filtered as (select * from scoped s where nullif(btrim(search_text),'') is null or s.business_name ilike '%'||btrim(search_text)||'%' or s.owner_name ilike '%'||btrim(search_text)||'%' or s.phone ilike '%'||btrim(search_text)||'%') select f.*,count(*) over() total_count from filtered f order by f.assigned_at desc,f.business_name limit least(greatest(page_size,1),100) offset greatest(page_offset,0);
end; $$;

create or replace function public.admin_crm_list_marketing_workspace_vendors(target_workspace_id uuid,search_text text default null,page_size integer default 8,page_offset integer default 0,target_filter text default 'assigned')
returns table (id uuid,business_name text,owner_name text,phone text,area text,category_name text,cluster_name text,status public.crm_vendor_status,assigned_at timestamptz,total_count bigint)
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Administrator access required' using errcode='42501'; end if;
  if target_filter not in ('assigned','contacted','meeting_done','interested','not_interested','registered','pending') then raise exception 'Unsupported workspace vendor filter' using errcode='22023'; end if;
  return query with assigned as (select v.id,v.business_name,v.owner_name,v.phone,v.area,c.name category_name,cl.name cluster_name,v.status,mwv.assigned_at from public.crm_marketing_workspace_vendors mwv join public.crm_vendors v on v.id=mwv.vendor_id left join public.crm_vendor_categories c on c.id=v.category_id left join public.crm_clusters cl on cl.id=v.cluster_id where mwv.workspace_id=target_workspace_id and (target_filter='assigned' or (target_filter='contacted' and mwv.contacted) or (target_filter='meeting_done' and mwv.meeting_done) or (target_filter='interested' and mwv.interest_status='interested' and not mwv.registered) or (target_filter='not_interested' and mwv.interest_status='not_interested') or (target_filter='registered' and mwv.registered) or (target_filter='pending' and not mwv.registered and mwv.interest_status<>'not_interested')) and (nullif(btrim(search_text),'') is null or v.business_name ilike '%'||btrim(search_text)||'%' or v.owner_name ilike '%'||btrim(search_text)||'%' or v.phone ilike '%'||btrim(search_text)||'%')) select a.*,count(*) over() total_count from assigned a order by a.assigned_at desc,a.business_name limit least(greatest(page_size,1),50) offset greatest(page_offset,0);
end; $$;
