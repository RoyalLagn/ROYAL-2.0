-- Migration: 20261009150000_referral_payout_rpcs_enhancement.sql
-- Enhances Phase 1 referral payout RPCs to support optional p_customer_id and p_admin_id for service-role & admin tools

begin;

-- ============================================================================
-- 1. Drop existing functions to allow return-type and parameter signature update
-- ============================================================================
drop function if exists public.reconcile_referral_profile_balances(uuid);
drop function if exists public.submit_customer_payment_destination(text, text, text, text, boolean);
drop function if exists public.submit_customer_payment_destination(text, text, text, text, boolean, uuid);
drop function if exists public.request_referral_withdrawal(numeric);
drop function if exists public.request_referral_withdrawal(numeric, uuid);
drop function if exists public.cancel_customer_referral_withdrawal(uuid);
drop function if exists public.cancel_customer_referral_withdrawal(uuid, uuid);
drop function if exists public.review_customer_payment_destination(uuid, text, text, text, text);
drop function if exists public.review_customer_payment_destination(uuid, text, text, text, text, uuid);
drop function if exists public.claim_withdrawal_payout(uuid);
drop function if exists public.claim_withdrawal_payout(uuid, uuid);
drop function if exists public.release_withdrawal_claim(uuid);
drop function if exists public.release_withdrawal_claim(uuid, uuid);
drop function if exists public.mark_withdrawal_payout_paid(uuid, text, text, text, text);
drop function if exists public.mark_withdrawal_payout_paid(uuid, text, text, text, text, uuid);
drop function if exists public.reject_withdrawal_payout(uuid, text);
drop function if exists public.reject_withdrawal_payout(uuid, text, uuid);
drop function if exists public.mark_withdrawal_payment_pending(uuid, text);
drop function if exists public.mark_withdrawal_payment_pending(uuid, text, uuid);
drop function if exists public.reconcile_withdrawal_failure_or_reversal(uuid, text, text, text);
drop function if exists public.reconcile_withdrawal_failure_or_reversal(uuid, text, text, text, uuid);

-- ============================================================================
-- 2. Atomic Ledger Reconciliation (Returns updated referral_profiles row)
-- ============================================================================
create or replace function public.reconcile_referral_profile_balances(p_customer_id uuid)
returns public.referral_profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pending numeric(12, 2);
  v_earned_gross numeric(12, 2);
  v_paid numeric(12, 2);
  v_reserved numeric(12, 2);
  v_succ_count int;
  v_tot_count int;
  v_prof public.referral_profiles;
begin
  if p_customer_id is null then
    return null;
  end if;

  -- 1. Pending referral commissions
  select coalesce(sum(referrer_reward), 0)
  into v_pending
  from public.referral_commissions
  where referrer_id = p_customer_id and status = 'pending';

  -- 2. Total earned commissions
  select coalesce(sum(referrer_reward), 0)
  into v_earned_gross
  from public.referral_commissions
  where referrer_id = p_customer_id and status = 'earned';

  -- 3. Total paid out withdrawals
  select coalesce(sum(amount), 0)
  into v_paid
  from public.referral_payout_requests
  where customer_id = p_customer_id and status in ('paid', 'processed');

  -- 4. Reserved balance currently locked in active withdrawal requests
  select coalesce(sum(amount), 0)
  into v_reserved
  from public.referral_payout_requests
  where customer_id = p_customer_id and status in ('requested', 'under_review', 'approved', 'processing', 'payment_pending');

  -- 5. Successful referrals count
  select coalesce(count(*), 0)
  into v_succ_count
  from public.referral_commissions
  where referrer_id = p_customer_id and status = 'earned';

  -- 6. Total attributed referrals count
  select greatest(
    coalesce((select count(*) from public.referral_attributions where referrer_customer_id = p_customer_id), 0),
    v_succ_count
  ) into v_tot_count;

  -- 7. Atomically write back to referral_profiles
  update public.referral_profiles
  set pending_earnings = v_pending,
      earned_balance = greatest(0, v_earned_gross - v_paid - v_reserved),
      reserved_balance = v_reserved,
      total_paid_out = v_paid,
      successful_referrals = v_succ_count,
      total_referrals = v_tot_count,
      updated_at = timezone('utc', now())
  where customer_id = p_customer_id
  returning * into v_prof;

  return v_prof;
