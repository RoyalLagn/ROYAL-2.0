begin;

-- ============================================================================
-- Field Workspace Management — Phase 1 (Campaign, Workspace DB, Permissions,
-- Secure Tokens).
--
-- SECURITY MODEL: this introduces the first anonymous (no Supabase session)
-- write path in the CRM. crm_field_workspaces / crm_workspace_permissions /
-- crm_workspace_activity get ZERO direct grants to anon — the only way an
-- unauthenticated employee touches anything is through SECURITY DEFINER
-- RPCs that take a `token text` and re-derive workspace/cluster/campaign
-- server-side on every call. Raw UUIDs are never returned to an anon client.
-- ============================================================================

create table public.crm_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  start_date date,
  end_date date,
  status text not null default 'active',
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_campaigns_name_not_blank check (btrim(name) <> ''),
  constraint crm_campaigns_status_valid check (status in ('active', 'completed', 'paused'))
);
create index crm_campaigns_status_idx on public.crm_campaigns (status, created_at desc);

create table public.crm_field_workspaces (
  id uuid primary key default gen_random_uuid(),
  token text not null,
  name text not null,
  employee_name text not null,
  employee_phone text,
  cluster_id uuid not null references public.crm_clusters(id) on delete restrict,
  campaign_id uuid references public.crm_campaigns(id) on delete set null,
  -- Future-ready hook: unused today, lets a later dedicated employee login
  -- attach to a workspace without a schema redesign.
  employee_profile_id uuid references public.profiles(id) on delete set null,
  status text not null default 'active',
  starts_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_activity_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_field_workspaces_name_not_blank check (btrim(name) <> ''),
  constraint crm_field_workspaces_employee_name_not_blank check (btrim(employee_name) <> ''),
  constraint crm_field_workspaces_status_valid check (status in ('active', 'paused', 'expired', 'revoked')),
  constraint crm_field_workspaces_expiry_after_start check (expires_at > starts_at)
);
create unique index crm_field_workspaces_token_unique_idx on public.crm_field_workspaces (token);
create index crm_field_workspaces_cluster_idx on public.crm_field_workspaces (cluster_id, status);
create index crm_field_workspaces_campaign_idx on public.crm_field_workspaces (campaign_id);
create index crm_field_workspaces_status_expiry_idx on public.crm_field_workspaces (status, expires_at);

