begin;

-- Calendar expiry pauses a workspace but never rotates or deletes its token.
-- The same URL becomes valid again after an admin selects a current/future
-- end date and changes the workspace back to active.
create or replace function private.pause_expired_marketing_workspaces()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected integer;
begin
  update public.crm_marketing_workspaces
  set status = 'paused', updated_at = now()
  where status = 'active'
    and end_date is not null
    and end_date < (now() at time zone 'Asia/Kolkata')::date;

  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke all on function private.pause_expired_marketing_workspaces() from public, anon, authenticated;

-- Access is denied immediately at the date boundary, even during the short
-- interval before the daily status-sync job runs. This check never mutates
-- the token, assignments, or saved vendor progress.
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

  select * into workspace
  from public.crm_marketing_workspaces
  where token = btrim(target_token);

  if workspace.id is null then
    raise exception 'This workspace link is invalid' using errcode = '42501';
  end if;

  if workspace.status = 'revoked' then
    raise exception 'This workspace link has been revoked' using errcode = '42501';
  elsif workspace.status in ('paused', 'completed') then
    raise exception 'This workspace is currently paused' using errcode = '42501';
  elsif workspace.end_date is not null and workspace.end_date < (now() at time zone 'Asia/Kolkata')::date then
    raise exception 'This workspace is currently paused because its end date has passed' using errcode = '42501';
  end if;

  return workspace;
end;
$$;

revoke all on function private.resolve_active_marketing_workspace(text) from public, anon, authenticated;

-- Synchronize any workspaces that had already reached their end date.
select private.pause_expired_marketing_workspaces();

do $$
declare
  existing_job bigint;
  scheduled_job bigint;
begin
  if to_regclass('cron.job') is null then
    raise notice 'pg_cron is unavailable; link access remains date-enforced, but status synchronization needs an external daily call.';
    return;
  end if;

  execute 'select jobid from cron.job where jobname = $1 limit 1'
    into existing_job using 'royallagn-pause-expired-marketing-workspaces';
  if existing_job is not null then
    execute 'select cron.unschedule($1)' into scheduled_job using existing_job;
  end if;

  execute 'select cron.schedule($1, $2, $3)' into scheduled_job using
    'royallagn-pause-expired-marketing-workspaces',
    '31 18 * * *',
    'select private.pause_expired_marketing_workspaces();';
end;
$$;

commit;