end;
$$;

-- ============================================================================
-- 3. Customer Payment Destination Submission RPC
-- ============================================================================
create or replace function public.submit_customer_payment_destination(
  p_beneficiary_name text,
  p_upi_id text,
  p_qr_code_url text default null,
  p_mobile text default null,
  p_ownership_confirmed boolean default true,
  p_customer_id uuid default null
)
returns public.customer_payment_destinations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := coalesce(p_customer_id, auth.uid());
  v_clean_name text := trim(coalesce(p_beneficiary_name, ''));
  v_clean_upi text := lower(trim(coalesce(p_upi_id, '')));
  v_clean_mobile text := nullif(trim(coalesce(p_mobile, '')), '');
  v_clean_qr text := nullif(trim(coalesce(p_qr_code_url, '')), '');
  v_prev_rec public.customer_payment_destinations;
  v_new_rec public.customer_payment_destinations;
  v_next_version int := 1;
  v_has_active_withdrawal boolean;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_customer_id is not null and p_customer_id <> auth.uid() and not private.is_admin_or_service() then
    raise exception 'Unauthorized to submit for another user' using errcode = '42501';
  end if;

  if v_clean_name = '' then
    raise exception 'Account-holder beneficiary name is required' using errcode = '22023';
  end if;

  if v_clean_upi = '' or v_clean_upi not like '%@%' then
    raise exception 'A valid UPI ID is required (e.g. username@bank)' using errcode = '22023';
  end if;

  if p_ownership_confirmed is not true then
    raise exception 'You must confirm that this payment destination belongs to you' using errcode = '22023';
  end if;

  -- Block editing payment details if an active withdrawal is in progress
  select exists (
    select 1 from public.referral_payout_requests
    where customer_id = v_uid and status in ('requested', 'under_review', 'approved', 'processing', 'payment_pending')
  ) into v_has_active_withdrawal;

  if v_has_active_withdrawal then
    raise exception 'Cannot update payment details while a withdrawal request is currently active. Cancel the request first or wait for completion.'
      using errcode = '22023';
  end if;

  -- Get latest active row if any
  select * into v_prev_rec
  from public.customer_payment_destinations
  where customer_id = v_uid and is_active = true
  for update;

  if found then
    v_next_version := v_prev_rec.version + 1;
    -- Archive previous version
    update public.customer_payment_destinations
    set is_active = false,
        updated_at = now()
    where id = v_prev_rec.id;
  else
    select coalesce(max(version), 0) + 1 into v_next_version
    from public.customer_payment_destinations
    where customer_id = v_uid;
  end if;

  -- Insert fresh pending destination version
  insert into public.customer_payment_destinations (
    customer_id,
    version,
    beneficiary_name,
    upi_id,
    qr_code_url,
    mobile,
    ownership_confirmed,
    status,
    is_active
  ) values (
    v_uid,
    v_next_version,
    v_clean_name,
    v_clean_upi,
    v_clean_qr,
    v_clean_mobile,
    true,
    'pending',
    true
  )
  returning * into v_new_rec;

  -- Mirror onto referral_profiles for backward compatibility
  update public.referral_profiles
  set payout_beneficiary = v_clean_name,
      payout_mobile = coalesce(v_clean_mobile, v_clean_upi),
      updated_at = now()
  where customer_id = v_uid;

  return v_new_rec;
end;
$$;

