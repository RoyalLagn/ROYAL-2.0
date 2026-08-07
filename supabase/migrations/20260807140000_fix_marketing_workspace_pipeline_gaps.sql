begin;

-- Fixes two confirmed code-review findings against
-- supabase/migrations/20260807120000_crm_marketing_workspaces.sql:

-- ----------------------------------------------------------------------------
-- Finding: clearing Notes/Remarks/Call Outcome/Next Follow-up Date in the
-- team pipeline screen never persisted. The RPC treated a null argument as
-- "leave unchanged", but the client also sent null for "field deliberately
-- cleared to empty" — the two cases were indistinguishable. Fix: for the
-- three text fields, treat an empty string as "clear this field" (via
-- nullif) while true SQL NULL still means "not part of this update" (the
-- checkbox-only calls never pass these params at all, so they arrive as
-- NULL and are correctly left alone). Next follow-up date needs the same
-- empty-string sentinel, which means widening its parameter from `date` to
-- `text` (parsed internally) — a parameter type change requires DROP +
-- CREATE, not CREATE OR REPLACE.
-- ----------------------------------------------------------------------------

drop function if exists public.marketing_workspace_update_vendor_progress(
  text, uuid, boolean, boolean, text, text, boolean, date, text, text, text
);

create function public.marketing_workspace_update_vendor_progress(
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

  if set_contacted then perform private.sync_marketing_pipeline_status(target_vendor_id, 'contacted'); end if;
  if set_meeting_done then perform private.sync_marketing_pipeline_status(target_vendor_id, 'meeting_done'); end if;
  if set_interest_status = 'interested' then perform private.sync_marketing_pipeline_status(target_vendor_id, 'interested'); end if;
  if set_interest_status = 'not_interested' then perform private.sync_marketing_pipeline_status(target_vendor_id, 'not_interested', set_not_interested_reason); end if;
  if set_registered then perform private.sync_marketing_pipeline_status(target_vendor_id, 'registered'); end if;

  return result;
end;
$$;

revoke all on function public.marketing_workspace_update_vendor_progress(
  text, uuid, boolean, boolean, text, text, boolean, text, text, text, text
) from public;
grant execute on function public.marketing_workspace_update_vendor_progress(
  text, uuid, boolean, boolean, text, text, boolean, text, text, text, text
) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- Finding: private.sync_marketing_pipeline_status() didn't advance
-- crm_vendors.status from two realistic intermediate states —
-- 'meeting_scheduled' (the natural predecessor of "meeting done") and
-- 'call_not_answered' (the natural predecessor of "contacted"). Widen both
-- stage checks to include them.
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
    insert into public.crm_activities (vendor_id, action, from_status, to_status, metadata)
    values (
      target_vendor_id, 'marketing_pipeline_update', current_status, next_status,
      case when actor_note is null or btrim(actor_note) = '' then '{}'::jsonb else jsonb_build_object('note', actor_note) end
    );
  end if;
end;
$$;

commit;
