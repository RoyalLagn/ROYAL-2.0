begin;

-- ============================================================================
-- Marketing Workspace Assignment & Progress Tracking — a second, separate
-- workspace concept alongside crm_field_workspaces (Field Workspaces).
--
-- Field Workspaces: one employee, one cluster, employee adds NEW vendors.
-- Marketing Workspaces: one team, any categories/vendors picked by admin
-- from the EXISTING crm_vendors pool, team tracks a 4-stage pipeline.
--
-- Same security model as Field Workspaces: a secret token is the only
-- credential, every SECURITY DEFINER RPC re-derives the workspace from the
-- token, zero direct anon grants on the underlying tables, and progress
-- writes always go through to crm_vendors (single source of truth) —
-- vendors are referenced, never copied.
-- ============================================================================

create table public.crm_marketing_workspaces (
  id uuid primary key default gen_random_uuid(),
  token text not null,
  name text not null,
  team_name text not null,
  description text,
  start_date date,
  end_date date,
  priority text not null default 'medium',
  status text not null default 'active',
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_marketing_workspaces_name_not_blank check (btrim(name) <> ''),
  constraint crm_marketing_workspaces_team_not_blank check (btrim(team_name) <> ''),
  constraint crm_marketing_workspaces_priority_valid check (priority in ('low', 'medium', 'high')),
  constraint crm_marketing_workspaces_status_valid check (status in ('active', 'paused', 'completed', 'revoked')),
  constraint crm_marketing_workspaces_dates_order check (end_date is null or start_date is null or end_date >= start_date)
);
create unique index crm_marketing_workspaces_token_unique_idx on public.crm_marketing_workspaces (token);
create index crm_marketing_workspaces_status_idx on public.crm_marketing_workspaces (status, created_at desc);

