-- Migration: 20261009173000_allow_team_permissions_in_referral_rpcs.sql
-- Allows team members with authorized roles (payment_verifier, finance_operator, team_manager, admin_owner)
-- to execute verification and payout RPCs directly, without getting blocked by admin-only checks.

begin;

-- ============================================================================
-- 1. Evolve review_customer_payment_destination to accept payment_verifier team members
-- ============================================================================
create or replace function public.review_customer_payment_destination(
  p_destination_id uuid,
  p_decision text, -- 'approved' or 'changes_required'
  p_observed_name text default null,
  p_notes text default null,
  p_rejection_reason text default null,
  p_admin_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid := coalesce(p_admin_id, auth.uid());
  v_dest public.customer_payment_destinations;
  v_clean_decision text := lower(trim(coalesce(p_decision, '')));
  v_clean_observed text := nullif(trim(coalesce(p_observed_name, '')), '');
  v_clean_reason text := nullif(trim(coalesce(p_rejection_reason, '')), '');
  v_clean_notes text := nullif(trim(coalesce(p_notes, '')), '');
begin
  if not private.is_admin() and not private.is_admin_or_service()
     and not private.has_team_permission(v_admin_id, 'payment_verifier')
     and not private.is_team_manager_or_admin(v_admin_id) then
    raise exception 'Unauthorized: Admin or Payment Verifier access required' using errcode = '42501';
  end if;

  if v_clean_decision not in ('approved', 'changes_required') then
    raise exception 'Decision must be approved or changes_required' using errcode = '22023';
  end if;

  select * into v_dest
  from public.customer_payment_destinations
  where id = p_destination_id
  for update;

  if not found then
    raise exception 'Payment destination not found' using errcode = 'P0002';
  end if;

  if v_clean_decision = 'approved' and v_clean_observed is null then
    raise exception 'Approval requires recording the observed recipient name from the payment app.'
      using errcode = '22023';
  end if;

  if v_clean_decision = 'changes_required' and v_clean_reason is null then
    raise exception 'Rejection requires a specific reason.' using errcode = '22023';
  end if;

  update public.customer_payment_destinations
  set status = v_clean_decision,
      observed_recipient_name = coalesce(v_clean_observed, observed_recipient_name),
      review_notes = v_clean_notes,
      rejection_reason = case when v_clean_decision = 'changes_required' then v_clean_reason else null end,
      reviewed_by = v_admin_id,
      reviewed_at = now(),
      updated_at = now()
  where id = p_destination_id
  returning * into v_dest;

  -- In-app notification to customer
  if v_clean_decision = 'approved' then
    insert into public.customer_notifications (
      customer_id,
      type,
      title,
      message,
      target_path,
      metadata
    ) values (
      v_dest.customer_id,
      'payment_destination_approved',
      'Payment Details Approved',
      'Your payment details have been verified by the team. You can now request withdrawals from your available earnings.',
      '/(tabs)/referral',
      jsonb_build_object('destination_id', v_dest.id, 'upi_id', v_dest.upi_id)
    );
  else
    insert into public.customer_notifications (
      customer_id,
      type,
      title,
      message,
      target_path,
      metadata
    ) values (
      v_dest.customer_id,
      'payment_destination_rejected',
      'Payment Details Need Attention',
      'Changes required for your payment destination: ' || v_clean_reason,
      '/(tabs)/referral',
      jsonb_build_object('destination_id', v_dest.id, 'rejection_reason', v_clean_reason)
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'destination_id', v_dest.id,
    'status', v_dest.status,
    'observed_recipient_name', v_dest.observed_recipient_name,
    'reviewed_by', v_admin_id,
    'reviewed_at', v_dest.reviewed_at
  );
end;
$$;

-- ============================================================================
-- 2. Evolve Payout Operations for Finance Operators & Managers
-- ============================================================================
create or replace function public.claim_withdrawal_payout(
  p_request_id uuid,
  p_admin_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid := coalesce(p_admin_id, auth.uid());
  v_req public.referral_payout_requests;
begin
  if not private.is_admin() and not private.is_admin_or_service()
     and not private.has_team_permission(v_admin_id, 'finance_operator')
     and not private.is_team_manager_or_admin(v_admin_id) then
    raise exception 'Unauthorized: Admin or Finance Operator access required' using errcode = '42501';
  end if;

  select * into v_req
  from public.referral_payout_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Withdrawal request not found' using errcode = 'P0002';
  end if;

  if v_req.status not in ('requested', 'under_review', 'approved') then
    if v_req.status = 'processing' and v_req.claimed_by = v_admin_id then
      return jsonb_build_object('success', true, 'already_claimed_by_you', true, 'status', 'processing', 'claimed_by', v_admin_id);
    end if;
    raise exception 'Cannot claim request in % status', v_req.status using errcode = '22023';
  end if;

  update public.referral_payout_requests
  set status = 'processing',
      claimed_by = v_admin_id,
      claimed_at = now(),
      updated_at = now()
  where id = p_request_id;

  return jsonb_build_object(
    'success', true,
    'request_id', p_request_id,
    'status', 'processing',
    'claimed_by', v_admin_id,
    'claimed_at', now()
  );
end;
$$;

create or replace function public.release_withdrawal_claim(
  p_request_id uuid,
  p_admin_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid := coalesce(p_admin_id, auth.uid());
  v_req public.referral_payout_requests;
begin
  if not private.is_admin() and not private.is_admin_or_service()
     and not private.has_team_permission(v_admin_id, 'finance_operator')
     and not private.is_team_manager_or_admin(v_admin_id) then
    raise exception 'Unauthorized: Admin or Finance Operator access required' using errcode = '42501';
  end if;

  select * into v_req
  from public.referral_payout_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Withdrawal request not found' using errcode = 'P0002';
  end if;

  if v_req.status <> 'processing' then
    raise exception 'Only processing requests can be released' using errcode = '22023';
  end if;

  update public.referral_payout_requests
  set status = 'approved',
      claimed_by = null,
      claimed_at = null,
      updated_at = now()
  where id = p_request_id;

  return jsonb_build_object('success', true, 'request_id', p_request_id, 'status', 'approved', 'claimed_by', null);
end;
$$;

create or replace function public.mark_withdrawal_payout_paid(
  p_request_id uuid,
  p_transaction_ref text,
  p_source_account text default 'RoyalLagn Business UPI',
  p_notes text default null,
  p_evidence_url text default null,
  p_admin_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid := coalesce(p_admin_id, auth.uid());
  v_req public.referral_payout_requests;
  v_clean_utr text := trim(coalesce(p_transaction_ref, ''));
  v_clean_src text := trim(coalesce(p_source_account, 'RoyalLagn Business UPI'));
begin
  if not private.is_admin() and not private.is_admin_or_service()
     and not private.has_team_permission(v_admin_id, 'finance_operator')
     and not private.is_team_manager_or_admin(v_admin_id) then
    raise exception 'Unauthorized: Admin or Finance Operator access required' using errcode = '42501';
  end if;

  if v_clean_utr = '' then
    raise exception 'A valid bank transaction reference (UTR) is required to mark as Paid.'
      using errcode = '22023';
  end if;

  select * into v_req
  from public.referral_payout_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Withdrawal request not found' using errcode = 'P0002';
  end if;

  if v_req.status in ('paid', 'processed') then
    raise exception 'This withdrawal request has already been paid.' using errcode = '22023';
  end if;

  if v_req.status in ('rejected', 'cancelled', 'failed', 'reversed') then
    raise exception 'Cannot pay request in % status', v_req.status using errcode = '22023';
  end if;

  -- Verify UTR uniqueness
  if exists (
    select 1 from public.referral_payout_requests
    where id <> p_request_id
      and status in ('paid', 'processed')
      and lower(trim(transaction_ref)) = lower(v_clean_utr)
  ) then
    raise exception 'Transaction reference (UTR) "%" has already been used for another payout.', v_clean_utr
      using errcode = '23505';
  end if;

  update public.referral_payout_requests
  set status = 'paid',
      transaction_ref = v_clean_utr,
      business_source_account = v_clean_src,
      reconciliation_notes = coalesce(nullif(trim(p_notes), ''), reconciliation_notes),
      payment_evidence_url = coalesce(nullif(trim(p_evidence_url), ''), payment_evidence_url),
      approved_by = coalesce(approved_by, v_admin_id),
      approved_at = coalesce(approved_at, now()),
      paid_at = now(),
      processed_at = now(),
      updated_at = now()
  where id = p_request_id;

  -- Reconcile balances
  perform public.reconcile_referral_profile_balances(v_req.customer_id);

  -- Send notification
  insert into public.customer_notifications (
    customer_id,
    type,
    title,
    message,
    target_path,
    metadata
  ) values (
    v_req.customer_id,
    'withdrawal_paid',
    'Payout Transferred: ₹' || v_req.amount::text,
    'Your referral withdrawal of ₹' || v_req.amount::text || ' has been transferred from our business account. Bank Reference (UTR): ' || v_clean_utr,
    '/(tabs)/referral',
    jsonb_build_object(
      'request_id', p_request_id,
      'amount', v_req.amount,
      'transaction_ref', v_clean_utr,
      'paid_at', now()
    )
  );

  return jsonb_build_object(
    'success', true,
    'request_id', p_request_id,
    'amount', v_req.amount,
    'status', 'paid',
    'transaction_ref', v_clean_utr,
    'paid_at', now()
  );
end;
$$;

create or replace function public.reject_withdrawal_payout(
  p_request_id uuid,
  p_reason text,
  p_admin_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid := coalesce(p_admin_id, auth.uid());
  v_req public.referral_payout_requests;
  v_clean_reason text := trim(coalesce(p_reason, ''));
begin
  if not private.is_admin() and not private.is_admin_or_service()
     and not private.has_team_permission(v_admin_id, 'finance_operator')
     and not private.is_team_manager_or_admin(v_admin_id) then
    raise exception 'Unauthorized: Admin or Finance Operator access required' using errcode = '42501';
  end if;

  if v_clean_reason = '' then
    raise exception 'A rejection reason is required' using errcode = '22023';
  end if;

  select * into v_req
  from public.referral_payout_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Withdrawal request not found' using errcode = 'P0002';
  end if;

  if v_req.status not in ('requested', 'under_review', 'approved', 'processing') then
    raise exception 'Cannot reject request in % status', v_req.status using errcode = '22023';
  end if;

  update public.referral_payout_requests
  set status = 'rejected',
      rejection_reason = v_clean_reason,
      processed_at = now(),
      updated_at = now()
  where id = p_request_id;

  -- Reconcile balances
  perform public.reconcile_referral_profile_balances(v_req.customer_id);

  -- Notify customer
  insert into public.customer_notifications (
    customer_id,
    type,
    title,
    message,
    target_path,
    metadata
  ) values (
    v_req.customer_id,
    'withdrawal_rejected',
    'Withdrawal Request Declined',
    'Your withdrawal request of ₹' || v_req.amount::text || ' was not approved: ' || v_clean_reason || '. Reserved funds returned to your balance.',
    '/(tabs)/referral',
    jsonb_build_object(
      'request_id', p_request_id,
      'amount', v_req.amount,
      'reason', v_clean_reason
    )
  );

  return jsonb_build_object(
    'success', true,
    'request_id', p_request_id,
    'status', 'rejected',
    'rejection_reason', v_clean_reason
  );
end;
$$;

-- ============================================================================
-- 3. RLS Select Policies on Destinations & Payouts for Team Members
-- ============================================================================
drop policy if exists "customer_payment_destinations_select" on public.customer_payment_destinations;
create policy "customer_payment_destinations_select"
on public.customer_payment_destinations
for select to authenticated
using (
  customer_id = auth.uid()
  or private.is_admin()
  or private.is_admin_or_service()
  or private.is_team_member(auth.uid())
);

drop policy if exists "referral_payout_requests_select" on public.referral_payout_requests;
create policy "referral_payout_requests_select"
on public.referral_payout_requests
for select to authenticated
using (
  customer_id = auth.uid()
  or private.is_admin()
  or private.is_admin_or_service()
  or private.is_team_member(auth.uid())
);

commit;
