-- Migration: 20261009163000_strict_team_permission_actor_check.sql
-- Strictly enforces role-based access control based on the actor's team permissions

begin;

-- 1. team_review_customer_payment_destination
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
     and not private.is_team_manager_or_admin(v_uid) then
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

-- 2. team_execute_withdrawal_payout
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
     and not private.has_team_permission(v_uid, 'admin_owner') then
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

commit;
