-- Live CRM dashboard metrics. Workspace conversion/activity counts are kept
-- separate from old manual CRM stages and use the same source records the
-- marketing team updates from their shared workspace link.
create function public.admin_crm_live_dashboard_metrics()
returns table (
  premium bigint,
  interested bigint,
  calls_today bigint,
  meetings_today bigint,
  followups_pending bigint
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
    select
      (select count(*) from public.crm_vendors where status = 'premium_customer')::bigint,
      (select count(distinct vendor_id) from public.crm_marketing_workspace_vendors where interest_status = 'interested')::bigint,
      (select count(distinct vendor_id) from public.crm_marketing_workspace_vendors where contacted_at::date = current_date)::bigint,
      (select count(distinct vendor_id) from public.crm_marketing_workspace_vendors where meeting_done_at::date = current_date)::bigint,
      (select count(distinct vendor_id) from public.crm_marketing_workspace_vendors where next_followup_date <= current_date and not registered and interest_status <> 'not_interested')::bigint;
end;
$$;

revoke all on function public.admin_crm_live_dashboard_metrics() from public, anon;
grant execute on function public.admin_crm_live_dashboard_metrics() to authenticated;
