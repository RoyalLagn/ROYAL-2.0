begin;

-- ============================================================================
-- Marketing Workspace vendor-progress Save — fixes for the "Save does
-- nothing" report.
--
-- Root cause was entirely client-side (app/CrmMarketingWorkspaceVendorDetail
-- .tsx): every checkbox/interest toggle fired its own immediate save +
-- reload, and a `useEffect([vendor])` resynced the free-text fields
-- (Notes/Remarks/Call Outcome/Next Follow-up Date) from the server on every
-- one of those reloads — silently discarding whatever the team member had
-- just typed if they touched any other control before pressing Save. The UI
-- fix (companion to this migration) collapses the whole form into one local
-- draft, submitted by a single Save button in one RPC call.
--
-- That consolidation is also what makes the save genuinely atomic in
-- practice: marketing_workspace_update_vendor_progress was already a single
-- PL/pgSQL function body — the assignment-row update, the crm_vendors
-- status sync, and the crm_activities log all already execute inside one
-- Postgres transaction, so a failure anywhere already rolled the whole call
-- back with no partial writes. The bug was that the old UI never made one
-- consolidated call for a full edit — it made several independent ones,
-- each individually atomic but not the edit as a whole.
--
-- This migration closes the one real backend gap found while fixing this:
-- private.sync_marketing_pipeline_status's crm_activities row never
-- recorded which workspace/team made the change. Anonymous team sessions
-- have no auth.uid()/profiles row to fall back on for `actor_id`, unlike
-- admin-driven activity — so, matching the existing convention already used
-- by marketing_workspace_log_activity's metadata, the workspace id and team
-- name are now threaded through into every pipeline-status activity row.
-- ============================================================================

drop function if exists private.sync_marketing_pipeline_status(uuid, text, text);

create function private.sync_marketing_pipeline_status(
  target_vendor_id uuid,
  stage text,
  actor_note text default null,
  actor_workspace_id uuid default null,
  actor_team text default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_status public.crm_vendor_status;
  next_status public.crm_vendor_status;
  advanced_statuses constant text[] := array['registered_on_royallagn', 'subscription_pending', 'premium_customer'];
  activity_metadata jsonb;
begin
  select status into current_status from public.crm_vendors where id = target_vendor_id;
  if current_status is null then return; end if;

  next_status := null;
  if stage = 'contacted' and current_status in ('not_contacted', 'call_not_answered') then
    next_status := 'contact_attempted';
  elsif stage = 'meeting_done' and current_status in ('not_contacted', 'contact_attempted', 'call_not_answered', 'meeting_scheduled') then
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

    -- source/workspace_id/team identify *who* made the change (the
    -- workspace's shared team session); note carries the not-interested
    -- reason when relevant. jsonb_strip_nulls drops whichever of these
    -- weren't supplied rather than storing literal JSON nulls.
    activity_metadata := jsonb_strip_nulls(jsonb_build_object(
      'source', case when actor_workspace_id is not null then 'marketing_workspace' else null end,
      'workspace_id', actor_workspace_id,
      'team', actor_team,
      'note', nullif(btrim(coalesce(actor_note, '')), '')
    ));

    insert into public.crm_activities (vendor_id, action, from_status, to_status, metadata)
    values (target_vendor_id, 'marketing_pipeline_update', current_status, next_status, activity_metadata);
  end if;
end;
$$;

revoke all on function private.sync_marketing_pipeline_status(uuid, text, text, uuid, text) from public, anon, authenticated;

-- Body-only change (same 11-parameter signature as
-- 20260807140000_fix_marketing_workspace_pipeline_gaps.sql) — passes the
-- already-resolved workspace's id/team_name into every pipeline-sync call
-- so the activity log above can attribute the change.
create or replace function public.marketing_workspace_update_vendor_progress(
  target_token text,
  target_vendor_id uuid,
  set_contacted boolean default null,
  set_meeting_done boolean default null,
  set_interest_status text default null,
  set_not_interested_reason text default null,
  set_registered boolean default null,
  set_next_followup_date text default null,
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
    next_followup_date = case when set_next_followup_date is not null then nullif(set_next_followup_date, '')::date else next_followup_date end,
    notes = case when set_notes is not null then nullif(set_notes, '') else notes end,
    remarks = case when set_remarks is not null then nullif(set_remarks, '') else remarks end,
    call_outcome = case when set_call_outcome is not null then nullif(set_call_outcome, '') else call_outcome end,
    updated_at = now()
  where workspace_id = workspace.id and vendor_id = target_vendor_id
  returning * into result;

  if result.id is null then
    raise exception 'Vendor not found in this workspace' using errcode = 'P0002';
  end if;

  if set_contacted then perform private.sync_marketing_pipeline_status(target_vendor_id, 'contacted', null, workspace.id, workspace.team_name); end if;
  if set_meeting_done then perform private.sync_marketing_pipeline_status(target_vendor_id, 'meeting_done', null, workspace.id, workspace.team_name); end if;
  if set_interest_status = 'interested' then perform private.sync_marketing_pipeline_status(target_vendor_id, 'interested', null, workspace.id, workspace.team_name); end if;
  if set_interest_status = 'not_interested' then perform private.sync_marketing_pipeline_status(target_vendor_id, 'not_interested', set_not_interested_reason, workspace.id, workspace.team_name); end if;
  if set_registered then perform private.sync_marketing_pipeline_status(target_vendor_id, 'registered', null, workspace.id, workspace.team_name); end if;

  return result;
end;
$$;

revoke all on function public.marketing_workspace_update_vendor_progress(
  text, uuid, boolean, boolean, text, text, boolean, text, text, text, text
) from public;
grant execute on function public.marketing_workspace_update_vendor_progress(
  text, uuid, boolean, boolean, text, text, boolean, text, text, text, text
) to anon, authenticated;

commit;