-- ============================================================================
-- 4. Customer Withdrawal Request RPC (Atomic reservation & 1 active limit)
-- ============================================================================
create or replace function public.request_referral_withdrawal(
  p_amount numeric,
  p_customer_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := coalesce(p_customer_id, auth.uid());
  v_dest public.customer_payment_destinations;
  v_prof public.referral_profiles;
  v_req public.referral_payout_requests;
  v_clean_amt numeric(12, 2) := round(coalesce(p_amount, 0), 2);
  v_has_active boolean;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_customer_id is not null and p_customer_id <> auth.uid() and not private.is_admin_or_service() then
    raise exception 'Unauthorized to request for another user' using errcode = '42501';
  end if;

  if v_clean_amt < 500 then
    raise exception 'Minimum withdrawal amount is ₹500' using errcode = '22023';
  end if;

  -- 1. Check for active approved destination
  select * into v_dest
  from public.customer_payment_destinations
  where customer_id = v_uid and is_active = true;

  if not found or v_dest.status <> 'approved' then
    raise exception 'Your payment destination must be approved by the RoyalLagn team before requesting a withdrawal.'
      using errcode = '22023';
  end if;

  -- 2. Check for existing active withdrawal
  select exists (
    select 1 from public.referral_payout_requests
    where customer_id = v_uid and status in ('requested', 'under_review', 'approved', 'processing', 'payment_pending')
  ) into v_has_active;

  if v_has_active then
    raise exception 'You already have an active withdrawal request in progress. Only one request is allowed at a time.'
      using errcode = '22023';
  end if;

  -- 3. Lock referral profile and check available balance
  select * into v_prof
  from public.referral_profiles
  where customer_id = v_uid
  for update;

  if not found or coalesce(v_prof.earned_balance, 0) < v_clean_amt then
    raise exception 'Insufficient available balance. Your available balance is ₹%'
      , coalesce(v_prof.earned_balance, 0)
      using errcode = '22023';
  end if;

  -- 4. Create withdrawal request with immutable snapshot of destination
  insert into public.referral_payout_requests (
    customer_id,
    destination_id,
    amount,
    mobile,
    beneficiary_name,
    status,
    destination_snapshot,
    requested_at
  ) values (
    v_uid,
    v_dest.id,
    v_clean_amt,
    coalesce(v_dest.mobile, v_dest.upi_id),
    v_dest.beneficiary_name,
    'requested',
    jsonb_build_object(
      'destination_id', v_dest.id,
      'version', v_dest.version,
      'beneficiary_name', v_dest.beneficiary_name,
      'upi_id', v_dest.upi_id,
      'qr_code_url', v_dest.qr_code_url,
      'mobile', v_dest.mobile,
      'approved_at', v_dest.reviewed_at,
      'observed_recipient_name', v_dest.observed_recipient_name
    ),
    now()
  )
  returning * into v_req;

  -- Reconcile balances
  select * into v_prof from public.reconcile_referral_profile_balances(v_uid);

  -- Send customer in-app notification
  insert into public.customer_notifications (
    customer_id,
    type,
    title,
    message,
    target_path,
    metadata
  ) values (
    v_uid,
    'withdrawal_requested',
    'Withdrawal Requested: ₹' || v_clean_amt::text,
    'Your withdrawal request of ₹' || v_clean_amt::text || ' has been received. Our team will verify and transfer from the RoyalLagn business account.',
    '/(tabs)/referral',
    jsonb_build_object(
      'request_id', v_req.id,
      'amount', v_clean_amt,
      'upi_id', v_dest.upi_id
    )
  );

  return jsonb_build_object(
    'success', true,
    'request', row_to_json(v_req),
    'request_id', v_req.id,
    'amount', v_clean_amt,
    'status', 'requested',
    'balances', jsonb_build_object(
      'earned_balance', v_prof.earned_balance,
      'reserved_balance', v_prof.reserved_balance,
      'total_paid_out', v_prof.total_paid_out
    )
  );
end;
$$;

-- ============================================================================
-- 5. Customer Withdrawal Cancellation RPC
-- ============================================================================
create or replace function public.cancel_customer_referral_withdrawal(
  p_request_id uuid,
  p_customer_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := coalesce(p_customer_id, auth.uid());
  v_req public.referral_payout_requests;
  v_prof public.referral_profiles;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select * into v_req
  from public.referral_payout_requests
  where id = p_request_id and customer_id = v_uid
  for update;

  if not found then
    raise exception 'Withdrawal request not found' using errcode = 'P0002';
  end if;

  if v_req.status not in ('requested', 'under_review', 'approved') then
    raise exception 'This withdrawal request cannot be cancelled because it is already %', v_req.status
      using errcode = '22023';
  end if;

  update public.referral_payout_requests
  set status = 'cancelled',
      cancelled_at = now(),
      updated_at = now()
  where id = p_request_id;

  -- Reconcile balances (restores funds back to available)
  select * into v_prof from public.reconcile_referral_profile_balances(v_uid);

  return jsonb_build_object(
    'success', true,
    'request_id', p_request_id,
    'status', 'cancelled',
    'released_amount', v_req.amount,
    'balances', jsonb_build_object(
      'earned_balance', v_prof.earned_balance,
      'reserved_balance', v_prof.reserved_balance,
      'total_paid_out', v_prof.total_paid_out
    )
  );
end;
$$;

-- ============================================================================
-- 6. Admin RPC: Review Customer Payment Destination
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
  if not private.is_admin() and not private.is_admin_or_service() then
    raise exception 'Unauthorized: Admin access required' using errcode = '42501';
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
      jsonb_build_object('destination_id', v_dest.id, 'reason', v_clean_reason)
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'destination_id', p_destination_id,
    'status', v_clean_decision,
    'observed_recipient_name', v_dest.observed_recipient_name,
    'reviewed_by', v_admin_id,
    'reviewed_at', now()
  );
end;
$$;

-- ============================================================================
-- 7. Admin RPC: Claim Withdrawal Request
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
  if not private.is_admin() and not private.is_admin_or_service() then
    raise exception 'Unauthorized: Admin access required' using errcode = '42501';
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
    'claimed_by', v_admin_id,
    'status', 'processing'
  );
