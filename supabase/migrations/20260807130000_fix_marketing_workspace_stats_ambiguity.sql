begin;

-- Bug fix: admin_crm_marketing_workspace_stats and marketing_workspace_progress
-- declare OUT parameters named `contacted`, `meeting_done`, `registered` —
-- the exact same names as columns on crm_marketing_workspace_vendors. Inside
-- a plpgsql function body, an unqualified reference to one of those names is
-- ambiguous between the OUT parameter (a plpgsql variable) and the table
-- column, e.g. `count(*) filter (where contacted)`. Postgres correctly
-- rejects this with "column reference is ambiguous". Fix: qualify every
-- such reference with the table alias so it unambiguously means the column.

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
      count(*) filter (where mwv.contacted),
      count(*) filter (where mwv.meeting_done),
      count(*) filter (where mwv.interest_status = 'interested'),
      count(*) filter (where mwv.interest_status = 'not_interested'),
      count(*) filter (where mwv.registered),
      count(*) filter (where not mwv.registered and mwv.interest_status <> 'not_interested'),
      case when count(*) = 0 then 0 else round(
        avg(
          case
            when mwv.registered then 100
            when mwv.interest_status = 'interested' then 75
            when mwv.meeting_done then 50
            when mwv.contacted then 25
            else 0
          end
        )
      )::integer end
    from public.crm_marketing_workspace_vendors mwv
    where mwv.workspace_id = target_workspace_id;
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
      count(*) filter (where mwv.contacted),
      count(*) filter (where mwv.meeting_done),
      count(*) filter (where mwv.interest_status = 'interested'),
      count(*) filter (where mwv.interest_status = 'not_interested'),
      count(*) filter (where mwv.registered),
      count(*) filter (where not mwv.registered and mwv.interest_status <> 'not_interested'),
      case when count(*) = 0 then 0 else round(
        avg(
          case
            when mwv.registered then 100
            when mwv.interest_status = 'interested' then 75
            when mwv.meeting_done then 50
            when mwv.contacted then 25
            else 0
          end
        )
      )::integer end
    from public.crm_marketing_workspace_vendors mwv
    where mwv.workspace_id = workspace.id;
end;
$$;

commit;
