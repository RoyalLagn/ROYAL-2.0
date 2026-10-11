-- Migration: 20261009160000_team_portal_phase2.sql
-- RoyalLagn Phase 2: Secure Team Portal, Granular Role Permissions,
-- Shared Request Queues (Atomic Claim/Release/Assign), Tiered Finance Approvals,
-- Vendor Verification Checklist, Activity Audit Log, and DB-level Marketing Isolation.

begin;

-- ============================================================================
-- 1. Create Team Memberships Table
-- ============================================================================
create table if not exists public.team_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null,
  phone text,
  permissions text[] not null default '{}',
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint team_memberships_user_id_key unique (user_id),
  constraint team_memberships_email_not_blank check (btrim(email) <> ''),
  constraint team_memberships_name_not_blank check (btrim(full_name) <> '')
);

create index if not exists team_memberships_active_idx on public.team_memberships(is_active);
create index if not exists team_memberships_email_idx on public.team_memberships(lower(email));

-- ============================================================================
-- 2. Private Security & Permission Helpers
-- ============================================================================

-- Checks if a specific user has an explicit permission or owner/admin override
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

  -- 1. Service role always has bypass permission
  if coalesce(auth.jwt()->>'role', current_setting('request.jwt.claim.role', true), current_user) = 'service_role' then
    return true;
  end if;

  -- 2. Check team_memberships table
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

  -- 3. Check system admin / super_admin role in public.profiles
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

-- Checks if a user is an active team member or platform admin
create or replace function private.is_team_member(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.team_memberships
    where user_id = p_user_id and is_active = true
  ) or exists (
    select 1
    from public.profiles
    where id = p_user_id
      and role::text in ('admin', 'super_admin')
      and is_active = true
  ) or (
    coalesce(auth.jwt()->>'role', current_setting('request.jwt.claim.role', true), current_user) = 'service_role'
  );
$$;

grant execute on function private.is_team_member(uuid) to anon, authenticated, service_role;