end;
$$;

-- ============================================================================
-- 8. Admin RPC: Release Claim on Withdrawal Request
-- ============================================================================
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
  if not private.is_admin() and not private.is_admin_or_service() then
    raise exception 'Unauthorized: Admin access required' using errcode = '42501';
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

-- ============================================================================
-- 9. Admin RPC: Mark Withdrawal Payout as Paid (Requires UTR)
-- ============================================================================
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
  if not private.is_admin() and not private.is_admin_or_service() then
    raise exception 'Unauthorized: Admin access required' using errcode = '42501';
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

  if v_req.status not in ('processing', 'approved', 'payment_pending') then
    raise exception 'Cannot mark as paid from % status', v_req.status using errcode = '22023';
  end if;

  -- Ensure UTR is not already used
  if exists (
    select 1 from public.referral_payout_requests
    where id <> p_request_id and transaction_ref = v_clean_utr and status = 'paid'
  ) then
    raise exception 'This transaction reference (UTR: %) has already been used on another payout record.', v_clean_utr
      using errcode = '23505';
  end if;

  update public.referral_payout_requests
  set status = 'paid',
      transaction_ref = v_clean_utr,
      business_source_account = v_clean_src,
      reconciliation_notes = nullif(trim(coalesce(p_notes, '')), ''),
      payment_evidence_url = nullif(trim(coalesce(p_evidence_url, '')), ''),
      processed_at = now(),
      paid_at = now(),
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
    'withdrawal_paid',
    'Withdrawal Completed: ₹' || v_req.amount::text,
    'Your referral withdrawal of ₹' || v_req.amount::text || ' has been transferred! Bank Ref (UTR): ' || v_clean_utr,
    '/(tabs)/referral',
    jsonb_build_object(
      'request_id', v_req.id,
      'amount', v_req.amount,
      'transaction_ref', v_clean_utr
    )
  );

  return jsonb_build_object(
    'success', true,
    'request_id', p_request_id,
    'status', 'paid',
    'transaction_ref', v_clean_utr,
    'paid_at', now()
  );
end;
$$;

-- ============================================================================
-- 10. Admin RPC: Reject Withdrawal Request
-- ============================================================================
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
  if not private.is_admin() and not private.is_admin_or_service() then
    raise exception 'Unauthorized: Admin access required' using errcode = '42501';
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
    'Withdrawal Request Rejected',
    'Your withdrawal request of ₹' || v_req.amount::text || ' was rejected: ' || v_clean_reason || '. The funds have been returned to your available balance.',
    '/(tabs)/referral',
    jsonb_build_object('request_id', v_req.id, 'reason', v_clean_reason)
  );

  return jsonb_build_object(
    'success', true,
    'request_id', p_request_id,
    'status', 'rejected',
    'released_amount', v_req.amount
  );
end;
$$;

