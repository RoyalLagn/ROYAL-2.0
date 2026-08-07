begin;

-- ============================================================================
-- Marketing Workspace hard delete — admin-only, permanent removal of a
-- workspace that has run its course (status 'completed' or 'revoked').
-- Active/paused workspaces can never be deleted through this RPC; they must
-- be paused/revoked first via admin_crm_set_marketing_workspace_status.
--
-- "Active token/session" note: this feature has no session table — a team's
-- link is only ever usable while status = 'active' (private.
-- resolve_active_marketing_workspace raises for paused/completed/revoked).
-- So "no active team session" is structurally equivalent to "status is not
-- active", which the status guard below already enforces. The row is locked
-- with `for update` first so a concurrent admin_crm_set_marketing_workspace_
-- status call (e.g. someone resuming the workspace mid-request) can't race
-- past the check — the status is re-read under the lock, not before it.
--
-- Cascade scope: crm_marketing_workspace_categories and
-- crm_marketing_workspace_vendors both declare
-- `workspace_id ... references crm_marketing_workspaces(id) on delete
-- cascade`, so a single delete on the parent row removes every assignment
-- record that belongs *exclusively* to this workspace — including any vendor
-- still mid-pipeline in this workspace, since a workspace that is completed
-- or revoked can no longer accept progress updates (the anon RPCs also gate
-- on resolve_active_marketing_workspace). crm_vendors, crm_vendor_categories
-- and crm_activities are never touched — vendors are referenced, not owned,
-- by a marketing workspace.
-- ============================================================================

create or replace function public.admin_crm_delete_marketing_workspace(
  target_workspace_id uuid
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  workspace_status text;
begin
  if not private.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  -- Lock the row for the duration of this transaction so the status check
  -- below and the delete are atomic with respect to any concurrent status
  -- change (resume/regenerate-token/etc.) — no TOCTOU window.
  select status into workspace_status
  from public.crm_marketing_workspaces
  where id = target_workspace_id
  for update;

  if workspace_status is null then
    raise exception 'Workspace not found' using errcode = 'P0002';
  end if;

  if workspace_status not in ('completed', 'revoked') then
    raise exception 'This workspace cannot be deleted because it is currently active. Revoke or complete the workspace and ensure no active team session exists before deleting.'
      using errcode = '42501';
  end if;

  -- Cascades to crm_marketing_workspace_categories and
  -- crm_marketing_workspace_vendors; leaves crm_vendors/crm_vendor_categories
  -- untouched. Still under the row lock taken above, so this is the same
  -- transaction that validated the status — no window for it to change.
  delete from public.crm_marketing_workspaces where id = target_workspace_id;
end;
$$;

revoke all on function public.admin_crm_delete_marketing_workspace(uuid) from public, anon;
grant execute on function public.admin_crm_delete_marketing_workspace(uuid) to authenticated;

commit;
