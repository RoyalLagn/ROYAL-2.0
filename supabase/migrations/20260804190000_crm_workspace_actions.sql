begin;

-- ============================================================================
-- Field Workspace Management — Phase 2 (employee-facing actions).
--
-- Every function below follows the exact same shape: resolve+validate the
-- workspace from `token` via private.resolve_active_workspace(), check the
-- specific permission flag, and for anything touching a vendor, enforce the
-- cluster boundary server-side (never trust a client-supplied cluster_id).
-- This is where "even if the URL is manually changed" is actually enforced.
-- ============================================================================

create or replace function private.resolve_active_workspace(target_token text)
returns public.crm_field_workspaces
language plpgsql
security definer
set search_path = ''
as $$
declare
  workspace public.crm_field_workspaces%rowtype;
begin
  if target_token is null or btrim(target_token) = '' then
    raise exception 'Invalid workspace link' using errcode = '42501';
  end if;

  select * into workspace from public.crm_field_workspaces where token = btrim(target_token);
  if workspace.id is null then
    raise exception 'This workspace link is invalid' using errcode = '42501';
  end if;

  if workspace.status = 'active' and workspace.expires_at < now() then
    update public.crm_field_workspaces set status = 'expired' where id = workspace.id;
    workspace.status := 'expired';
  end if;

  if workspace.status = 'revoked' then
    raise exception 'This workspace link has been revoked' using errcode = '42501';
  elsif workspace.status = 'paused' then
    raise exception 'This workspace is currently paused' using errcode = '42501';
  elsif workspace.status = 'expired' then
    raise exception 'This workspace link has expired' using errcode = '42501';
  end if;

  update public.crm_field_workspaces set last_activity_at = now() where id = workspace.id;
  return workspace;
end;
$$;

create or replace function private.get_workspace_permissions(target_workspace_id uuid)
returns public.crm_workspace_permissions
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.crm_workspace_permissions where workspace_id = target_workspace_id;
$$;

revoke all on function private.resolve_active_workspace(text) from public, anon, authenticated;
revoke all on function private.get_workspace_permissions(uuid) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- workspace_list_vendors — "My Vendors". Hard cluster boundary: only ever
-- returns vendors in this workspace's assigned cluster.
-- ----------------------------------------------------------------------------