create table public.crm_marketing_workspace_categories (
  workspace_id uuid not null references public.crm_marketing_workspaces(id) on delete cascade,
  category_id uuid not null references public.crm_vendor_categories(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (workspace_id, category_id)
);

create table public.crm_marketing_workspace_vendors (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.crm_marketing_workspaces(id) on delete cascade,
  vendor_id uuid not null references public.crm_vendors(id) on delete cascade,
  contacted boolean not null default false,
  contacted_at timestamptz,
  meeting_done boolean not null default false,
  meeting_done_at timestamptz,
  interest_status text not null default 'pending',
  not_interested_reason text,
  registered boolean not null default false,
  registered_at timestamptz,
  next_followup_date date,
  notes text,
  remarks text,
  call_outcome text,
  assigned_by uuid references public.profiles(id) on delete set null,
  assigned_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_marketing_workspace_vendors_interest_valid check (interest_status in ('pending', 'interested', 'not_interested')),
  constraint crm_marketing_workspace_vendors_unique unique (workspace_id, vendor_id)
);
create index crm_marketing_workspace_vendors_workspace_idx on public.crm_marketing_workspace_vendors (workspace_id);
create index crm_marketing_workspace_vendors_vendor_idx on public.crm_marketing_workspace_vendors (vendor_id);

create trigger crm_marketing_workspaces_set_updated_at before update on public.crm_marketing_workspaces
for each row execute function private.set_updated_at();
create trigger crm_marketing_workspace_vendors_set_updated_at before update on public.crm_marketing_workspace_vendors
for each row execute function private.set_updated_at();

-- ----------------------------------------------------------------------------
-- RLS — admin management surface. No anon grants anywhere in this block;
-- anonymous team access exists only through the SECURITY DEFINER RPCs below.
-- ----------------------------------------------------------------------------

alter table public.crm_marketing_workspaces enable row level security;
alter table public.crm_marketing_workspace_categories enable row level security;
alter table public.crm_marketing_workspace_vendors enable row level security;

revoke all on public.crm_marketing_workspaces, public.crm_marketing_workspace_categories,
  public.crm_marketing_workspace_vendors
from public, anon, authenticated;

grant select, update on public.crm_marketing_workspaces to authenticated;
grant select on public.crm_marketing_workspace_categories to authenticated;
grant select on public.crm_marketing_workspace_vendors to authenticated;

create policy crm_marketing_workspaces_admin_all on public.crm_marketing_workspaces for all to authenticated
using (private.is_admin()) with check (private.is_admin());
create policy crm_marketing_workspace_categories_admin_read on public.crm_marketing_workspace_categories for select to authenticated
using (private.is_admin());
create policy crm_marketing_workspace_vendors_admin_read on public.crm_marketing_workspace_vendors for select to authenticated
using (private.is_admin());

-- ----------------------------------------------------------------------------
-- private.resolve_active_marketing_workspace — the marketing-workspace
-- counterpart to private.resolve_active_workspace(). Kept separate (rather
-- than reused) since it validates against crm_marketing_workspaces, a
-- different table with different lifecycle rules (end_date-based expiry
-- instead of a mandatory expires_at).
-- ----------------------------------------------------------------------------

create or replace function private.resolve_active_marketing_workspace(target_token text)
returns public.crm_marketing_workspaces
language plpgsql
security definer
set search_path = ''
as $$
declare
  workspace public.crm_marketing_workspaces%rowtype;
begin
  if target_token is null or btrim(target_token) = '' then
    raise exception 'Invalid workspace link' using errcode = '42501';
  end if;

  select * into workspace from public.crm_marketing_workspaces where token = btrim(target_token);
  if workspace.id is null then
    raise exception 'This workspace link is invalid' using errcode = '42501';
  end if;

  if workspace.status = 'active' and workspace.end_date is not null and workspace.end_date < current_date then
    update public.crm_marketing_workspaces set status = 'completed' where id = workspace.id;
    workspace.status := 'completed';
  end if;

  if workspace.status = 'revoked' then
    raise exception 'This workspace link has been revoked' using errcode = '42501';
  elsif workspace.status = 'paused' then
    raise exception 'This workspace is currently paused' using errcode = '42501';
  elsif workspace.status = 'completed' then
    raise exception 'This workspace has ended' using errcode = '42501';
  end if;

  return workspace;
end;
$$;

revoke all on function private.resolve_active_marketing_workspace(text) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- private.sync_marketing_pipeline_status — forward-only sync into
-- crm_vendors.status, the single source of truth. Never downgrades a vendor
-- that has already progressed further (e.g. already registered/premium) via
-- any other path (admin, field workspace, or a different marketing
-- workspace). Every call also appends a crm_activities row so the change is
-- immediately visible on the admin vendor profile, reports and dashboard —
-- exactly the "one source of truth, instantly reflected everywhere"
-- requirement.
-- ----------------------------------------------------------------------------

create or replace function private.sync_marketing_pipeline_status(
  target_vendor_id uuid,
  stage text,
  actor_note text default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_status public.crm_vendor_status;
  next_status public.crm_vendor_status;
  advanced_statuses constant text[] := array['registered_on_royallagn', 'subscription_pending', 'premium_customer'];
begin
  select status into current_status from public.crm_vendors where id = target_vendor_id;
  if current_status is null then return; end if;

  next_status := null;
  if stage = 'contacted' and current_status = 'not_contacted' then
    next_status := 'contact_attempted';
  elsif stage = 'meeting_done' and current_status in ('not_contacted', 'contact_attempted', 'call_not_answered') then
    next_status := 'meeting_completed';
  elsif stage = 'interested' and not (current_status::text = any(advanced_statuses)) then
    next_status := 'interested';
  elsif stage = 'not_interested' and not (current_status::text = any(advanced_statuses)) then
    next_status := 'not_interested';
  elsif stage = 'registered' and not (current_status::text = any(advanced_statuses)) then
    next_status := 'registered_on_royallagn';
  end if;

  if next_status is not null and next_status is distinct from current_status then
    update public.crm_vendors set status = next_status, updated_at = now() where id = target_vendor_id;
    insert into public.crm_activities (vendor_id, action, from_status, to_status, metadata)
    values (
      target_vendor_id, 'marketing_pipeline_update', current_status, next_status,
      case when actor_note is null or btrim(actor_note) = '' then '{}'::jsonb else jsonb_build_object('note', actor_note) end
    );
  end if;
end;
$$;

revoke all on function private.sync_marketing_pipeline_status(uuid, text, text) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- Admin RPCs
-- ----------------------------------------------------------------------------

create or replace function public.admin_crm_create_marketing_workspace(
  workspace_name text,
  target_team_name text,
  target_description text default null,
  target_start_date date default null,
  target_end_date date default null,
  target_priority text default 'medium',
  target_status text default 'active'
) returns public.crm_marketing_workspaces
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.crm_marketing_workspaces;
  generated_token text;
begin
  if not private.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  generated_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

  insert into public.crm_marketing_workspaces (
    token, name, team_name, description, start_date, end_date, priority, status, created_by
  ) values (
    generated_token, workspace_name, target_team_name, target_description,
    target_start_date, target_end_date, coalesce(target_priority, 'medium'),
    coalesce(target_status, 'active'), auth.uid()
  )
  returning * into result;

  return result;
end;
$$;

create or replace function public.admin_crm_update_marketing_workspace(
  target_workspace_id uuid,
  changes jsonb
) returns public.crm_marketing_workspaces
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.crm_marketing_workspaces;
begin
  if not private.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  update public.crm_marketing_workspaces set
    name = coalesce(nullif(btrim(changes->>'name'), ''), name),
    team_name = coalesce(nullif(btrim(changes->>'team_name'), ''), team_name),
    description = case when changes ? 'description' then nullif(btrim(changes->>'description'), '') else description end,
    start_date = case when changes ? 'start_date' then nullif(changes->>'start_date', '')::date else start_date end,
    end_date = case when changes ? 'end_date' then nullif(changes->>'end_date', '')::date else end_date end,
    priority = coalesce(nullif(btrim(changes->>'priority'), ''), priority),
    updated_by = auth.uid(),
    updated_at = now()
  where id = target_workspace_id
  returning * into result;
  if result.id is null then raise exception 'Workspace not found' using errcode = 'P0002'; end if;
  return result;
end;
$$;

create or replace function public.admin_crm_set_marketing_workspace_status(
  target_workspace_id uuid,
  target_status text
) returns public.crm_marketing_workspaces
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.crm_marketing_workspaces;
begin
  if not private.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if target_status not in ('active', 'paused', 'completed', 'revoked') then
    raise exception 'Unsupported workspace status: %', target_status;
  end if;
  update public.crm_marketing_workspaces set status = target_status, updated_by = auth.uid()
  where id = target_workspace_id
  returning * into result;
  if result.id is null then raise exception 'Workspace not found' using errcode = 'P0002'; end if;
  return result;
end;
$$;

create or replace function public.admin_crm_regenerate_marketing_workspace_token(
  target_workspace_id uuid
) returns public.crm_marketing_workspaces
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.crm_marketing_workspaces;
begin
  if not private.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  update public.crm_marketing_workspaces
  set token = replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''), updated_by = auth.uid()
  where id = target_workspace_id
  returning * into result;
  if result.id is null then raise exception 'Workspace not found' using errcode = 'P0002'; end if;
  return result;
end;
$$;

create or replace function public.admin_crm_set_marketing_workspace_categories(
  target_workspace_id uuid,
  target_category_ids uuid[]
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.crm_marketing_workspaces where id = target_workspace_id) then
    raise exception 'Workspace not found' using errcode = 'P0002';
  end if;

  delete from public.crm_marketing_workspace_categories where workspace_id = target_workspace_id;
  insert into public.crm_marketing_workspace_categories (workspace_id, category_id)
  select target_workspace_id, category_id from unnest(coalesce(target_category_ids, array[]::uuid[])) as category_id
  on conflict do nothing;
end;
$$;

create or replace function public.admin_crm_assign_marketing_workspace_vendors(
  target_workspace_id uuid,
  target_vendor_ids uuid[]
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_count integer;
begin
  if not private.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.crm_marketing_workspaces where id = target_workspace_id) then
    raise exception 'Workspace not found' using errcode = 'P0002';
  end if;

  insert into public.crm_marketing_workspace_vendors (workspace_id, vendor_id, assigned_by)
  select target_workspace_id, vendor_id, auth.uid()
  from unnest(coalesce(target_vendor_ids, array[]::uuid[])) as vendor_id
  on conflict (workspace_id, vendor_id) do nothing;
  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

create or replace function public.admin_crm_unassign_marketing_workspace_vendor(
  target_workspace_id uuid,
  target_vendor_id uuid
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  delete from public.crm_marketing_workspace_vendors
  where workspace_id = target_workspace_id and vendor_id = target_vendor_id;
end;
$$;

-- Vendor picker for the assignment screen: every crm_vendor in the selected
-- categories, flagged with whether it's already assigned to this workspace.
create or replace function public.admin_crm_list_assignable_vendors(
  target_workspace_id uuid,
  target_category_ids uuid[] default null,
  search_text text default null,
  page_size integer default 50,
  page_offset integer default 0
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

-- Aggregate progress for one workspace's dashboard/detail page.
create or replace function public.admin_crm_marketing_workspace_stats(
  target_workspace_id uuid
) returns table (
  assigned bigint,
  contacted bigint,
  meeting_done bigint,
  interested bigint,
  not_interested bigint,
  registered bigint,
  pending bigint,
  weighted_completion integer
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
      count(*),
      count(*) filter (where contacted),
      count(*) filter (where meeting_done),
      count(*) filter (where interest_status = 'interested'),
      count(*) filter (where interest_status = 'not_interested'),
      count(*) filter (where registered),
      count(*) filter (where not registered and interest_status <> 'not_interested'),
      case when count(*) = 0 then 0 else round(
        avg(
          case
            when registered then 100
            when interest_status = 'interested' then 75
            when meeting_done then 50
            when contacted then 25
            else 0
          end
        )
      )::integer end
    from public.crm_marketing_workspace_vendors
    where workspace_id = target_workspace_id;
end;
$$;

revoke all on function public.admin_crm_create_marketing_workspace(text, text, text, date, date, text, text) from public, anon;
revoke all on function public.admin_crm_update_marketing_workspace(uuid, jsonb) from public, anon;
revoke all on function public.admin_crm_set_marketing_workspace_status(uuid, text) from public, anon;
revoke all on function public.admin_crm_regenerate_marketing_workspace_token(uuid) from public, anon;
revoke all on function public.admin_crm_set_marketing_workspace_categories(uuid, uuid[]) from public, anon;
revoke all on function public.admin_crm_assign_marketing_workspace_vendors(uuid, uuid[]) from public, anon;
revoke all on function public.admin_crm_unassign_marketing_workspace_vendor(uuid, uuid) from public, anon;
revoke all on function public.admin_crm_list_assignable_vendors(uuid, uuid[], text, integer, integer) from public, anon;
revoke all on function public.admin_crm_marketing_workspace_stats(uuid) from public, anon;
grant execute on function public.admin_crm_create_marketing_workspace(text, text, text, date, date, text, text) to authenticated;
grant execute on function public.admin_crm_update_marketing_workspace(uuid, jsonb) to authenticated;
grant execute on function public.admin_crm_set_marketing_workspace_status(uuid, text) to authenticated;
grant execute on function public.admin_crm_regenerate_marketing_workspace_token(uuid) to authenticated;
grant execute on function public.admin_crm_set_marketing_workspace_categories(uuid, uuid[]) to authenticated;
grant execute on function public.admin_crm_assign_marketing_workspace_vendors(uuid, uuid[]) to authenticated;
grant execute on function public.admin_crm_unassign_marketing_workspace_vendor(uuid, uuid) to authenticated;
grant execute on function public.admin_crm_list_assignable_vendors(uuid, uuid[], text, integer, integer) to authenticated;
grant execute on function public.admin_crm_marketing_workspace_stats(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Anonymous team RPCs — the only surface a team-link holder can reach.
-- ----------------------------------------------------------------------------

create or replace function public.marketing_workspace_authenticate(
  target_token text
) returns table (
  workspace_name text,
  team_name text,
  description text,
  start_date date,
  end_date date,
  priority text,
  status text,
  category_names text[]
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  workspace public.crm_marketing_workspaces;
begin
  workspace := private.resolve_active_marketing_workspace(target_token);
  return query
    select
      workspace.name, workspace.team_name, workspace.description,
      workspace.start_date, workspace.end_date, workspace.priority, workspace.status,
      coalesce(array_agg(c.name order by c.name) filter (where c.name is not null), array[]::text[])
    from public.crm_marketing_workspace_categories mwc
    left join public.crm_vendor_categories c on c.id = mwc.category_id
    where mwc.workspace_id = workspace.id
    group by workspace.name, workspace.team_name, workspace.description,
      workspace.start_date, workspace.end_date, workspace.priority, workspace.status;

  -- No categories assigned yet still returns the workspace shell.
  if not found then
    return query select
      workspace.name, workspace.team_name, workspace.description,
      workspace.start_date, workspace.end_date, workspace.priority, workspace.status,
      array[]::text[];
  end if;
end;
$$;

create or replace function public.marketing_workspace_progress(
  target_token text
) returns table (
  assigned bigint,
  contacted bigint,
  meeting_done bigint,
  interested bigint,
  not_interested bigint,
  registered bigint,
  pending bigint,
  weighted_completion integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  workspace public.crm_marketing_workspaces;
begin
  workspace := private.resolve_active_marketing_workspace(target_token);
  return query
    select
      count(*),
      count(*) filter (where contacted),
      count(*) filter (where meeting_done),
      count(*) filter (where interest_status = 'interested'),
      count(*) filter (where interest_status = 'not_interested'),
      count(*) filter (where registered),
      count(*) filter (where not registered and interest_status <> 'not_interested'),
      case when count(*) = 0 then 0 else round(
        avg(
          case
            when registered then 100
            when interest_status = 'interested' then 75
            when meeting_done then 50
            when contacted then 25
            else 0
          end
        )
      )::integer end
    from public.crm_marketing_workspace_vendors
    where workspace_id = workspace.id;
end;
$$;

create or replace function public.marketing_workspace_list_vendors(
  target_token text,
  search_text text default null,
  interest_filter text default null,
  registered_filter boolean default null,
  page_size integer default 20,
  page_offset integer default 0
) returns table (
  assignment_id uuid,
  vendor_id uuid,
  business_name text,
  owner_name text,
  phone text,
  area text,
  category_name text,
  vendor_status public.crm_vendor_status,
  contacted boolean,
  meeting_done boolean,
  interest_status text,
  registered boolean,
  next_followup_date date,
  total_count bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  workspace public.crm_marketing_workspaces;
begin
  workspace := private.resolve_active_marketing_workspace(target_token);

  return query
    with scoped as (
      select
        mwv.id as assignment_id, v.id as vendor_id, v.business_name, v.owner_name, v.phone, v.area,
        c.name as category_name, v.status as vendor_status,
        mwv.contacted, mwv.meeting_done, mwv.interest_status, mwv.registered, mwv.next_followup_date
      from public.crm_marketing_workspace_vendors mwv
      join public.crm_vendors v on v.id = mwv.vendor_id
      left join public.crm_vendor_categories c on c.id = v.category_id
      where mwv.workspace_id = workspace.id
        and (
          nullif(btrim(search_text), '') is null
          or v.business_name ilike '%' || btrim(search_text) || '%'
          or v.owner_name ilike '%' || btrim(search_text) || '%'
          or v.phone ilike '%' || btrim(search_text) || '%'
          or c.name ilike '%' || btrim(search_text) || '%'
        )
        and (interest_filter is null or interest_filter = 'all' or mwv.interest_status = interest_filter)
        and (registered_filter is null or mwv.registered = registered_filter)
    )
    select s.*, count(*) over () as total_count
    from scoped s
    order by s.business_name
    limit least(greatest(page_size, 1), 100)
    offset greatest(page_offset, 0);
end;
$$;

create or replace function public.marketing_workspace_get_vendor(
  target_token text,
  target_vendor_id uuid
) returns table (
  vendor_id uuid,
  business_name text,
  owner_name text,
  phone text,
  whatsapp text,
  area text,
  category_name text,
  cluster_name text,
  vendor_status public.crm_vendor_status,
  contacted boolean,
  meeting_done boolean,
  interest_status text,
  not_interested_reason text,
  registered boolean,
  next_followup_date date,
  notes text,
  remarks text,
  call_outcome text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  workspace public.crm_marketing_workspaces;
begin
  workspace := private.resolve_active_marketing_workspace(target_token);

  return query
    select
      v.id, v.business_name, v.owner_name, v.phone, v.whatsapp, v.area,
      c.name, cl.name, v.status,
      mwv.contacted, mwv.meeting_done, mwv.interest_status, mwv.not_interested_reason,
      mwv.registered, mwv.next_followup_date, mwv.notes, mwv.remarks, mwv.call_outcome
    from public.crm_marketing_workspace_vendors mwv
    join public.crm_vendors v on v.id = mwv.vendor_id
    left join public.crm_vendor_categories c on c.id = v.category_id
    left join public.crm_clusters cl on cl.id = v.cluster_id
    where mwv.workspace_id = workspace.id and mwv.vendor_id = target_vendor_id;

  if not found then
    raise exception 'Vendor not found in this workspace' using errcode = 'P0002';
  end if;
end;
$$;

-- The core pipeline-update RPC. Every non-null argument is applied; the
-- underlying crm_vendors.status is synced forward-only via
-- private.sync_marketing_pipeline_status(), and every change is logged to
-- crm_activities so it's instantly visible on the admin vendor profile.
create or replace function public.marketing_workspace_update_vendor_progress(
  target_token text,
  target_vendor_id uuid,
  set_contacted boolean default null,
  set_meeting_done boolean default null,
  set_interest_status text default null,
  set_not_interested_reason text default null,
  set_registered boolean default null,
  set_next_followup_date date default null,
  set_notes text default null,
  set_remarks text default null,
  set_call_outcome text default null
) returns public.crm_marketing_workspace_vendors
language plpgsql
security definer
set search_path = ''
as $$
declare
  workspace public.crm_marketing_workspaces;
  result public.crm_marketing_workspace_vendors;
begin
  workspace := private.resolve_active_marketing_workspace(target_token);

  if not exists (
    select 1 from public.crm_marketing_workspace_vendors
    where workspace_id = workspace.id and vendor_id = target_vendor_id
  ) then
    raise exception 'Vendor not found in this workspace' using errcode = 'P0002';
  end if;
  if set_interest_status is not null and set_interest_status not in ('pending', 'interested', 'not_interested') then
    raise exception 'Unsupported interest status: %', set_interest_status;
  end if;

  update public.crm_marketing_workspace_vendors set
    contacted = coalesce(set_contacted, contacted),
    contacted_at = case when set_contacted then coalesce(contacted_at, now()) else contacted_at end,
    meeting_done = coalesce(set_meeting_done, meeting_done),
    meeting_done_at = case when set_meeting_done then coalesce(meeting_done_at, now()) else meeting_done_at end,
    interest_status = coalesce(set_interest_status, interest_status),
    not_interested_reason = case when set_interest_status = 'not_interested' then set_not_interested_reason
      when set_interest_status is not null then null else not_interested_reason end,
    registered = coalesce(set_registered, registered),
    registered_at = case when set_registered then coalesce(registered_at, now()) else registered_at end,
    next_followup_date = case when set_next_followup_date is not null then set_next_followup_date else next_followup_date end,
    notes = case when set_notes is not null then set_notes else notes end,
    remarks = case when set_remarks is not null then set_remarks else remarks end,
    call_outcome = case when set_call_outcome is not null then set_call_outcome else call_outcome end,
    updated_at = now()
  where workspace_id = workspace.id and vendor_id = target_vendor_id
  returning * into result;

  if set_contacted then perform private.sync_marketing_pipeline_status(target_vendor_id, 'contacted'); end if;
  if set_meeting_done then perform private.sync_marketing_pipeline_status(target_vendor_id, 'meeting_done'); end if;
  if set_interest_status = 'interested' then perform private.sync_marketing_pipeline_status(target_vendor_id, 'interested'); end if;
  if set_interest_status = 'not_interested' then perform private.sync_marketing_pipeline_status(target_vendor_id, 'not_interested', set_not_interested_reason); end if;
  if set_registered then perform private.sync_marketing_pipeline_status(target_vendor_id, 'registered'); end if;

  return result;
end;
$$;

create or replace function public.marketing_workspace_log_activity(
  target_token text,
  target_vendor_id uuid,
  action text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  workspace public.crm_marketing_workspaces;
begin
  workspace := private.resolve_active_marketing_workspace(target_token);
  if action not in ('call_started', 'whatsapp_opened') then
    raise exception 'Unsupported activity action: %', action;
  end if;
  if not exists (
    select 1 from public.crm_marketing_workspace_vendors
    where workspace_id = workspace.id and vendor_id = target_vendor_id
  ) then
    raise exception 'Vendor not found in this workspace' using errcode = 'P0002';
  end if;

  insert into public.crm_activities (vendor_id, action, metadata)
  values (target_vendor_id, action, jsonb_build_object('source', 'marketing_workspace', 'team', workspace.team_name));
end;
$$;

revoke all on function public.marketing_workspace_authenticate(text) from public;
revoke all on function public.marketing_workspace_progress(text) from public;
revoke all on function public.marketing_workspace_list_vendors(text, text, text, boolean, integer, integer) from public;
revoke all on function public.marketing_workspace_get_vendor(text, uuid) from public;
revoke all on function public.marketing_workspace_update_vendor_progress(text, uuid, boolean, boolean, text, text, boolean, date, text, text, text) from public;
revoke all on function public.marketing_workspace_log_activity(text, uuid, text) from public;

grant execute on function public.marketing_workspace_authenticate(text) to anon, authenticated;
grant execute on function public.marketing_workspace_progress(text) to anon, authenticated;
grant execute on function public.marketing_workspace_list_vendors(text, text, text, boolean, integer, integer) to anon, authenticated;
grant execute on function public.marketing_workspace_get_vendor(text, uuid) to anon, authenticated;
grant execute on function public.marketing_workspace_update_vendor_progress(text, uuid, boolean, boolean, text, text, boolean, date, text, text, text) to anon, authenticated;
grant execute on function public.marketing_workspace_log_activity(text, uuid, text) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- Realtime — powers the live admin dashboard.
-- ----------------------------------------------------------------------------

do $$
declare
  realtime_table text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach realtime_table in array array[
      'crm_marketing_workspaces', 'crm_marketing_workspace_vendors'
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