-- ============================================================================
-- 11. Admin RPC: Mark Withdrawal as Payment Pending
-- ============================================================================
create or replace function public.mark_withdrawal_payment_pending(
  p_request_id uuid,
  p_notes text default null,
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
  if not private.is_admin() and not private.is_admin_or_service() then
    raise exception 'Unauthorized: Admin access required' using errcode = '42501';
  end if;

  select * into v_req
  from public.referral_payout_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Withdrawal request not found' using errcode = 'P0002';
  end if;

  if v_req.status not in ('processing', 'approved') then
    raise exception 'Cannot mark payment pending from % status', v_req.status using errcode = '22023';
  end if;

  update public.referral_payout_requests
  set status = 'payment_pending',
      reconciliation_notes = coalesce(nullif(trim(p_notes), ''), reconciliation_notes),
      updated_at = now()
  where id = p_request_id;

  return jsonb_build_object('success', true, 'request_id', p_request_id, 'status', 'payment_pending');
end;
$$;

-- ============================================================================
-- 12. Admin RPC: Reconcile Failure / Reversal
-- ============================================================================
create or replace function public.reconcile_withdrawal_failure_or_reversal(
  p_request_id uuid,
  p_status text, -- 'failed' or 'reversed'
  p_reason text,
  p_notes text default null,
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
  v_clean_status text := lower(trim(coalesce(p_status, '')));
  v_clean_reason text := trim(coalesce(p_reason, ''));
begin
  if not private.is_admin() and not private.is_admin_or_service() then
    raise exception 'Unauthorized: Admin access required' using errcode = '42501';
  end if;

  if v_clean_status not in ('failed', 'reversed') then
    raise exception 'Status must be failed or reversed' using errcode = '22023';
  end if;

  if v_clean_reason = '' then
    raise exception 'A reason is required' using errcode = '22023';
  end if;

  select * into v_req
  from public.referral_payout_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Withdrawal request not found' using errcode = 'P0002';
  end if;

  update public.referral_payout_requests
  set status = v_clean_status,
      reversal_reason = v_clean_reason,
      reconciliation_notes = coalesce(nullif(trim(p_notes), ''), reconciliation_notes),
      updated_at = now()
  where id = p_request_id;

  -- Reconcile balances
  perform public.reconcile_referral_profile_balances(v_req.customer_id);

  insert into public.customer_notifications (
    customer_id,
    type,
    title,
    message,
    target_path,
    metadata
  ) values (
    v_req.customer_id,
    'withdrawal_' || v_clean_status,
    'Withdrawal ' || initcap(v_clean_status),
    'Your referral withdrawal of ₹' || v_req.amount::text || ' was marked ' || v_clean_status || ': ' || v_clean_reason || '. The funds have been restored to your available balance.',
    '/(tabs)/referral',
    jsonb_build_object('request_id', v_req.id, 'status', v_clean_status, 'reason', v_clean_reason)
  );

  return jsonb_build_object(
    'success', true,
    'request_id', p_request_id,
    'status', v_clean_status,
    'restored_amount', v_req.amount
  );
end;
$$;

-- ============================================================================
-- 13. Grants
-- ============================================================================
grant execute on function public.reconcile_referral_profile_balances(uuid) to authenticated, anon, service_role;
grant execute on function public.submit_customer_payment_destination(text, text, text, text, boolean, uuid) to authenticated, anon, service_role;
grant execute on function public.request_referral_withdrawal(numeric, uuid) to authenticated, anon, service_role;
grant execute on function public.cancel_customer_referral_withdrawal(uuid, uuid) to authenticated, anon, service_role;
grant execute on function public.review_customer_payment_destination(uuid, text, text, text, text, uuid) to authenticated, anon, service_role;
grant execute on function public.claim_withdrawal_payout(uuid, uuid) to authenticated, anon, service_role;
grant execute on function public.release_withdrawal_claim(uuid, uuid) to authenticated, anon, service_role;
grant execute on function public.mark_withdrawal_payout_paid(uuid, text, text, text, text, uuid) to authenticated, anon, service_role;
grant execute on function public.reject_withdrawal_payout(uuid, text, uuid) to authenticated, anon, service_role;
grant execute on function public.mark_withdrawal_payment_pending(uuid, text, uuid) to authenticated, anon, service_role;
grant execute on function public.reconcile_withdrawal_failure_or_reversal(uuid, text, text, text, uuid) to authenticated, anon, service_role;

-- Table Grants for service_role
grant all on public.customer_payment_destinations to service_role;
grant all on public.referral_payout_requests to service_role;
grant all on public.referral_profiles to service_role;
grant all on public.referral_commissions to service_role;

commit;