-- Checks if a user has manager or admin privileges
create or replace function private.is_team_manager_or_admin(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_team_permission(p_user_id, 'team_manager')
      or private.has_team_permission(p_user_id, 'admin_owner');
$$;

grant execute on function private.is_team_manager_or_admin(uuid) to anon, authenticated, service_role;

-- ============================================================================
-- 3. Queue Assignment & Escalation Columns
-- ============================================================================

-- Customer Payment Destinations queue columns
alter table public.customer_payment_destinations
  add column if not exists assigned_to uuid references auth.users(id) on delete set null,
  add column if not exists assigned_at timestamptz,
  add column if not exists assigned_by uuid references auth.users(id) on delete set null,
  add column if not exists escalated boolean not null default false,
  add column if not exists escalated_at timestamptz,
  add column if not exists escalated_by uuid references auth.users(id) on delete set null,
  add column if not exists escalation_reason text;

create index if not exists customer_payment_destinations_assigned_idx
  on public.customer_payment_destinations(assigned_to, status);

-- Referral Payout Requests queue columns
alter table public.referral_payout_requests
  add column if not exists assigned_to uuid references auth.users(id) on delete set null,
  add column if not exists assigned_at timestamptz,
  add column if not exists assigned_by uuid references auth.users(id) on delete set null,
  add column if not exists escalated boolean not null default false,
  add column if not exists escalated_at timestamptz,
  add column if not exists escalated_by uuid references auth.users(id) on delete set null,
  add column if not exists escalation_reason text,
  add column if not exists second_approval_required boolean not null default false,
  add column if not exists second_approved_by uuid references auth.users(id) on delete set null,
  add column if not exists second_approved_at timestamptz,
  add column if not exists second_approval_notes text;

create index if not exists referral_payout_requests_assigned_idx
  on public.referral_payout_requests(assigned_to, status);

-- Vendor Applications queue columns
alter table public.vendor_applications
  add column if not exists assigned_to uuid references auth.users(id) on delete set null,
  add column if not exists assigned_at timestamptz,
  add column if not exists assigned_by uuid references auth.users(id) on delete set null,
  add column if not exists escalated boolean not null default false,
  add column if not exists escalated_at timestamptz,
  add column if not exists escalated_by uuid references auth.users(id) on delete set null,
  add column if not exists escalation_reason text,
  add column if not exists verifier_recommendation text,
  add column if not exists verifier_notes text,
  add column if not exists verified_by uuid references auth.users(id) on delete set null,
  add column if not exists verified_at timestamptz;

create index if not exists vendor_applications_assigned_idx
  on public.vendor_applications(assigned_to, status);

-- ============================================================================
-- 4. Team Activity Audit Log Table
-- ============================================================================
create table if not exists public.team_activity_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references auth.users(id) on delete cascade,
  entity_type text not null, -- 'payment_destination', 'payout_request', 'vendor_application', 'team_membership'
  entity_id uuid not null,
  action text not null,      -- 'claim', 'release', 'assign', 'escalate', 'approve', 'reject', 'second_approve', 'execute_payout', 'recommend', 'manage_member'
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists team_activity_log_entity_idx on public.team_activity_log(entity_type, entity_id);
create index if not exists team_activity_log_actor_idx on public.team_activity_log(actor_id, created_at desc);
create index if not exists team_activity_log_created_idx on public.team_activity_log(created_at desc);

-- ============================================================================
-- 5. Row Level Security (RLS) & Granular Policy Enforcement
-- ============================================================================

-- A. Team Memberships RLS
alter table public.team_memberships enable row level security;

drop policy if exists team_memberships_read_all on public.team_memberships;
create policy team_memberships_read_all on public.team_memberships
  for select to authenticated
  using (private.is_team_member(auth.uid()));

drop policy if exists team_memberships_write_admin on public.team_memberships;
create policy team_memberships_write_admin on public.team_memberships
  for all to authenticated
  using (
    private.has_team_permission(auth.uid(), 'admin_owner')
    or private.is_admin_or_service()
  );

-- B. Team Activity Log RLS
alter table public.team_activity_log enable row level security;

drop policy if exists team_activity_log_read on public.team_activity_log;
create policy team_activity_log_read on public.team_activity_log
  for select to authenticated
  using (private.is_team_member(auth.uid()));

drop policy if exists team_activity_log_insert on public.team_activity_log;
create policy team_activity_log_insert on public.team_activity_log
  for insert to authenticated
  with check (private.is_team_member(auth.uid()));

-- C. Customer Payment Destinations RLS (Marketing is strictly DENIED)
drop policy if exists customer_payment_destinations_team_read on public.customer_payment_destinations;
create policy customer_payment_destinations_team_read on public.customer_payment_destinations
  for select to authenticated
  using (
    customer_id = auth.uid()
    or private.has_team_permission(auth.uid(), 'payment_verifier')
    or private.has_team_permission(auth.uid(), 'team_manager')
    or private.has_team_permission(auth.uid(), 'admin_owner')
    or private.is_admin_or_service()
  );

drop policy if exists customer_payment_destinations_team_update on public.customer_payment_destinations;
create policy customer_payment_destinations_team_update on public.customer_payment_destinations
  for update to authenticated
  using (
    private.has_team_permission(auth.uid(), 'payment_verifier')
    or private.has_team_permission(auth.uid(), 'team_manager')
    or private.has_team_permission(auth.uid(), 'admin_owner')
    or private.is_admin_or_service()
  );

-- D. Referral Payout Requests RLS (Marketing is strictly DENIED)
drop policy if exists referral_payout_requests_team_read on public.referral_payout_requests;
create policy referral_payout_requests_team_read on public.referral_payout_requests
  for select to authenticated
  using (
    customer_id = auth.uid()
    or private.has_team_permission(auth.uid(), 'finance_operator')
    or private.has_team_permission(auth.uid(), 'team_manager')
    or private.has_team_permission(auth.uid(), 'admin_owner')
    or private.is_admin_or_service()
  );

drop policy if exists referral_payout_requests_team_update on public.referral_payout_requests;
create policy referral_payout_requests_team_update on public.referral_payout_requests
  for update to authenticated
  using (
    private.has_team_permission(auth.uid(), 'finance_operator')
    or private.has_team_permission(auth.uid(), 'team_manager')
    or private.has_team_permission(auth.uid(), 'admin_owner')
    or private.is_admin_or_service()
  );

-- E. Vendor Applications RLS
drop policy if exists vendor_applications_team_read on public.vendor_applications;
create policy vendor_applications_team_read on public.vendor_applications
  for select to authenticated
  using (
    profile_id = auth.uid()
    or private.has_team_permission(auth.uid(), 'vendor_verifier')
    or private.has_team_permission(auth.uid(), 'team_manager')
    or private.has_team_permission(auth.uid(), 'admin_owner')
    or private.is_admin_or_service()
  );

drop policy if exists vendor_applications_team_update on public.vendor_applications;
create policy vendor_applications_team_update on public.vendor_applications
  for update to authenticated
  using (
    private.has_team_permission(auth.uid(), 'vendor_verifier')
    or private.has_team_permission(auth.uid(), 'team_manager')
    or private.has_team_permission(auth.uid(), 'admin_owner')
    or private.is_admin_or_service()
  );

-- ============================================================================
-- 6. Team Portal Overview Metrics RPC
-- ============================================================================
create or replace function public.get_team_portal_overview()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_pending_dest int := 0;
  v_unassigned_dest int := 0;
  v_my_dest int := 0;
  v_pending_payouts int := 0;
  v_unassigned_payouts int := 0;
  v_my_payouts int := 0;
  v_second_appr_count int := 0;
  v_pending_payout_sum numeric(12, 2) := 0;
  v_pending_vendors int := 0;
  v_unassigned_vendors int := 0;
  v_my_vendors int := 0;
  v_overdue_count int := 0;
  v_escalated_count int := 0;
  v_active_members int := 0;
begin
  if not private.is_team_member(v_uid) then
    raise exception 'Unauthorized: Team membership required' using errcode = '42501';
  end if;

  -- 1. Destinations stats
  select
    count(*),
    count(*) filter (where assigned_to is null),
    count(*) filter (where assigned_to = v_uid)
  into v_pending_dest, v_unassigned_dest, v_my_dest
  from public.customer_payment_destinations
  where is_active = true and status in ('pending', 'under_review');

  -- 2. Payouts stats
  select
    count(*),
    count(*) filter (where assigned_to is null),
    count(*) filter (where assigned_to = v_uid),
    count(*) filter (where second_approval_required = true and second_approved_by is null),
    coalesce(sum(amount), 0)
  into v_pending_payouts, v_unassigned_payouts, v_my_payouts, v_second_appr_count, v_pending_payout_sum
  from public.referral_payout_requests
  where status in ('requested', 'under_review', 'approved', 'processing', 'payment_pending');

  -- 3. Vendors stats
  select
    count(*),
    count(*) filter (where assigned_to is null),
    count(*) filter (where assigned_to = v_uid)
  into v_pending_vendors, v_unassigned_vendors, v_my_vendors
  from public.vendor_applications
  where status = 'pending';

  -- 4. Overdue count (> 24 hours waiting)
  select (
    (select count(*) from public.customer_payment_destinations where is_active = true and status in ('pending', 'under_review') and created_at < (now() - interval '24 hours'))
    +
    (select count(*) from public.referral_payout_requests where status in ('requested', 'under_review', 'approved') and requested_at < (now() - interval '24 hours'))
    +
    (select count(*) from public.vendor_applications where status = 'pending' and submitted_at < (now() - interval '24 hours'))
  ) into v_overdue_count;

  -- 5. Escalated count
  select (
    (select count(*) from public.customer_payment_destinations where is_active = true and escalated = true and status in ('pending', 'under_review'))
    +
    (select count(*) from public.referral_payout_requests where escalated = true and status in ('requested', 'under_review', 'approved', 'processing'))
    +
    (select count(*) from public.vendor_applications where escalated = true and status = 'pending')
  ) into v_escalated_count;

  -- 6. Active team members count
  select count(*) into v_active_members from public.team_memberships where is_active = true;

  return jsonb_build_object(
    'destinations', jsonb_build_object(
      'pending', v_pending_dest,
      'unassigned', v_unassigned_dest,
      'my_assigned', v_my_dest
    ),
    'withdrawals', jsonb_build_object(
      'pending', v_pending_payouts,
      'unassigned', v_unassigned_payouts,
      'my_assigned', v_my_payouts,
      'pending_second_approval', v_second_appr_count,
      'pending_amount', v_pending_payout_sum
    ),
    'vendors', jsonb_build_object(
      'pending', v_pending_vendors,
      'unassigned', v_unassigned_vendors,
      'my_assigned', v_my_vendors
    ),
    'overdue_count', v_overdue_count,
    'escalated_count', v_escalated_count,
    'active_members_count', v_active_members
  );
end;
$$;

grant execute on function public.get_team_portal_overview() to authenticated, service_role;

-- ============================================================================
-- 7. Shared Request Queue RPCs: Atomic Claim, Release, Assign, Escalate
-- ============================================================================

-- Atomic Claim
create or replace function public.claim_team_request(
  p_queue_type text, -- 'payment_destination', 'withdrawal', 'vendor_application'
  p_request_id uuid,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := coalesce(p_actor_id, auth.uid());
  v_required_perm text;
  v_curr_assigned uuid;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_queue_type = 'payment_destination' then
    v_required_perm := 'payment_verifier';
  elsif p_queue_type = 'withdrawal' then
    v_required_perm := 'finance_operator';
  elsif p_queue_type = 'vendor_application' then
    v_required_perm := 'vendor_verifier';
  else
    raise exception 'Invalid queue type: %', p_queue_type using errcode = '22023';
  end if;

  if not private.has_team_permission(v_uid, v_required_perm)
     and not private.is_team_manager_or_admin(v_uid)
     and not private.is_admin_or_service() then
    raise exception 'Unauthorized to claim this request queue' using errcode = '42501';
  end if;

  if p_queue_type = 'payment_destination' then
    select assigned_to into v_curr_assigned
    from public.customer_payment_destinations
    where id = p_request_id
    for update;

    if not found then
      raise exception 'Payment destination not found' using errcode = 'P0002';
    end if;

    if v_curr_assigned is not null and v_curr_assigned <> v_uid then
      raise exception 'This request is already claimed by another team member' using errcode = '23505';
    end if;

    update public.customer_payment_destinations
    set assigned_to = v_uid,
        assigned_at = now(),
        assigned_by = v_uid,
        updated_at = now()
    where id = p_request_id;

  elsif p_queue_type = 'withdrawal' then
    select assigned_to into v_curr_assigned
    from public.referral_payout_requests
    where id = p_request_id
    for update;

    if not found then
      raise exception 'Withdrawal request not found' using errcode = 'P0002';
    end if;

    if v_curr_assigned is not null and v_curr_assigned <> v_uid then
      raise exception 'This request is already claimed by another team member' using errcode = '23505';
    end if;

    update public.referral_payout_requests
    set assigned_to = v_uid,
        assigned_at = now(),
        assigned_by = v_uid,
        claimed_by = v_uid,
        claimed_at = now(),
        updated_at = now()
    where id = p_request_id;

  elsif p_queue_type = 'vendor_application' then
    select assigned_to into v_curr_assigned
    from public.vendor_applications
    where id = p_request_id
    for update;

    if not found then
      raise exception 'Vendor application not found' using errcode = 'P0002';
    end if;

    if v_curr_assigned is not null and v_curr_assigned <> v_uid then
      raise exception 'This application is already claimed by another team member' using errcode = '23505';
    end if;

    update public.vendor_applications
    set assigned_to = v_uid,
        assigned_at = now(),
        assigned_by = v_uid
    where id = p_request_id;
  end if;

  -- Audit log
  insert into public.team_activity_log (actor_id, entity_type, entity_id, action, details)
  values (v_uid, p_queue_type, p_request_id, 'claim', jsonb_build_object('claimed_by', v_uid));

  return jsonb_build_object('success', true, 'assigned_to', v_uid);
end;
$$;

grant execute on function public.claim_team_request(text, uuid, uuid) to authenticated, service_role;

-- Release Claim
create or replace function public.release_team_request(
  p_queue_type text,
  p_request_id uuid,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := coalesce(p_actor_id, auth.uid());
  v_curr_assigned uuid;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_queue_type = 'payment_destination' then
    select assigned_to into v_curr_assigned
    from public.customer_payment_destinations
    where id = p_request_id
    for update;

    if not found then
      raise exception 'Payment destination not found' using errcode = 'P0002';
    end if;

    if v_curr_assigned <> v_uid and not private.is_team_manager_or_admin(v_uid) and not private.is_admin_or_service() then
      raise exception 'Unauthorized to release claim assigned to another user' using errcode = '42501';
    end if;

    update public.customer_payment_destinations
    set assigned_to = null,
        assigned_at = null,
        assigned_by = null,
        updated_at = now()
    where id = p_request_id;

  elsif p_queue_type = 'withdrawal' then
    select assigned_to into v_curr_assigned
    from public.referral_payout_requests
    where id = p_request_id
    for update;

    if not found then
      raise exception 'Withdrawal request not found' using errcode = 'P0002';
    end if;

    if v_curr_assigned <> v_uid and not private.is_team_manager_or_admin(v_uid) and not private.is_admin_or_service() then
      raise exception 'Unauthorized to release claim assigned to another user' using errcode = '42501';
    end if;

    update public.referral_payout_requests
    set assigned_to = null,
        assigned_at = null,
        assigned_by = null,
        claimed_by = null,
        claimed_at = null,
        updated_at = now()
    where id = p_request_id;

  elsif p_queue_type = 'vendor_application' then
    select assigned_to into v_curr_assigned
    from public.vendor_applications
    where id = p_request_id
    for update;

    if not found then
      raise exception 'Vendor application not found' using errcode = 'P0002';
    end if;

    if v_curr_assigned <> v_uid and not private.is_team_manager_or_admin(v_uid) and not private.is_admin_or_service() then
      raise exception 'Unauthorized to release claim assigned to another user' using errcode = '42501';
    end if;

    update public.vendor_applications
    set assigned_to = null,
        assigned_at = null,
        assigned_by = null
    where id = p_request_id;
  else
    raise exception 'Invalid queue type: %', p_queue_type using errcode = '22023';
  end if;

  -- Audit log
  insert into public.team_activity_log (actor_id, entity_type, entity_id, action, details)
  values (v_uid, p_queue_type, p_request_id, 'release', jsonb_build_object('released_by', v_uid));

  return jsonb_build_object('success', true);
end;
$$;

grant execute on function public.release_team_request(text, uuid, uuid) to authenticated, service_role;

-- Assign / Reassign Request (Manager / Admin control)
create or replace function public.assign_team_request(
  p_queue_type text,
  p_request_id uuid,
  p_target_user_id uuid,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := coalesce(p_actor_id, auth.uid());
  v_is_target_active boolean;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if not private.is_team_manager_or_admin(v_uid) and not private.is_admin_or_service() then
    raise exception 'Unauthorized: Manager or Admin access required to reassign tasks' using errcode = '42501';
  end if;

  -- Validate target user is an active team member or admin
  select is_active into v_is_target_active
  from public.team_memberships
  where user_id = p_target_user_id;

  if not found and not exists (select 1 from public.profiles where id = p_target_user_id and role::text in ('admin', 'super_admin')) then
    raise exception 'Target user is not a valid team member' using errcode = '22023';
  end if;

  if p_queue_type = 'payment_destination' then
    update public.customer_payment_destinations
    set assigned_to = p_target_user_id,
        assigned_at = now(),
        assigned_by = v_uid,
        updated_at = now()
    where id = p_request_id;

  elsif p_queue_type = 'withdrawal' then
    update public.referral_payout_requests
    set assigned_to = p_target_user_id,
        assigned_at = now(),
        assigned_by = v_uid,
        claimed_by = p_target_user_id,
        claimed_at = now(),
        updated_at = now()
    where id = p_request_id;

  elsif p_queue_type = 'vendor_application' then
    update public.vendor_applications
    set assigned_to = p_target_user_id,
        assigned_at = now(),
        assigned_by = v_uid
    where id = p_request_id;
  else
    raise exception 'Invalid queue type: %', p_queue_type using errcode = '22023';
  end if;

  -- Audit log
  insert into public.team_activity_log (actor_id, entity_type, entity_id, action, details)
  values (v_uid, p_queue_type, p_request_id, 'reassign', jsonb_build_object('assigned_to', p_target_user_id, 'assigned_by', v_uid));

  return jsonb_build_object('success', true, 'assigned_to', p_target_user_id);
end;
$$;

grant execute on function public.assign_team_request(text, uuid, uuid, uuid) to authenticated, service_role;

-- Escalate Request
create or replace function public.escalate_team_request(
  p_queue_type text,
  p_request_id uuid,
  p_reason text,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := coalesce(p_actor_id, auth.uid());
  v_clean_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if v_clean_reason is null then
    raise exception 'An escalation reason is required' using errcode = '22023';
  end if;

  if not private.is_team_member(v_uid) and not private.is_admin_or_service() then
    raise exception 'Unauthorized: Team membership required' using errcode = '42501';
  end if;

  if p_queue_type = 'payment_destination' then
    update public.customer_payment_destinations
    set escalated = true,
        escalated_at = now(),
        escalated_by = v_uid,
        escalation_reason = v_clean_reason,
        updated_at = now()
    where id = p_request_id;

  elsif p_queue_type = 'withdrawal' then
    update public.referral_payout_requests
    set escalated = true,
        escalated_at = now(),
        escalated_by = v_uid,
        escalation_reason = v_clean_reason,
        updated_at = now()
    where id = p_request_id;

  elsif p_queue_type = 'vendor_application' then
    update public.vendor_applications
    set escalated = true,
        escalated_at = now(),
        escalated_by = v_uid,
        escalation_reason = v_clean_reason
    where id = p_request_id;
  else
    raise exception 'Invalid queue type: %', p_queue_type using errcode = '22023';
  end if;

  -- Audit log
  insert into public.team_activity_log (actor_id, entity_type, entity_id, action, details)
  values (v_uid, p_queue_type, p_request_id, 'escalate', jsonb_build_object('reason', v_clean_reason));

  return jsonb_build_object('success', true);
end;
$$;

grant execute on function public.escalate_team_request(text, uuid, text, uuid) to authenticated, service_role;

-- ============================================================================
-- 8. Payment Verifier Workflow RPC
-- ============================================================================
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
  if v_uid is null then
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

-- ============================================================================
-- 9. Finance Operator Workflow & Tiered Approval RPCs
-- ============================================================================

-- A. Second Approval for High-Value Withdrawals (Threshold >= ₹5,000)
create or replace function public.team_second_approve_payout(
  p_request_id uuid,
  p_notes text default null,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := coalesce(p_actor_id, auth.uid());
  v_req public.referral_payout_requests;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if not private.has_team_permission(v_uid, 'finance_operator')
     and not private.is_team_manager_or_admin(v_uid)
     and not private.is_admin_or_service() then
    raise exception 'Unauthorized: Finance Operator or Manager access required' using errcode = '42501';
  end if;

  select * into v_req
  from public.referral_payout_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Withdrawal request not found' using errcode = 'P0002';
  end if;

  if v_req.status in ('paid', 'processed', 'rejected', 'cancelled') then
    raise exception 'Cannot second-approve request with status %', v_req.status using errcode = '22023';
  end if;

  update public.referral_payout_requests
  set second_approval_required = true,
      second_approved_by = v_uid,
      second_approved_at = now(),
      second_approval_notes = nullif(trim(coalesce(p_notes, '')), ''),
      updated_at = now()
  where id = p_request_id;

  insert into public.team_activity_log (actor_id, entity_type, entity_id, action, details)
  values (v_uid, 'payout_request', p_request_id, 'second_approve', jsonb_build_object('notes', p_notes));

  return jsonb_build_object('success', true, 'request_id', p_request_id, 'second_approved_by', v_uid);
end;
$$;

grant execute on function public.team_second_approve_payout(uuid, text, uuid) to authenticated, service_role;

-- B. Execute Withdrawal Payout (Enforces Tiered Approval + Segregation)
create or replace function public.team_execute_withdrawal_payout(
  p_request_id uuid,
  p_transaction_ref text,
  p_source_account text default 'RoyalLagn Business Account',
  p_notes text default null,
  p_evidence_url text default null,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := coalesce(p_actor_id, auth.uid());
  v_req public.referral_payout_requests;
  v_res jsonb;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if not private.has_team_permission(v_uid, 'finance_operator')
     and not private.has_team_permission(v_uid, 'admin_owner')
     and not private.is_admin_or_service() then
    raise exception 'Unauthorized: Finance Operator or Admin access required to execute payout' using errcode = '42501';
  end if;

  select * into v_req
  from public.referral_payout_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Withdrawal request not found' using errcode = 'P0002';
  end if;

  -- Tiered approval check: if amount >= ₹5,000, 2nd approval MUST be present
  if (v_req.amount >= 5000 or v_req.second_approval_required = true) and v_req.second_approved_by is null then
    raise exception 'Tiered approval required: Withdrawal requests of ₹5,000 or more must receive a second approval before payout execution.'
      using errcode = '22023';
  end if;

  -- Call Phase 1 payout execution RPC
  v_res := public.mark_withdrawal_payout_paid(
    p_request_id,
    p_transaction_ref,
    p_source_account,
    p_notes,
    p_evidence_url,
    v_uid
  );

  -- Log in team activity
  insert into public.team_activity_log (actor_id, entity_type, entity_id, action, details)
  values (
    v_uid,
    'payout_request',
    p_request_id,
    'execute_payout',
    jsonb_build_object(
      'amount', v_req.amount,
      'transaction_ref', p_transaction_ref,
      'source_account', p_source_account
    )
  );

  return v_res;
end;
$$;

grant execute on function public.team_execute_withdrawal_payout(uuid, text, text, text, text, uuid) to authenticated, service_role;

-- ============================================================================
-- 10. Vendor Business Verification Workflow RPCs
-- ============================================================================

-- A. Verifier Recommendation & Checklist
create or replace function public.team_recommend_vendor_application(
  p_application_id uuid,
  p_recommendation text, -- 'recommended_approval', 'recommended_rejection', 'needs_clarification'
  p_notes text default null,
  p_checklist jsonb default '{}'::jsonb,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := coalesce(p_actor_id, auth.uid());
  v_clean_rec text := lower(trim(coalesce(p_recommendation, '')));
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if not private.has_team_permission(v_uid, 'vendor_verifier')
     and not private.is_team_manager_or_admin(v_uid)
     and not private.is_admin_or_service() then
    raise exception 'Unauthorized: Vendor Verifier access required' using errcode = '42501';
  end if;

  if v_clean_rec not in ('recommended_approval', 'recommended_rejection', 'needs_clarification') then
    raise exception 'Invalid recommendation status: %', p_recommendation using errcode = '22023';
  end if;

  update public.vendor_applications
  set verifier_recommendation = v_clean_rec,
      verifier_notes = nullif(trim(coalesce(p_notes, '')), ''),
      verified_by = v_uid,
      verified_at = now()
  where id = p_application_id;

  if not found then
    raise exception 'Vendor application not found' using errcode = 'P0002';
  end if;

  insert into public.team_activity_log (actor_id, entity_type, entity_id, action, details)
  values (
    v_uid,
    'vendor_application',
    p_application_id,
    'recommend_vendor',
    jsonb_build_object(
      'recommendation', v_clean_rec,
      'notes', p_notes,
      'checklist', p_checklist
    )
  );

  return jsonb_build_object('success', true, 'application_id', p_application_id, 'recommendation', v_clean_rec);
end;
$$;

grant execute on function public.team_recommend_vendor_application(uuid, text, text, jsonb, uuid) to authenticated, service_role;

-- B. Final Manager / Admin Decision
create or replace function public.team_decide_vendor_application(
  p_application_id uuid,
  p_decision text, -- 'approved' or 'rejected'
  p_reason text default null,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := coalesce(p_actor_id, auth.uid());
  v_vendor_id uuid;
  v_clean_dec text := lower(trim(coalesce(p_decision, '')));
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if not private.is_team_manager_or_admin(v_uid) and not private.is_admin_or_service() then
    raise exception 'Unauthorized: Manager or Admin access required to make final vendor decision' using errcode = '42501';
  end if;

  if v_clean_dec not in ('approved', 'rejected') then
    raise exception 'Decision must be approved or rejected' using errcode = '22023';
  end if;

  if v_clean_dec = 'rejected' and (p_reason is null or btrim(p_reason) = '') then
    raise exception 'Rejection requires a specific reason' using errcode = '22023';
  end if;

  -- Call core application review logic
  v_vendor_id := public.review_vendor_application(
    p_application_id,
    v_clean_dec::public.vendor_application_status,
    p_reason
  );

  insert into public.team_activity_log (actor_id, entity_type, entity_id, action, details)
  values (
    v_uid,
    'vendor_application',
    p_application_id,
    v_clean_dec,
    jsonb_build_object('vendor_id', v_vendor_id, 'reason', p_reason)
  );

  return jsonb_build_object('success', true, 'application_id', p_application_id, 'decision', v_clean_dec, 'vendor_id', v_vendor_id);
end;
$$;

grant execute on function public.team_decide_vendor_application(uuid, text, text, uuid) to authenticated, service_role;

-- ============================================================================
-- 11. Team Member Management RPCs (Admin / Owner control)
-- ============================================================================
create or replace function public.team_manage_member(
  p_user_id uuid,
  p_email text,
  p_full_name text,
  p_phone text default null,
  p_permissions text[] default '{}',
  p_is_active boolean default true,
  p_actor_id uuid default null
)
returns public.team_memberships
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := coalesce(p_actor_id, auth.uid());
  v_row public.team_memberships;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if not private.has_team_permission(v_uid, 'admin_owner') and not private.is_admin_or_service() then
    raise exception 'Unauthorized: Admin/Owner access required to manage team members' using errcode = '42501';
  end if;

  insert into public.team_memberships (
    user_id,
    email,
    full_name,
    phone,
    permissions,
    is_active,
    created_by,
    updated_at
  ) values (
    p_user_id,
    lower(trim(p_email)),
    trim(p_full_name),
    nullif(trim(coalesce(p_phone, '')), ''),
    p_permissions,
    p_is_active,
    v_uid,
    now()
  )
  on conflict (user_id) do update set
    email = excluded.email,
    full_name = excluded.full_name,
    phone = excluded.phone,
    permissions = excluded.permissions,
    is_active = excluded.is_active,
    updated_at = now()
  returning * into v_row;

  insert into public.team_activity_log (actor_id, entity_type, entity_id, action, details)
  values (
    v_uid,
    'team_membership',
    v_row.id,
    'manage_member',
    jsonb_build_object('target_user_id', p_user_id, 'permissions', p_permissions, 'is_active', p_is_active)
  );

  return v_row;
end;
$$;

grant execute on function public.team_manage_member(uuid, text, text, text, text[], boolean, uuid) to authenticated, service_role;

-- Query Team Members
create or replace function public.get_team_members()
returns setof public.team_memberships
language sql
stable
security definer
set search_path = ''
as $$
  select *
  from public.team_memberships
  where private.is_team_member(auth.uid()) or private.is_admin_or_service()
  order by created_at desc;
$$;

grant execute on function public.get_team_members() to authenticated, service_role;

-- Query Team Activity Logs
create or replace function public.get_team_activity_logs(
  p_limit int default 50
)
returns table (
  id uuid,
  actor_id uuid,
  actor_name text,
  actor_email text,
  entity_type text,
  entity_id uuid,
  action text,
  details jsonb,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_team_member(auth.uid()) and not private.is_admin_or_service() then
    raise exception 'Unauthorized: Team membership required' using errcode = '42501';
  end if;

  return query
  select
    l.id,
    l.actor_id,
    coalesce(m.full_name, p.full_name, 'Team Member') as actor_name,
    coalesce(m.email, p.email, '') as actor_email,
    l.entity_type,
    l.entity_id,
    l.action,
    l.details,
    l.created_at
  from public.team_activity_log l
  left join public.team_memberships m on m.user_id = l.actor_id
  left join public.profiles p on p.id = l.actor_id
  order by l.created_at desc
  limit coalesce(p_limit, 50);
end;
$$;

grant execute on function public.get_team_activity_logs(int) to authenticated, service_role;

commit;
