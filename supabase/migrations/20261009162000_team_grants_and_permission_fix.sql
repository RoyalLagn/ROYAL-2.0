-- Migration: 20261009162000_team_grants_and_permission_fix.sql
-- Grants table privileges on team_memberships & team_activity_log and refines has_team_permission logic

begin;

-- 1. Grant table privileges to authenticated and service_role
grant select, insert, update, delete on public.team_memberships to authenticated, service_role;
grant select, insert, update, delete on public.team_activity_log to authenticated, service_role;

-- 2. Refine private.has_team_permission
create or replace function private.has_team_permission(
  p_user_id uuid,
  p_permission text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_perms text[];
  v_is_active boolean;
begin
  if p_user_id is null then
    return false;
  end if;

  -- 1. Check team_memberships table for this user
  select permissions, is_active
  into v_perms, v_is_active
  from public.team_memberships
  where user_id = p_user_id;

  if found and v_is_active = true then
    if 'admin_owner' = any(v_perms) then
      return true;
    end if;
    if p_permission = any(v_perms) then
      return true;
    end if;
  end if;

  -- 2. Check system admin in public.profiles
  if exists (
    select 1
    from public.profiles
    where id = p_user_id
      and role::text in ('admin', 'super_admin')
      and is_active = true
  ) then
    return true;
  end if;

  return false;
end;
$$;

grant execute on function private.has_team_permission(uuid, text) to anon, authenticated, service_role;

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

-- 3. Update team_review_customer_payment_destination to accept service_role actor
create or replace function public.team_review_customer_payment_destination(
  p_destination_id uuid,
  p_decision text, -- 'approved' or 'changes_required'
  p_observed_name text default null,
  p_notes text default null,
  p_rejection_reason text default null,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := coalesce(p_actor_id, auth.uid());
  v_res jsonb;
begin
  if v_uid is null and not private.is_admin_or_service() then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if not private.has_team_permission(v_uid, 'payment_verifier')
     and not private.is_team_manager_or_admin(v_uid)
     and not private.is_admin_or_service() then
    raise exception 'Unauthorized: Payment Verifier access required' using errcode = '42501';
  end if;

  -- Delegate to Phase 1 review function with actor ID
  v_res := public.review_customer_payment_destination(
    p_destination_id,
    p_decision,
    p_observed_name,
    p_notes,
    p_rejection_reason,
    v_uid
  );

  -- Log in team activity
  insert into public.team_activity_log (actor_id, entity_type, entity_id, action, details)
  values (
    v_uid,
    'payment_destination',
    p_destination_id,
    p_decision,
    jsonb_build_object(
      'observed_name', p_observed_name,
      'notes', p_notes,
      'rejection_reason', p_rejection_reason
    )
  );

  return v_res;
end;
$$;

grant execute on function public.team_review_customer_payment_destination(uuid, text, text, text, text, uuid) to authenticated, service_role;

commit;