create or replace function public.workspace_list_vendors(
  target_token text,
  search_text text default null,
  status_filter text default null,
  page_size integer default 20,
  page_offset integer default 0
) returns table (
  id uuid,
  business_name text,
  owner_name text,
  phone text,
  area text,
  priority text,
  status public.crm_vendor_status,
  category_name text,
  is_own boolean,
  created_at timestamptz,
  total_count bigint
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
    raise exception 'This workspace cannot view vendors' using errcode = '42501';
  end if;

  return query
    with scoped as (
      select v.id, v.business_name, v.owner_name, v.phone, v.area, v.priority, v.status,
        c.name as category_name, (v.workspace_id = workspace.id) as is_own, v.created_at
      from public.crm_vendors v
      left join public.crm_vendor_categories c on c.id = v.category_id
      where v.cluster_id = workspace.cluster_id
        and (
          nullif(btrim(search_text), '') is null
          or v.business_name ilike '%' || btrim(search_text) || '%'
          or v.owner_name ilike '%' || btrim(search_text) || '%'
          or v.phone ilike '%' || btrim(search_text) || '%'
        )
        and (status_filter is null or status_filter = 'all' or v.status::text = status_filter)
    )
    select s.*, count(*) over () as total_count
    from scoped s
    order by s.created_at desc
    limit least(greatest(page_size, 1), 100)
    offset greatest(page_offset, 0);
end;
$$;

-- ----------------------------------------------------------------------------
-- workspace_create_vendor — cluster_id/workspace_id/campaign_id/created_via
-- are always server-derived, never accepted from the client.
-- ----------------------------------------------------------------------------

create or replace function public.workspace_create_vendor(
  target_token text,
  target_business_name text,
  target_category_id uuid,
  target_owner_name text default null,
  target_phone text default null,
  target_alternate_phone text default null,
  target_whatsapp text default null,
  target_email text default null,
  target_website text default null,
  target_instagram text default null,
  target_google_maps_url text default null,
  target_area text default null,
  target_priority text default 'medium',
  target_lead_source text default null,
  target_visited_date date default null,
  target_notes text default null
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
  if not coalesce(perms.add_vendors, false) then
    raise exception 'This workspace cannot add vendors' using errcode = '42501';
  end if;
  if btrim(coalesce(target_business_name, '')) = '' then
    raise exception 'Business name is required';
  end if;

  insert into public.crm_vendors (
    cluster_id, category_id, business_name, owner_name, phone, alternate_phone,
    whatsapp, email, website, instagram, google_maps_url, area, priority,
    lead_source, visited_date, notes, workspace_id, campaign_id, created_via,
    workspace_employee_name
  ) values (
    workspace.cluster_id, target_category_id, btrim(target_business_name), target_owner_name,
    target_phone, target_alternate_phone, target_whatsapp, target_email, target_website,
    target_instagram, target_google_maps_url, target_area, coalesce(target_priority, 'medium'),
    target_lead_source, target_visited_date, target_notes, workspace.id, workspace.campaign_id,
    'workspace', workspace.employee_name
  )
  returning * into result;

  insert into public.crm_workspace_activity (workspace_id, vendor_id, action, metadata)
  values (workspace.id, result.id, 'vendor_added', jsonb_build_object('business_name', result.business_name));

  return result;
end;
$$;

-- ----------------------------------------------------------------------------
-- workspace_update_vendor — ownership-scoped: only vendors THIS workspace
-- created. Never touches cluster_id/workspace_id/campaign_id/created_via/
-- workspace_employee_name/category_id/status.
-- ----------------------------------------------------------------------------

create or replace function public.workspace_update_vendor(
  target_token text,
  target_vendor_id uuid,
  changes jsonb
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
  if not coalesce(perms.edit_own_vendors, false) then
    raise exception 'This workspace cannot edit vendors' using errcode = '42501';
  end if;

  update public.crm_vendors set
    business_name = coalesce(nullif(btrim(changes->>'business_name'), ''), business_name),
    owner_name = case when changes ? 'owner_name' then nullif(btrim(changes->>'owner_name'), '') else owner_name end,
    phone = case when changes ? 'phone' then nullif(btrim(changes->>'phone'), '') else phone end,
    alternate_phone = case when changes ? 'alternate_phone' then nullif(btrim(changes->>'alternate_phone'), '') else alternate_phone end,
    whatsapp = case when changes ? 'whatsapp' then nullif(btrim(changes->>'whatsapp'), '') else whatsapp end,
    email = case when changes ? 'email' then nullif(btrim(changes->>'email'), '') else email end,
    website = case when changes ? 'website' then nullif(btrim(changes->>'website'), '') else website end,
    instagram = case when changes ? 'instagram' then nullif(btrim(changes->>'instagram'), '') else instagram end,
    google_maps_url = case when changes ? 'google_maps_url' then nullif(btrim(changes->>'google_maps_url'), '') else google_maps_url end,
    area = case when changes ? 'area' then nullif(btrim(changes->>'area'), '') else area end,
    priority = coalesce(nullif(btrim(changes->>'priority'), ''), priority),
    lead_source = case when changes ? 'lead_source' then nullif(btrim(changes->>'lead_source'), '') else lead_source end,
    notes = case when changes ? 'notes' then nullif(btrim(changes->>'notes'), '') else notes end,
    updated_at = now()
  where id = target_vendor_id
    and cluster_id = workspace.cluster_id
    and workspace_id = workspace.id
  returning * into result;

  if result.id is null then
    raise exception 'Vendor not found, or was not added by this workspace' using errcode = 'P0002';
  end if;

  insert into public.crm_workspace_activity (workspace_id, vendor_id, action, metadata)
  values (workspace.id, result.id, 'vendor_edited', changes);

  return result;
end;
$$;

create or replace function public.workspace_update_vendor_status(
  target_token text,
  target_vendor_id uuid,
  new_status public.crm_vendor_status
) returns public.crm_vendors
language plpgsql
security definer
set search_path = ''
as $$
declare
  workspace public.crm_field_workspaces;
  perms public.crm_workspace_permissions;
  previous_status public.crm_vendor_status;
  result public.crm_vendors;
begin
  workspace := private.resolve_active_workspace(target_token);
  perms := private.get_workspace_permissions(workspace.id);
  if not coalesce(perms.edit_own_vendors, false) then
    raise exception 'This workspace cannot change vendor status' using errcode = '42501';
  end if;

  select status into previous_status from public.crm_vendors
  where id = target_vendor_id and cluster_id = workspace.cluster_id and workspace_id = workspace.id;
  if previous_status is null then
    raise exception 'Vendor not found, or was not added by this workspace' using errcode = 'P0002';
  end if;

  update public.crm_vendors set status = new_status, updated_at = now()
  where id = target_vendor_id
  returning * into result;

  insert into public.crm_workspace_activity (workspace_id, vendor_id, action, metadata)
  values (workspace.id, result.id, 'status_changed', jsonb_build_object('from_status', previous_status, 'to_status', new_status));

  return result;
end;
$$;

-- ----------------------------------------------------------------------------
-- Notes / follow-ups — cluster-scoped (any vendor in the assigned cluster,
-- not ownership-restricted), matching the spec's flat "Add Notes"/
-- "Add Follow-ups" permission wording rather than the narrower "Edit
-- Vendors Created By This Workspace" wording used for edits.
-- ----------------------------------------------------------------------------

create or replace function public.workspace_add_note(
  target_token text,
  target_vendor_id uuid,
  body text
) returns public.crm_notes
language plpgsql
security definer
set search_path = ''
as $$
declare
  workspace public.crm_field_workspaces;
  perms public.crm_workspace_permissions;
  result public.crm_notes;
begin
  workspace := private.resolve_active_workspace(target_token);
  perms := private.get_workspace_permissions(workspace.id);
  if not coalesce(perms.add_notes, false) then
    raise exception 'This workspace cannot add notes' using errcode = '42501';
  end if;
  if not exists (select 1 from public.crm_vendors where id = target_vendor_id and cluster_id = workspace.cluster_id) then
    raise exception 'Vendor not found in this workspace''s cluster' using errcode = 'P0002';
  end if;
  if btrim(coalesce(body, '')) = '' then
    raise exception 'Note cannot be empty';
  end if;

  insert into public.crm_notes (vendor_id, body) values (target_vendor_id, btrim(body))
  returning * into result;

  insert into public.crm_workspace_activity (workspace_id, vendor_id, action, metadata)
  values (workspace.id, target_vendor_id, 'note_added', '{}'::jsonb);

  return result;
end;
$$;

create or replace function public.workspace_add_followup(
  target_token text,
  target_vendor_id uuid,
  followup_type public.crm_followup_type,
  scheduled_date date,
  scheduled_time time default null,
  priority text default 'medium',
  notes text default null
) returns public.crm_followups
language plpgsql
security definer
set search_path = ''
as $$
declare
  workspace public.crm_field_workspaces;
  perms public.crm_workspace_permissions;
  result public.crm_followups;
begin
  workspace := private.resolve_active_workspace(target_token);
  perms := private.get_workspace_permissions(workspace.id);
  if not coalesce(perms.add_followups, false) then
    raise exception 'This workspace cannot add follow-ups' using errcode = '42501';
  end if;
  if not exists (select 1 from public.crm_vendors where id = target_vendor_id and cluster_id = workspace.cluster_id) then
    raise exception 'Vendor not found in this workspace''s cluster' using errcode = 'P0002';
  end if;

  insert into public.crm_followups (vendor_id, type, scheduled_date, scheduled_time, priority, notes)
  values (target_vendor_id, followup_type, scheduled_date, scheduled_time, coalesce(priority, 'medium'), nullif(btrim(coalesce(notes, '')), ''))
  returning * into result;

  insert into public.crm_workspace_activity (workspace_id, vendor_id, action, metadata)
  values (workspace.id, target_vendor_id, 'followup_added', jsonb_build_object('type', followup_type));

  return result;
end;
$$;

create or replace function public.workspace_list_followups(
  target_token text,
  status_filter text default 'pending'
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
    where v.workspace_id = workspace.id
      and (status_filter is null or status_filter = 'all' or f.status = status_filter)
    order by f.scheduled_date, f.scheduled_time nulls last;
end;
$$;

create or replace function public.workspace_set_followup_status(
  target_token text,
  target_followup_id uuid,
  new_status text
) returns public.crm_followups
language plpgsql
security definer
set search_path = ''
as $$
declare
  workspace public.crm_field_workspaces;
  perms public.crm_workspace_permissions;
  result public.crm_followups;
begin
  workspace := private.resolve_active_workspace(target_token);
  perms := private.get_workspace_permissions(workspace.id);
  if not coalesce(perms.add_followups, false) then
    raise exception 'This workspace cannot update follow-ups' using errcode = '42501';
  end if;
  if new_status not in ('pending', 'completed', 'cancelled') then
    raise exception 'Unsupported follow-up status: %', new_status;
  end if;

  update public.crm_followups f set status = new_status, updated_at = now()
  from public.crm_vendors v
  where f.id = target_followup_id and v.id = f.vendor_id and v.workspace_id = workspace.id
  returning f.* into result;

  if result.id is null then
    raise exception 'Follow-up not found for this workspace' using errcode = 'P0002';
  end if;
  return result;
end;
$$;

-- ----------------------------------------------------------------------------
-- workspace_log_activity — narrow, fixed action vocabulary (call/whatsapp
-- open events) so it can't be abused as an arbitrary free-text log spammer.
-- ----------------------------------------------------------------------------

create or replace function public.workspace_log_activity(
  target_token text,
  target_vendor_id uuid,
  action text
) returns void
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
  if action = 'call_started' and not coalesce(perms.call_vendor, false) then
    raise exception 'This workspace cannot call vendors' using errcode = '42501';
  elsif action = 'whatsapp_opened' and not coalesce(perms.whatsapp_vendor, false) then
    raise exception 'This workspace cannot message vendors on WhatsApp' using errcode = '42501';
  elsif action not in ('call_started', 'whatsapp_opened') then
    raise exception 'Unsupported activity action: %', action;
  end if;
  if not exists (select 1 from public.crm_vendors where id = target_vendor_id and cluster_id = workspace.cluster_id) then
    raise exception 'Vendor not found in this workspace''s cluster' using errcode = 'P0002';
  end if;

  insert into public.crm_workspace_activity (workspace_id, vendor_id, action, metadata)
  values (workspace.id, target_vendor_id, action, '{}'::jsonb);
end;
$$;

-- ----------------------------------------------------------------------------
-- workspace_progress — scoped to vendors THIS workspace added (matches
-- "My Vendors" scope, the one meaningfully implementable reading of the
-- spec's illustrative "18 / 120 Vendors").
-- ----------------------------------------------------------------------------

create or replace function public.workspace_progress(
  target_token text
) returns table (
  vendors_added bigint,
  interested bigint,
  not_interested bigint,
  meetings bigint,
  registered bigint,
  followups_pending bigint,
  followups_completed bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  workspace public.crm_field_workspaces;
begin
  workspace := private.resolve_active_workspace(target_token);
  return query
    select
      (select count(*) from public.crm_vendors where workspace_id = workspace.id),
      (select count(*) from public.crm_vendors where workspace_id = workspace.id and status = 'interested'),
      (select count(*) from public.crm_vendors where workspace_id = workspace.id and status = 'not_interested'),
      (select count(*) from public.crm_vendors where workspace_id = workspace.id and status in ('meeting_scheduled', 'meeting_completed')),
      (select count(*) from public.crm_vendors where workspace_id = workspace.id and status in ('registered_on_royallagn', 'subscription_pending', 'premium_customer')),
      (select count(*) from public.crm_followups f join public.crm_vendors v on v.id = f.vendor_id where v.workspace_id = workspace.id and f.status = 'pending'),
      (select count(*) from public.crm_followups f join public.crm_vendors v on v.id = f.vendor_id where v.workspace_id = workspace.id and f.status = 'completed');
end;
$$;

-- ----------------------------------------------------------------------------
-- Grants — every function here is part of the anon employee surface.
-- ----------------------------------------------------------------------------

revoke all on function public.workspace_list_vendors(text, text, text, integer, integer) from public;
revoke all on function public.workspace_create_vendor(text, text, uuid, text, text, text, text, text, text, text, text, text, text, text, date, text) from public;
revoke all on function public.workspace_update_vendor(text, uuid, jsonb) from public;
revoke all on function public.workspace_update_vendor_status(text, uuid, public.crm_vendor_status) from public;
revoke all on function public.workspace_add_note(text, uuid, text) from public;
revoke all on function public.workspace_add_followup(text, uuid, public.crm_followup_type, date, time, text, text) from public;
revoke all on function public.workspace_list_followups(text, text) from public;
revoke all on function public.workspace_set_followup_status(text, uuid, text) from public;
revoke all on function public.workspace_log_activity(text, uuid, text) from public;
revoke all on function public.workspace_progress(text) from public;

grant execute on function public.workspace_list_vendors(text, text, text, integer, integer) to anon, authenticated;
grant execute on function public.workspace_create_vendor(text, text, uuid, text, text, text, text, text, text, text, text, text, text, text, date, text) to anon, authenticated;
grant execute on function public.workspace_update_vendor(text, uuid, jsonb) to anon, authenticated;
grant execute on function public.workspace_update_vendor_status(text, uuid, public.crm_vendor_status) to anon, authenticated;
grant execute on function public.workspace_add_note(text, uuid, text) to anon, authenticated;
grant execute on function public.workspace_add_followup(text, uuid, public.crm_followup_type, date, time, text, text) to anon, authenticated;
grant execute on function public.workspace_list_followups(text, text) to anon, authenticated;
grant execute on function public.workspace_set_followup_status(text, uuid, text) to anon, authenticated;
grant execute on function public.workspace_log_activity(text, uuid, text) to anon, authenticated;
grant execute on function public.workspace_progress(text) to anon, authenticated;

commit;
