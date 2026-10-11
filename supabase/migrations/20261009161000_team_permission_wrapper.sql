-- Migration: 20261009161000_team_permission_wrapper.sql
-- Exposes public.has_team_permission wrapper for client RPC and automated test validation

begin;

create or replace function public.has_team_permission(
  p_user_id uuid,
  p_permission text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_team_permission(p_user_id, p_permission);
$$;

grant execute on function public.has_team_permission(uuid, text) to anon, authenticated, service_role;

commit;
