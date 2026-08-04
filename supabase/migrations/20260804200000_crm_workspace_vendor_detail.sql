begin;

-- Fills a gap from the previous migration: the employee vendor detail
-- screen needs the full vendor record (not the trimmed list-row shape),
-- its notes, and its own follow-ups specifically — all still token-gated
-- and cluster-scoped via private.resolve_active_workspace().

create or replace function public.workspace_get_vendor(
  target_token text,
  target_vendor_id uuid
) returns public.crm_vendors
language plpgsql
security definer
set search_path = ''
as $$
declare
  workspace public.crm_field_workspaces;
  perms public.crm_workspace_permissions;
  result public.crm_vendors;
begin
  workspace := private.resolve_active_workspace(target_token);
  perms := private.get_workspace_permissions(workspace.id);
  if not coalesce(perms.view_assigned_vendors, false) then
    raise exception 'This workspace cannot view vendors' using errcode = '42501';
  end if;

  select * into result from public.crm_vendors
  where id = target_vendor_id and cluster_id = workspace.cluster_id;
  if result.id is null then
    raise exception 'Vendor not found in this workspace''s cluster' using errcode = 'P0002';
  end if;
  return result;
end;
$$;

create or replace function public.workspace_list_notes(
  target_token text,
  target_vendor_id uuid
) returns setof public.crm_notes
language plpgsql
security definer
set search_path = ''
as $$
declare
  workspace public.crm_field_workspaces;
  perms public.crm_workspace_permissions;
begin
  workspace := private.resolve_active_workspace(target_token);
  perms := private.get_workspace_permissions(workspace.id);
  if not coalesce(perms.view_assigned_vendors, false) then
    raise exception 'This workspace cannot view notes' using errcode = '42501';
  end if;
  if not exists (select 1 from public.crm_vendors where id = target_vendor_id and cluster_id = workspace.cluster_id) then
    raise exception 'Vendor not found in this workspace''s cluster' using errcode = 'P0002';
  end if;

  return query
    select * from public.crm_notes where vendor_id = target_vendor_id order by created_at desc;
end;
$$;

-- Adds an optional vendor filter to the existing list — appending a new
-- defaulted parameter keeps the old two-argument call sites working. Also
-- switches scope from "vendors this workspace created" to "vendors in this
-- workspace's cluster", matching workspace_get_vendor/workspace_list_notes
-- and workspace_add_followup's own cluster-wide (not ownership-restricted)
-- permission check.
create or replace function public.workspace_list_followups(
  target_token text,
  status_filter text default 'pending',
  vendor_filter uuid default null
) returns table (
  id uuid,
  vendor_id uuid,
  business_name text,
  type public.crm_followup_type,
  scheduled_date date,
  scheduled_time time,
  priority text,
  notes text,
  status text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  workspace public.crm_field_workspaces;
  perms public.crm_workspace_permissions;
begin
  workspace := private.resolve_active_workspace(target_token);
  perms := private.get_workspace_permissions(workspace.id);
  if not coalesce(perms.view_assigned_vendors, false) then
    raise exception 'This workspace cannot view follow-ups' using errcode = '42501';
  end if;

  return query
    select f.id, f.vendor_id, v.business_name, f.type, f.scheduled_date, f.scheduled_time, f.priority, f.notes, f.status
    from public.crm_followups f
    join public.crm_vendors v on v.id = f.vendor_id
    where v.cluster_id = workspace.cluster_id
      and (status_filter is null or status_filter = 'all' or f.status = status_filter)
      and (vendor_filter is null or f.vendor_id = vendor_filter)
    order by f.scheduled_date, f.scheduled_time nulls last;
end;
$$;

revoke all on function public.workspace_get_vendor(text, uuid) from public;
revoke all on function public.workspace_list_notes(text, uuid) from public;
grant execute on function public.workspace_get_vendor(text, uuid) to anon, authenticated;
grant execute on function public.workspace_list_notes(text, uuid) to anon, authenticated;

commit;
