-- Migration: 20261009180000_team_update_withdrawal_payout_status.sql
-- Adds support for updating withdrawal payout requests across 3 statuses:
-- 'processing', 'payment_pending', 'paid' with team permission authorization,
-- automatic ledger reconciliation, audit logging, and customer notifications.

begin;

create or replace function public.team_update_withdrawal_payout_status(
  p_request_id uuid,
  p_status text,
  p_transaction_ref text default null,
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
  v_clean_utr text := trim(coalesce(p_transaction_ref, ''));
  v_clean_src text := trim(coalesce(p_source_account, 'RoyalLagn Business Account'));
  v_res jsonb;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if not private.has_team_permission(v_uid, 'finance_operator')
     and not private.has_team_permission(v_uid, 'admin_owner')
     and not private.is_admin() then
    raise exception 'Unauthorized: Finance Operator or Admin access required to update payout status' using errcode = '42501';
  end if;

  select * into v_req
  from public.referral_payout_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Withdrawal request not found' using errcode = 'P0002';
  end if;

  if p_status not in ('processing', 'payment_pending', 'paid') then
    raise exception 'Invalid payout status. Allowed values: processing, payment_pending, paid' using errcode = '22023';
  end if;

  -- If status is 'paid', delegate to team_execute_withdrawal_payout
  if p_status = 'paid' then
    return public.team_execute_withdrawal_payout(
      p_request_id,
      p_transaction_ref,
      v_clean_src,
      p_notes,
      p_evidence_url,
      v_uid
    );
  end if;

  -- For 'processing' or 'payment_pending':
  if v_req.status in ('paid', 'processed') then
    raise exception 'This withdrawal request has already been completed and paid.' using errcode = '22023';
  end if;

  if v_req.status in ('rejected', 'cancelled', 'failed', 'reversed') then
    raise exception 'Cannot change status of a % request', v_req.status using errcode = '22023';
  end if;

  update public.referral_payout_requests
  set status = p_status,
      business_source_account = coalesce(nullif(v_clean_src, ''), business_source_account),
      reconciliation_notes = coalesce(nullif(trim(p_notes), ''), reconciliation_notes),
      transaction_ref = coalesce(nullif(v_clean_utr, ''), transaction_ref),
      payment_evidence_url = coalesce(nullif(trim(p_evidence_url), ''), payment_evidence_url),
      reviewed_by = coalesce(reviewed_by, v_uid),
      reviewed_at = coalesce(reviewed_at, now()),
      updated_at = now()
  where id = p_request_id;

  -- Reconcile balances to guarantee reserved balance accurately reflects current active status
  perform public.reconcile_referral_profile_balances(v_req.customer_id);

  -- Log in team activity
  insert into public.team_activity_log (actor_id, entity_type, entity_id, action, details)
  values (
    v_uid,
    'payout_request',
    p_request_id,
    'update_payout_status',
    jsonb_build_object(
      'previous_status', v_req.status,
      'new_status', p_status,
      'notes', p_notes,
      'source_account', v_clean_src,
      'transaction_ref', v_clean_utr
    )
  );

  -- Customer Notification if status changes
  insert into public.customer_notifications (
    customer_id,
    type,
    title,
    message,
    target_path,
    metadata
  ) values (
    v_req.customer_id,
    case when p_status = 'processing' then 'withdrawal_processing' else 'withdrawal_pending' end,
    case when p_status = 'processing' then 'Withdrawal Processing' else 'Withdrawal Payment Pending' end,
    case
      when p_status = 'processing' then 'Your withdrawal of ₹' || v_req.amount::text || ' is being processed by our finance team.'
      else 'Your withdrawal of ₹' || v_req.amount::text || ' is pending final bank transfer.'
    end,
    '/(tabs)/referral',
    jsonb_build_object(
      'request_id', p_request_id,
      'amount', v_req.amount,
      'status', p_status
    )
  );

  return jsonb_build_object(
    'success', true,
    'request_id', p_request_id,
    'amount', v_req.amount,
    'status', p_status
  );
end;
$$;

grant execute on function public.team_update_withdrawal_payout_status(uuid, text, text, text, text, text, uuid) to authenticated, service_role;

commit;