create table public.crm_workspace_permissions (
  workspace_id uuid primary key references public.crm_field_workspaces(id) on delete cascade,
  add_vendors boolean not null default true,
  edit_own_vendors boolean not null default true,
  add_notes boolean not null default true,
  add_followups boolean not null default true,
  upload_photos boolean not null default true,
  call_vendor boolean not null default true,
  whatsapp_vendor boolean not null default true,
  view_assigned_vendors boolean not null default true,
  delete_vendors boolean not null default false,
  export_data boolean not null default false,
  view_reports boolean not null default false,
  view_analytics boolean not null default false,
  view_settings boolean not null default false,
  vendor_approval boolean not null default false,
  subscription_access boolean not null default false,
  other_clusters boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.crm_workspace_activity (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.crm_field_workspaces(id) on delete cascade,
  vendor_id uuid references public.crm_vendors(id) on delete set null,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint crm_workspace_activity_action_not_blank check (btrim(action) <> '')
);
create index crm_workspace_activity_workspace_idx on public.crm_workspace_activity (workspace_id, created_at desc);

-- ----------------------------------------------------------------------------
-- crm_vendors: stamped once at insert time by the (Phase 2) workspace vendor
-- creation RPC. Never included in any update payload afterward — enforced by
-- omission at the application layer, same as every other immutable-ish field
-- in this schema.
-- ----------------------------------------------------------------------------

alter table public.crm_vendors
  add column workspace_id uuid references public.crm_field_workspaces(id) on delete set null,
  add column campaign_id uuid references public.crm_campaigns(id) on delete set null,
  add column created_via text not null default 'admin',
  add column workspace_employee_name text;

alter table public.crm_vendors
  add constraint crm_vendors_created_via_valid check (created_via in ('admin', 'workspace'));

create index crm_vendors_workspace_idx on public.crm_vendors (workspace_id) where workspace_id is not null;
create index crm_vendors_campaign_idx on public.crm_vendors (campaign_id) where campaign_id is not null;

-- ----------------------------------------------------------------------------
-- updated_at triggers
-- ----------------------------------------------------------------------------

create trigger crm_campaigns_set_updated_at before update on public.crm_campaigns
for each row execute function private.set_updated_at();
create trigger crm_field_workspaces_set_updated_at before update on public.crm_field_workspaces
for each row execute function private.set_updated_at();

-- ----------------------------------------------------------------------------
-- RLS — admin management surface. NOTE: no anon grants anywhere in this
-- block. Anonymous access exists ONLY through the SECURITY DEFINER RPCs
-- below.
-- ----------------------------------------------------------------------------

alter table public.crm_campaigns enable row level security;
alter table public.crm_field_workspaces enable row level security;
alter table public.crm_workspace_permissions enable row level security;
alter table public.crm_workspace_activity enable row level security;

revoke all on public.crm_campaigns, public.crm_field_workspaces,
  public.crm_workspace_permissions, public.crm_workspace_activity
from public, anon, authenticated;

grant select, insert, update, delete on public.crm_campaigns to authenticated;
grant select, update on public.crm_field_workspaces to authenticated;
grant select, update on public.crm_workspace_permissions to authenticated;
grant select on public.crm_workspace_activity to authenticated;

create policy crm_campaigns_admin_all on public.crm_campaigns for all to authenticated
using (private.is_admin()) with check (private.is_admin());
create policy crm_field_workspaces_admin_all on public.crm_field_workspaces for all to authenticated
using (private.is_admin()) with check (private.is_admin());
create policy crm_workspace_permissions_admin_all on public.crm_workspace_permissions for all to authenticated
using (private.is_admin()) with check (private.is_admin());
create policy crm_workspace_activity_admin_read on public.crm_workspace_activity for select to authenticated
using (private.is_admin());

-- ----------------------------------------------------------------------------
-- Admin RPCs — workspace lifecycle management.
-- ----------------------------------------------------------------------------

create or replace function public.admin_crm_create_workspace(
  workspace_name text,
  target_employee_name text,
  target_employee_phone text,
  target_cluster_id uuid,
  target_campaign_id uuid default null,
  target_expires_at timestamptz default null,
  target_permissions jsonb default '{}'::jsonb
) returns public.crm_field_workspaces
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.crm_field_workspaces;
  generated_token text;
begin
  if not private.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if target_expires_at is null or target_expires_at <= now() then
    raise exception 'Workspace expiry must be a future date/time';
  end if;

  generated_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

  insert into public.crm_field_workspaces (
    token, name, employee_name, employee_phone, cluster_id, campaign_id,
    expires_at, created_by
  ) values (
    generated_token, workspace_name, target_employee_name, target_employee_phone,
    target_cluster_id, target_campaign_id, target_expires_at, auth.uid()
  )
  returning * into result;

  insert into public.crm_workspace_permissions (
    workspace_id, add_vendors, edit_own_vendors, add_notes, add_followups,
    upload_photos, call_vendor, whatsapp_vendor, view_assigned_vendors,
    delete_vendors, export_data, view_reports, view_analytics, view_settings,
    vendor_approval, subscription_access, other_clusters
  ) values (
    result.id,
    coalesce((target_permissions->>'add_vendors')::boolean, true),
    coalesce((target_permissions->>'edit_own_vendors')::boolean, true),
    coalesce((target_permissions->>'add_notes')::boolean, true),
    coalesce((target_permissions->>'add_followups')::boolean, true),
    coalesce((target_permissions->>'upload_photos')::boolean, true),
    coalesce((target_permissions->>'call_vendor')::boolean, true),
    coalesce((target_permissions->>'whatsapp_vendor')::boolean, true),
    coalesce((target_permissions->>'view_assigned_vendors')::boolean, true),
    coalesce((target_permissions->>'delete_vendors')::boolean, false),
    coalesce((target_permissions->>'export_data')::boolean, false),
    coalesce((target_permissions->>'view_reports')::boolean, false),
    coalesce((target_permissions->>'view_analytics')::boolean, false),
    coalesce((target_permissions->>'view_settings')::boolean, false),
    coalesce((target_permissions->>'vendor_approval')::boolean, false),
    coalesce((target_permissions->>'subscription_access')::boolean, false),
    coalesce((target_permissions->>'other_clusters')::boolean, false)
  );

  return result;
end;
$$;

create or replace function public.admin_crm_regenerate_workspace_token(
  target_workspace_id uuid
) returns public.crm_field_workspaces
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.crm_field_workspaces;
begin
  if not private.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  update public.crm_field_workspaces
  set token = replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
  where id = target_workspace_id
  returning * into result;
  if result.id is null then raise exception 'Workspace not found' using errcode = 'P0002'; end if;
  return result;
end;
$$;

create or replace function public.admin_crm_set_workspace_status(
  target_workspace_id uuid,
  target_status text
) returns public.crm_field_workspaces
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.crm_field_workspaces;
begin
  if not private.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if target_status not in ('active', 'paused', 'revoked') then
    raise exception 'Unsupported workspace status: %', target_status;
  end if;
  update public.crm_field_workspaces
  set status = target_status
  where id = target_workspace_id
  returning * into result;
  if result.id is null then raise exception 'Workspace not found' using errcode = 'P0002'; end if;
  return result;
end;
$$;

create or replace function public.admin_crm_extend_workspace_expiry(
  target_workspace_id uuid,
  new_expires_at timestamptz
) returns public.crm_field_workspaces
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.crm_field_workspaces;
begin
  if not private.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if new_expires_at <= now() then
    raise exception 'New expiry must be in the future';
  end if;
  update public.crm_field_workspaces
  set expires_at = new_expires_at,
      status = case when status = 'expired' then 'active' else status end
  where id = target_workspace_id
  returning * into result;
  if result.id is null then raise exception 'Workspace not found' using errcode = 'P0002'; end if;
  return result;
end;
$$;

create or replace function public.admin_crm_update_workspace_permissions(
  target_workspace_id uuid,
  target_permissions jsonb
) returns public.crm_workspace_permissions
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.crm_workspace_permissions;
begin
  if not private.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  update public.crm_workspace_permissions set
    add_vendors = coalesce((target_permissions->>'add_vendors')::boolean, add_vendors),
    edit_own_vendors = coalesce((target_permissions->>'edit_own_vendors')::boolean, edit_own_vendors),
    add_notes = coalesce((target_permissions->>'add_notes')::boolean, add_notes),
    add_followups = coalesce((target_permissions->>'add_followups')::boolean, add_followups),
    upload_photos = coalesce((target_permissions->>'upload_photos')::boolean, upload_photos),
    call_vendor = coalesce((target_permissions->>'call_vendor')::boolean, call_vendor),
    whatsapp_vendor = coalesce((target_permissions->>'whatsapp_vendor')::boolean, whatsapp_vendor),
    view_assigned_vendors = coalesce((target_permissions->>'view_assigned_vendors')::boolean, view_assigned_vendors),
    delete_vendors = coalesce((target_permissions->>'delete_vendors')::boolean, delete_vendors),
    export_data = coalesce((target_permissions->>'export_data')::boolean, export_data),
    view_reports = coalesce((target_permissions->>'view_reports')::boolean, view_reports),
    view_analytics = coalesce((target_permissions->>'view_analytics')::boolean, view_analytics),
    view_settings = coalesce((target_permissions->>'view_settings')::boolean, view_settings),
    vendor_approval = coalesce((target_permissions->>'vendor_approval')::boolean, vendor_approval),
    subscription_access = coalesce((target_permissions->>'subscription_access')::boolean, subscription_access),
    other_clusters = coalesce((target_permissions->>'other_clusters')::boolean, other_clusters),
    updated_at = now()
  where workspace_id = target_workspace_id
  returning * into result;
  if result.workspace_id is null then raise exception 'Workspace not found' using errcode = 'P0002'; end if;
  return result;
end;
$$;

revoke all on function public.admin_crm_create_workspace(text, text, text, uuid, uuid, timestamptz, jsonb) from public, anon;
revoke all on function public.admin_crm_regenerate_workspace_token(uuid) from public, anon;
revoke all on function public.admin_crm_set_workspace_status(uuid, text) from public, anon;
revoke all on function public.admin_crm_extend_workspace_expiry(uuid, timestamptz) from public, anon;
revoke all on function public.admin_crm_update_workspace_permissions(uuid, jsonb) from public, anon;
grant execute on function public.admin_crm_create_workspace(text, text, text, uuid, uuid, timestamptz, jsonb) to authenticated;
grant execute on function public.admin_crm_regenerate_workspace_token(uuid) to authenticated;
grant execute on function public.admin_crm_set_workspace_status(uuid, text) to authenticated;
grant execute on function public.admin_crm_extend_workspace_expiry(uuid, timestamptz) to authenticated;
grant execute on function public.admin_crm_update_workspace_permissions(uuid, jsonb) to authenticated;

-- ----------------------------------------------------------------------------
-- Anonymous session RPC — the ONLY entry point an unauthenticated employee
-- client has. Re-derives everything from the token; never returns raw
-- workspace/cluster/campaign UUIDs. Every later employee-facing RPC
-- (Phase 2+) follows this exact same validation shape.
-- ----------------------------------------------------------------------------

create or replace function public.workspace_authenticate(
  target_token text
) returns table (
  workspace_name text,
  employee_name text,
  campaign_name text,
  cluster_name text,
  expires_at timestamptz,
  permissions jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  workspace public.crm_field_workspaces%rowtype;
  perms public.crm_workspace_permissions%rowtype;
begin
  if target_token is null or btrim(target_token) = '' then
    raise exception 'Invalid workspace link' using errcode = '42501';
  end if;

  select * into workspace from public.crm_field_workspaces where token = btrim(target_token);
  if workspace.id is null then
    raise exception 'This workspace link is invalid' using errcode = '42501';
  end if;

  -- Lazy expiry transition — no cron job required.
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

  select * into perms from public.crm_workspace_permissions where workspace_id = workspace.id;

  update public.crm_field_workspaces set last_activity_at = now() where id = workspace.id;
  insert into public.crm_workspace_activity (workspace_id, action, metadata)
  values (workspace.id, 'workspace_opened', '{}'::jsonb);

  return query
    select
      workspace.name,
      workspace.employee_name,
      (select c.name from public.crm_campaigns c where c.id = workspace.campaign_id),
      (select cl.name from public.crm_clusters cl where cl.id = workspace.cluster_id),
      workspace.expires_at,
      jsonb_build_object(
        'add_vendors', perms.add_vendors,
        'edit_own_vendors', perms.edit_own_vendors,
        'add_notes', perms.add_notes,
        'add_followups', perms.add_followups,
        'upload_photos', perms.upload_photos,
        'call_vendor', perms.call_vendor,
        'whatsapp_vendor', perms.whatsapp_vendor,
        'view_assigned_vendors', perms.view_assigned_vendors,
        'delete_vendors', perms.delete_vendors,
        'export_data', perms.export_data,
        'view_reports', perms.view_reports,
        'view_analytics', perms.view_analytics,
        'view_settings', perms.view_settings,
        'vendor_approval', perms.vendor_approval,
        'subscription_access', perms.subscription_access,
        'other_clusters', perms.other_clusters
      );
end;
$$;

revoke all on function public.workspace_authenticate(text) from public;
grant execute on function public.workspace_authenticate(text) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- Realtime — powers the live Workspace Dashboard (Phase 3).
-- ----------------------------------------------------------------------------

do $$
declare
  realtime_table text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach realtime_table in array array[
      'crm_campaigns', 'crm_field_workspaces', 'crm_workspace_activity'
    ] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = realtime_table
      ) then
        execute format('alter publication supabase_realtime add table public.%I', realtime_table);
      end if;
    end loop;
  end if;
end
$$;

commit;
